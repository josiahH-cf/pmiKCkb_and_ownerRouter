import { createHash } from "node:crypto";

import { getAuth } from "firebase-admin/auth";
import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";

import { readServerConfig } from "@/lib/config/server";
import { getFirebaseAdminApp } from "@/lib/firebase/admin";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  VENDOR_SETUP_CHALLENGE_COLLECTION,
  VendorSetupDependencyError,
  createVendorSetupChallenge,
  isValidVendorSetupChallenge,
  type VendorSetupAuth,
  type VendorSetupChallenge,
  type VendorSetupChallengeStore,
  type VendorSetupClaimResult,
} from "@/lib/vendor/live-setup";
import { LIVE_VENDOR_IDENTITY_CLAIM_COLLECTION } from "@/lib/vendor/live-lifecycle-contract";
import { assertExplicitProductionLive } from "@/lib/vendor/live-lifecycle-service";

export const FIREBASE_PASSWORD_RESET_ACTION_PATH = "/__/auth/action";
export const VENDOR_SETUP_EFFECT_FENCE_FIELD = "setupEffectFence";

interface VendorSetupEffectFence {
  schemaVersion: 1;
  tokenHash: string;
  claimIdHash: string;
  inviteVersion: number;
  lifecycleExecutionId: string;
  startedAt: string;
  dataMode: "live";
}

interface VendorIdentityClaim {
  schemaVersion: 1;
  emailHash: string;
  vendorRef: string;
  vendorUid: string;
  executionId: string;
  dataMode: "live";
}

function isAlreadyExists(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === 6 || error.code === "already-exists")
  );
}

function firebaseErrorCode(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}

function mapFirebaseError(error: unknown): never {
  const definitive = new Set([
    "auth/invalid-email",
    "auth/invalid-uid",
    "auth/user-disabled",
    "auth/user-not-found",
  ]).has(firebaseErrorCode(error) ?? "");
  throw new VendorSetupDependencyError(definitive);
}

function dataAsChallenge(data: DocumentData | undefined) {
  if (!data || typeof data !== "object") return null;
  return data as VendorSetupChallenge;
}

function exactPendingSetupVendor(
  data: DocumentData | undefined,
  vendorId: string,
  challenge: VendorSetupChallenge,
) {
  return (
    data !== undefined &&
    data.id === vendorId &&
    data.uid === challenge.uid &&
    data.status === "pending_setup" &&
    data.data_mode === "live" &&
    Number.isSafeInteger(data.inviteVersion) &&
    data.inviteVersion === challenge.inviteVersion
  );
}

function exactCurrentIdentityClaim(
  data: DocumentData | undefined,
  vendorId: string,
  challenge: VendorSetupChallenge,
) {
  const claim = data as VendorIdentityClaim | undefined;
  return (
    claim?.schemaVersion === 1 &&
    claim.emailHash === challenge.emailHash &&
    claim.vendorRef === vendorId &&
    claim.vendorUid === challenge.uid &&
    claim.executionId === challenge.lifecycleExecutionId &&
    claim.dataMode === "live"
  );
}

function setupEffectFence(
  challenge: VendorSetupChallenge,
  claimId: string,
  startedAt: string,
): VendorSetupEffectFence {
  return {
    schemaVersion: 1,
    tokenHash: challenge.tokenHash,
    claimIdHash: createHash("sha256").update(claimId).digest("hex"),
    inviteVersion: challenge.inviteVersion,
    lifecycleExecutionId: challenge.lifecycleExecutionId,
    startedAt,
    dataMode: "live",
  };
}

function hasExactSetupEffectFence(
  data: DocumentData | undefined,
  challenge: VendorSetupChallenge,
  claimId: string,
) {
  const fence = data?.[VENDOR_SETUP_EFFECT_FENCE_FIELD] as
    | VendorSetupEffectFence
    | undefined;
  return (
    fence?.schemaVersion === 1 &&
    fence.tokenHash === challenge.tokenHash &&
    fence.claimIdHash === createHash("sha256").update(claimId).digest("hex") &&
    fence.inviteVersion === challenge.inviteVersion &&
    fence.lifecycleExecutionId === challenge.lifecycleExecutionId &&
    typeof fence.startedAt === "string" &&
    Number.isFinite(Date.parse(fence.startedAt)) &&
    fence.dataMode === "live"
  );
}

export class FirestoreVendorSetupChallengeStore implements VendorSetupChallengeStore {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async create(challenge: VendorSetupChallenge): Promise<boolean> {
    try {
      await this.db
        .collection(VENDOR_SETUP_CHALLENGE_COLLECTION)
        .doc(challenge.tokenHash)
        .create(challenge);
      return true;
    } catch (error) {
      if (isAlreadyExists(error)) return false;
      throw error;
    }
  }

