import { getAuth } from "firebase-admin/auth";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { getFirebaseAdminApp } from "@/lib/firebase/admin";
import { FirestoreVendorStore } from "@/lib/firestore/vendors";
import { disableVendor } from "@/lib/vendor/lifecycle";
import {
  VendorBoundaryError,
  vendorRecordDataMode,
  type VendorRecord,
} from "@/lib/vendor/model";
import {
  provisionTestVendor,
  regenerateTestVendorSetupLink,
  resetTestVendorAuthentication,
  TEST_VENDOR_ALIASES,
  testVendorAuthenticationResetPreviewForRecord,
  testVendorDisablePreview,
  type TestVendorAliasKey,
} from "@/lib/vendor/test-identity";

export interface TestVendorAdminProjection {
  vendorId: string;
  uid: string;
  displayName: string;
  email: string;
  status: VendorRecord["status"];
  dataMode: "test";
  emailVerified: boolean;
  totpVerified: boolean;
  createdAt: string;
  activatedAt?: string;
  disabledAt?: string;
}

function projection(record: VendorRecord): TestVendorAdminProjection {
  if (vendorRecordDataMode(record) !== "test") {
    throw new VendorBoundaryError("The requested Vendor is not a Test identity.", 409);
  }
  return {
    vendorId: record.id,
    uid: record.uid,
    displayName: record.displayName ?? record.email,
    email: record.email,
    status: record.status,
    dataMode: "test",
    emailVerified: record.identityState?.emailVerified === true,
    totpVerified: record.identityState?.totpVerified === true,
    createdAt: record.createdAt,
    ...(record.activatedAt ? { activatedAt: record.activatedAt } : {}),
    ...(record.disabledAt ? { disabledAt: record.disabledAt } : {}),
  };
}

export async function listProductionTestVendors() {
  const records = await new FirestoreVendorStore().listTestVendors();
  return records.map(projection);
}

export async function provisionProductionTestVendor(input: {
  actor: AuthenticatedUser;
  aliasKey: TestVendorAliasKey;
  reason: string;
  confirmedPreviewHash: string;
}) {
  const auth = getAuth(getFirebaseAdminApp());
  const store = new FirestoreVendorStore();
  try {
    const result = await provisionTestVendor(input, {
      auth: {
        createUser: (user) => auth.createUser(user),
        setCustomUserClaims: (uid, claims) => auth.setCustomUserClaims(uid, claims),
        generatePasswordResetLink: (email) => auth.generatePasswordResetLink(email),
        deleteUser: (uid) => auth.deleteUser(uid),
      },
      store,
    });
    return {
      vendor: projection(result.vendor),
      setup: result.setup,
      callout: result.callout,
    };
  } catch (error) {
    if (firebaseCode(error) === "auth/email-already-exists") {
      throw new VendorBoundaryError(
        "The canonical Test Vendor Firebase identity already exists. Reconcile it before provisioning again.",
        409,
      );
    }
    throw error;
  }
}

export async function regenerateProductionTestVendorSetupLink(input: {
  actor: AuthenticatedUser;
  vendorId: string;
  reason: string;
  confirmedPreviewHash: string;
}) {
  const auth = getAuth(getFirebaseAdminApp());
  const store = new FirestoreVendorStore();
  const result = await regenerateTestVendorSetupLink(input, {
    auth: {
      findUserByEmail: async (email) => {
        try {
          const user = await auth.getUserByEmail(email);
          return {
            uid: user.uid,
            email: user.email ?? null,
            emailVerified: user.emailVerified,
            disabled: user.disabled,
          };
        } catch (error) {
          if (firebaseCode(error) === "auth/user-not-found") return null;
          throw error;
        }
      },
      generatePasswordResetLink: (email) => auth.generatePasswordResetLink(email),
    },
    store,
  });
  return {
    vendor: projection(result.vendor),
    setup: result.setup,
    callout: result.callout,
  };
}