  async claim(input: {
    tokenHash: string;
    claimId: string;
    now: string;
    claimExpiresAt: string;
  }): Promise<VendorSetupClaimResult> {
    const ref = this.db
      .collection(VENDOR_SETUP_CHALLENGE_COLLECTION)
      .doc(input.tokenHash);
    return this.db.runTransaction(async (transaction: Transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return { kind: "missing" };
      const challenge = dataAsChallenge(snapshot.data());
      if (!challenge || !isValidVendorSetupChallenge(challenge, input.tokenHash)) {
        return { kind: "invalid" };
      }
      const nowMs = Date.parse(input.now);
      if (challenge.status === "consumed") return { kind: "consumed" };
      // Effect ownership is irreversible. Expiry must never rewrite an in-flight owner into a
      // terminal state that leaves its Vendor fence stranded while Firebase effects continue.
      if (challenge.status === "effect_started") return { kind: "busy" };
      if (Date.parse(challenge.expiresAt) <= nowMs) {
        transaction.update(ref, {
          status: "consumed",
          outcome: "expired",
          consumedAt: input.now,
          updatedAt: input.now,
        });
        return { kind: "expired" };
      }
      if (
        challenge.status === "claimed" &&
        typeof challenge.claimExpiresAt === "string" &&
        Date.parse(challenge.claimExpiresAt) > nowMs
      ) {
        return { kind: "busy" };
      }
      const vendorId = challenge.vendorRef.slice("vendors/".length);
      const vendorRef = this.db.collection("vendors").doc(vendorId);
      const identityClaimRef = this.db
        .collection(LIVE_VENDOR_IDENTITY_CLAIM_COLLECTION)
        .doc(challenge.emailHash);
      const [vendorSnapshot, identityClaimSnapshot] = await Promise.all([
        transaction.get(vendorRef),
        transaction.get(identityClaimRef),
      ]);
      if (
        !vendorSnapshot.exists ||
        !exactPendingSetupVendor(vendorSnapshot.data(), vendorId, challenge) ||
        !identityClaimSnapshot.exists ||
        !exactCurrentIdentityClaim(identityClaimSnapshot.data(), vendorId, challenge) ||
        vendorSnapshot.data()?.[VENDOR_SETUP_EFFECT_FENCE_FIELD] !== undefined
      ) {
        transaction.update(ref, {
          status: "consumed",
          outcome: "rejected",
          consumedAt: input.now,
          updatedAt: input.now,
          claimId: FieldValue.delete(),
          claimedAt: FieldValue.delete(),
          claimExpiresAt: FieldValue.delete(),
        });
        return { kind: "invalid" };
      }
      const claimed: VendorSetupChallenge = {
        ...challenge,
        status: "claimed",
        claimId: input.claimId,
        claimedAt: input.now,
        claimExpiresAt: input.claimExpiresAt,
        updatedAt: input.now,
      };
      transaction.update(ref, {
        status: claimed.status,
        claimId: claimed.claimId,
        claimedAt: claimed.claimedAt,
        claimExpiresAt: claimed.claimExpiresAt,
        updatedAt: claimed.updatedAt,
        outcome: FieldValue.delete(),
        consumedAt: FieldValue.delete(),
      });
      return { kind: "claimed", challenge: claimed };
    });
  }

  async startEffects(input: {
    tokenHash: string;
    claimId: string;
    now: string;
  }): Promise<boolean> {
    const ref = this.db
      .collection(VENDOR_SETUP_CHALLENGE_COLLECTION)
      .doc(input.tokenHash);
    return this.db.runTransaction(async (transaction: Transaction) => {
      const snapshot = await transaction.get(ref);
      const challenge = dataAsChallenge(snapshot.data());
      const nowMs = Date.parse(input.now);
      if (
        !snapshot.exists ||
        !challenge ||
        !isValidVendorSetupChallenge(challenge, input.tokenHash) ||
        challenge.status !== "claimed" ||
        challenge.claimId !== input.claimId ||
        !Number.isFinite(nowMs)
      ) {
        return false;
      }
      const vendorId = challenge.vendorRef.slice("vendors/".length);
      const vendorRef = this.db.collection("vendors").doc(vendorId);
      const identityClaimRef = this.db
        .collection(LIVE_VENDOR_IDENTITY_CLAIM_COLLECTION)
        .doc(challenge.emailHash);
      const [vendorSnapshot, identityClaimSnapshot] = await Promise.all([
        transaction.get(vendorRef),
        transaction.get(identityClaimRef),
      ]);
      if (
        Date.parse(challenge.expiresAt) <= nowMs ||
        !vendorSnapshot.exists ||
        !exactPendingSetupVendor(vendorSnapshot.data(), vendorId, challenge) ||
        !identityClaimSnapshot.exists ||
        !exactCurrentIdentityClaim(identityClaimSnapshot.data(), vendorId, challenge) ||
        vendorSnapshot.data()?.[VENDOR_SETUP_EFFECT_FENCE_FIELD] !== undefined
      ) {
        transaction.update(ref, {
          status: "consumed",
          outcome: Date.parse(challenge.expiresAt) <= nowMs ? "expired" : "rejected",
          consumedAt: input.now,
          updatedAt: input.now,
          claimExpiresAt: FieldValue.delete(),
        });
        return false;
      }
      transaction.update(ref, {
        status: "effect_started",
        effectStartedAt: input.now,
        updatedAt: input.now,
        claimExpiresAt: FieldValue.delete(),
      });
      transaction.update(vendorRef, {
        [VENDOR_SETUP_EFFECT_FENCE_FIELD]: setupEffectFence(
          challenge,
          input.claimId,
          input.now,
        ),
      });
      return true;
    });
  }

  async consume(input: {
    tokenHash: string;
    claimId: string;
    now: string;
    outcome: "completed" | "rejected";
  }): Promise<boolean> {
    const ref = this.db
      .collection(VENDOR_SETUP_CHALLENGE_COLLECTION)
      .doc(input.tokenHash);
    return this.db.runTransaction(async (transaction: Transaction) => {
      const snapshot = await transaction.get(ref);
      const challenge = dataAsChallenge(snapshot.data());
      if (
        !snapshot.exists ||
        !challenge ||
        !isValidVendorSetupChallenge(challenge, input.tokenHash) ||
        (challenge.status !== "claimed" && challenge.status !== "effect_started") ||
        challenge.claimId !== input.claimId
      ) {
        return false;
      }
      let vendorRef: DocumentReference<DocumentData> | undefined;
      if (challenge.status === "effect_started") {
        const vendorId = challenge.vendorRef.slice("vendors/".length);
        vendorRef = this.db.collection("vendors").doc(vendorId);
        const vendorSnapshot = await transaction.get(vendorRef);
        if (
          !vendorSnapshot.exists ||
          !exactPendingSetupVendor(vendorSnapshot.data(), vendorId, challenge) ||
          !hasExactSetupEffectFence(vendorSnapshot.data(), challenge, input.claimId)
        ) {
          return false;
        }
      }
      transaction.update(ref, {
        status: "consumed",
        outcome: input.outcome,
        consumedAt: input.now,
        updatedAt: input.now,
      });
      if (vendorRef) {
        transaction.update(vendorRef, {
          [VENDOR_SETUP_EFFECT_FENCE_FIELD]: FieldValue.delete(),
        });
      }
      return true;
    });
  }

  async release(input: {
    tokenHash: string;
    claimId: string;
    now: string;
  }): Promise<boolean> {
    const ref = this.db
      .collection(VENDOR_SETUP_CHALLENGE_COLLECTION)
      .doc(input.tokenHash);
    return this.db.runTransaction(async (transaction: Transaction) => {
      const snapshot = await transaction.get(ref);
      const challenge = dataAsChallenge(snapshot.data());
      if (
        !snapshot.exists ||
        !challenge ||
        !isValidVendorSetupChallenge(challenge, input.tokenHash) ||
        challenge.status !== "claimed" ||
        challenge.claimId !== input.claimId
      ) {
        return false;
      }
      transaction.update(ref, {
        status: "pending",
        updatedAt: input.now,
        claimId: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        claimExpiresAt: FieldValue.delete(),
      });
      return true;
    });
  }
}

export function createFirebaseVendorSetupAuth(): VendorSetupAuth {
  const auth = getAuth(getFirebaseAdminApp());
  return {
    async getUser(uid) {
      try {
        const user = await auth.getUser(uid);
        return {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          disabled: user.disabled,
          customClaims: user.customClaims,
        };
      } catch (error) {
        mapFirebaseError(error);
      }
    },
    async markEmailVerified(uid) {
      try {
        await auth.updateUser(uid, { emailVerified: true });
      } catch (error) {
        mapFirebaseError(error);
      }
    },
    async generatePasswordResetLink(email) {
      try {
        return await auth.generatePasswordResetLink(email);
      } catch (error) {
        mapFirebaseError(error);
      }
    },
  };
}

export function createLiveVendorSetupRuntimeDependencies() {
  const config = readServerConfig();
  assertExplicitProductionLive(config.environment);
  return {
    store: new FirestoreVendorSetupChallengeStore(),
    auth: createFirebaseVendorSetupAuth(),
    expectedFirebaseAuthDomain: config.firebaseBrowserConfig.authDomain ?? "",
    expectedPasswordResetPath: FIREBASE_PASSWORD_RESET_ACTION_PATH,
  };
}

/**
 * Creation seam for the Live Vendor provider. Delivery receives only `setupUrl`; it must email that
 * one app URL and must not persist or log it.
 */
export async function createAndStoreLiveVendorSetupChallenge(input: {
  vendorId: string;
  uid: string;
  email: string;
  dataMode: "live";
  inviteVersion: number;
  lifecycleExecutionId: string;
  expiresAt?: string;
  ttlMs?: number;
}) {
  const config = readServerConfig();
  assertExplicitProductionLive(config.environment);
  const appBaseUrl = config.appBaseUrl;
  if (!appBaseUrl) {
    throw new VendorSetupDependencyError(true);
  }
  return createVendorSetupChallenge(
    { ...input, appBaseUrl },
    { store: new FirestoreVendorSetupChallengeStore() },
  );
}