export async function previewProductionTestVendorAuthenticationReset(input: {
  vendorId: string;
  reason: string;
}) {
  const alias = TEST_VENDOR_ALIASES.find(
    (candidate) => candidate.vendorId === input.vendorId,
  );
  if (!alias) {
    throw new VendorBoundaryError(
      "Only an approved Test Vendor can use this action.",
      400,
    );
  }
  const store = new FirestoreVendorStore();
  const [record, connection] = await Promise.all([
    store.getVendorById(input.vendorId),
    store.getConnection(input.vendorId),
  ]);
  if (
    !record ||
    connection !== null ||
    record.id !== alias.vendorId ||
    record.uid.trim().length === 0 ||
    record.email.trim().toLowerCase() !== alias.email ||
    vendorRecordDataMode(record) !== "test" ||
    !["pending_setup", "active", "disabled"].includes(record.status) ||
    !Number.isSafeInteger(record.inviteVersion) ||
    record.inviteVersion < 0
  ) {
    throw new VendorBoundaryError(
      "Test Vendor authentication reset is unavailable.",
      409,
    );
  }
  return testVendorAuthenticationResetPreviewForRecord(
    input.vendorId,
    input.reason,
    record,
  );
}

export async function resetProductionTestVendorAuthentication(input: {
  actor: AuthenticatedUser;
  vendorId: string;
  reason: string;
  confirmedPreviewHash: string;
}) {
  const auth = getAuth(getFirebaseAdminApp());
  const store = new FirestoreVendorStore();
  try {
    const result = await resetTestVendorAuthentication(input, {
      auth: {
        findUserByEmail: async (email) => {
          try {
            const user = await auth.getUserByEmail(email);
            return {
              uid: user.uid,
              email: user.email ?? null,
              emailVerified: user.emailVerified,
              disabled: user.disabled,
              customClaims: user.customClaims,
            };
          } catch (error) {
            if (firebaseCode(error) === "auth/user-not-found") return null;
            throw error;
          }
        },
        createUser: (user) => auth.createUser(user),
        setCustomUserClaims: (uid, claims) => auth.setCustomUserClaims(uid, claims),
        updateUser: (uid, value) => auth.updateUser(uid, value).then(() => undefined),
        revokeRefreshTokens: (uid) => auth.revokeRefreshTokens(uid),
        deleteUser: (uid) => auth.deleteUser(uid),
        generatePasswordResetLink: (email) => auth.generatePasswordResetLink(email),
      },
      store,
    });
    return {
      vendor: projection(result.vendor),
      setup: result.setup,
      callout: result.callout,
    };
  } catch (error) {
    if (
      [
        "auth/user-not-found",
        "auth/email-already-exists",
        "auth/uid-already-exists",
      ].includes(firebaseCode(error) ?? "")
    ) {
      throw new VendorBoundaryError(
        "Test Vendor authentication reset is unavailable.",
        409,
      );
    }
    throw error;
  }
}

export async function disableProductionTestVendor(input: {
  actor: AuthenticatedUser;
  vendorId: string;
  reason: string;
  confirmedPreviewHash: string;
}) {
  const preview = testVendorDisablePreview(input.vendorId, input.reason);
  if (preview.previewHash !== input.confirmedPreviewHash) {
    throw new VendorBoundaryError(
      "The Test Vendor disable preview changed. Review it again.",
      409,
    );
  }
  const store = new FirestoreVendorStore();
  const record = await store.getVendorById(input.vendorId);
  if (!record || vendorRecordDataMode(record) !== "test") {
    throw new VendorBoundaryError("Test Vendor not found.", 404);
  }
  const auth = getAuth(getFirebaseAdminApp());
  const result = await disableVendor(
    {
      actor: input.actor,
      vendorId: record.id,
      vendorUid: record.uid,
      reason: input.reason,
    },
    {
      store,
      auth: {
        updateUser: (uid, value) => auth.updateUser(uid, value).then(() => undefined),
        revokeRefreshTokens: (uid) => auth.revokeRefreshTokens(uid),
      },
      revocations: {
        enqueue: (value) => store.enqueueTokenRevocation(value),
      },
    },
  );
  return {
    ...result,
    vendorId: record.id,
    callout: {
      dataMode: "test" as const,
      externalEffect: false as const,
      liveEvidenceEligible: false as const,
    },
  };
}

function firebaseCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return String((error as { code?: unknown }).code);
}
