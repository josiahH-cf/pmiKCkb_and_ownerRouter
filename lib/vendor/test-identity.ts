import { createHash, randomBytes } from "node:crypto";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { assertNonRoutableTestEmail, executionEvidenceMarker } from "@/lib/data-mode";
import {
  VendorBoundaryError,
  vendorRecordDataMode,
  type VendorMailboxConnection,
  type VendorRecord,
} from "@/lib/vendor/model";

export const TEST_VENDOR_ALIASES = [
  {
    key: "summit-plumbing",
    vendorId: "vendor:test-summit-plumbing",
    email: "service@summit-plumbing.example.invalid",
    displayName: "Summit Plumbing Test Vendor",
  },
] as const;

export type TestVendorAliasKey = (typeof TEST_VENDOR_ALIASES)[number]["key"];

export const TEST_VENDOR_SETUP_ARTIFACT = "vendor-test-setup:v1.0";
export const TEST_VENDOR_SETUP_LINK_REGENERATION_ARTIFACT =
  "vendor-test-setup-link-regeneration:v1.0";
export const TEST_VENDOR_AUTHENTICATION_RESET_ARTIFACT =
  "vendor-test-authentication-reset:v1.0";
export const TEST_VENDOR_AUTHENTICATION_RESET_CLAIM_LEASE_MS = 2 * 60 * 1000;

const TEST_VENDOR_SETUP_LINK_REGENERATION_ACTION = "Regenerate Test Vendor setup link";
const TEST_VENDOR_AUTHENTICATION_RESET_ACTION = "Reset Test Vendor authentication";

export interface TestVendorIdentityAuth {
  createUser(input: {
    email: string;
    emailVerified: true;
    disabled: false;
    displayName: string;
  }): Promise<{ uid: string }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  generatePasswordResetLink(email: string): Promise<string>;
  deleteUser(uid: string): Promise<void>;
}

export interface TestVendorIdentityStore {
  findVendorByEmail(email: string): Promise<VendorRecord | null>;
  saveVendor(record: VendorRecord): Promise<void>;
  removeVendor(vendorId: string): Promise<void>;
  appendAudit(input: {
    actorUid: string;
    vendorId: string;
    action: string;
    reasonHash: string;
    createdAt: string;
  }): Promise<void>;
}

export interface TestVendorSetupLinkRecoveryAuth {
  findUserByEmail(email: string): Promise<{
    uid: string;
    email: string | null;
    emailVerified: boolean;
    disabled: boolean;
  } | null>;
  generatePasswordResetLink(email: string): Promise<string>;
}

export interface TestVendorSetupLinkRecoveryStore {
  getVendorById(vendorId: string): Promise<VendorRecord | null>;
  claimVendorSetupLinkRegeneration(input: {
    actorUid: string;
    vendorId: string;
    expectedUid: string;
    expectedInviteVersion: number;
    expectedEmail: string;
    previewHash: string;
    reasonHash: string;
    claimId: string;
    nowMs: number;
    nowIso: string;
    claimExpiresAtMs: number;
  }): Promise<"claimed" | "busy">;
  renewVendorSetupLinkRegenerationClaim(input: {
    vendorId: string;
    previewHash: string;
    claimId: string;
    nowMs: number;
    claimExpiresAtMs: number;
  }): Promise<boolean>;
  completeVendorSetupLinkRegeneration(input: {
    actorUid: string;
    vendorId: string;
    expectedUid: string;
    expectedInviteVersion: number;
    expectedEmail: string;
    previewHash: string;
    claimId: string;
    reasonHash: string;
    nowMs: number;
    nowIso: string;
  }): Promise<boolean>;
  releaseVendorSetupLinkRegenerationClaim(input: {
    vendorId: string;
    previewHash: string;
    claimId: string;
  }): Promise<boolean>;
}

export interface TestVendorAuthenticationResetAuth {
  findUserByEmail(email: string): Promise<{
    uid: string;
    email: string | null;
    emailVerified: boolean;
    disabled: boolean;
    customClaims?: Record<string, unknown>;
  } | null>;
  createUser(input: {
    email: string;
    emailVerified: true;
    disabled: true;
    displayName: string;
    password: string;
  }): Promise<{ uid: string }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  updateUser(
    uid: string,
    input:
      | {
          disabled: true;
          password: string;
          multiFactor: { enrolledFactors: null };
        }
      | { disabled: false },
  ): Promise<void>;
  revokeRefreshTokens(uid: string): Promise<void>;
  deleteUser(uid: string): Promise<void>;
  generatePasswordResetLink(email: string): Promise<string>;
}

interface TestVendorAuthenticationResetRecord extends VendorRecord {
  authenticationReset?: {
    previewHash: string;
    inviteVersion: number;
    sourceUid: string;
    sourceStatus: VendorRecord["status"];
    sourceInviteVersion: number;
    status: "claimed" | "prepared" | "completed";
    claimId: string;
    claimExpiresAtMs: number;
  };
  setupLinkRegeneration?: {
    previewHash: string;
    uid: string;
    inviteVersion: number;
    status: "claimed" | "completed" | "superseded";
    claimId: string;
    claimExpiresAtMs: number;
  };
}

export interface TestVendorAuthenticationResetStore {
  getVendorById(vendorId: string): Promise<TestVendorAuthenticationResetRecord | null>;
  getConnection(vendorId: string): Promise<VendorMailboxConnection | null>;
  claimVendorAuthenticationReset(input: {
    actorUid: string;
    vendorId: string;
    expectedUid: string;
    expectedStatus: VendorRecord["status"];
    expectedInviteVersion: number;
    expectedEmail: string;
    previewHash: string;
    reasonHash: string;
    claimId: string;
    nowMs: number;
    nowIso: string;
    claimExpiresAtMs: number;
  }): Promise<
    | {
        outcome: "claimed";
        record: TestVendorAuthenticationResetRecord;
        recoveredExpiredClaim: boolean;
      }
    | { outcome: "busy" | "completed" }
  >;
  renewVendorAuthenticationResetClaim(input: {
    vendorId: string;
    previewHash: string;
    claimId: string;
    nowMs: number;
    claimExpiresAtMs: number;
  }): Promise<boolean>;
  resetVendorAuthentication(input: {
    actorUid: string;
    vendorId: string;
    expectedUid: string;
    expectedStatus: VendorRecord["status"];
    expectedInviteVersion: number;
    replacementUid: string;
    expectedEmail: string;
    previewHash: string;
    claimId: string;
    reasonHash: string;
    nowMs: number;
    nowIso: string;
  }): Promise<VendorRecord | null>;
  completeVendorAuthenticationReset(input: {
    vendorId: string;
    replacementUid: string;
    previewHash: string;
    claimId: string;
    nowMs: number;
  }): Promise<VendorRecord | null>;
}

function reasonValue(reason: string) {
  const value = reason.trim();
  if (value.length < 3) {
    throw new VendorBoundaryError("A plain-English Test Vendor reason is required.", 400);
  }
  return value;
}

export function getTestVendorAlias(key: string) {
  const alias = TEST_VENDOR_ALIASES.find((candidate) => candidate.key === key);
  if (!alias) {
    throw new VendorBoundaryError("Choose an approved Test Vendor alias.", 400);
  }
  return alias;
}

function getTestVendorAliasByVendorId(vendorId: string) {
  const alias = TEST_VENDOR_ALIASES.find((candidate) => candidate.vendorId === vendorId);
  if (!alias) {
    throw new VendorBoundaryError(
      "Only an approved Test Vendor can use this action.",
      400,
    );
  }
  return alias;
}

function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

function assertHttpsSetupLink(setupLink: string) {
  try {
    if (new URL(setupLink).protocol === "https:") return;
  } catch {
    // The boundary below intentionally gives malformed and non-HTTPS links the
    // same safe service error without reflecting the secret-bearing value.
  }
  throw new VendorBoundaryError("Firebase returned an invalid setup link.", 503);
}

export function testVendorProvisionPreview(aliasKey: string, reason: string) {
  const alias = getTestVendorAlias(aliasKey);
  assertNonRoutableTestEmail(alias.email);
  const normalizedReason = reasonValue(reason);
  const previewHash = createHash("sha256")
    .update(
      JSON.stringify({
        artifact: TEST_VENDOR_SETUP_ARTIFACT,
        vendorId: alias.vendorId,
        email: alias.email,
        reason: normalizedReason,
        dataMode: "test",
      }),
    )
    .digest("hex");

  return {
    previewHash,
    vendorId: alias.vendorId,
    displayName: alias.displayName,
    email: alias.email,
    action: "Provision Test Vendor identity",
    target: `${alias.displayName} (${alias.email})`,
    externalDelivery: false,
    ...executionEvidenceMarker("test"),
    exactEffect:
      "Create one Firebase Test Vendor user, pre-verify only its non-routable alias, issue one password-setup link to this Admin response, and require TOTP before portal access.",
  };
}

export function testVendorDisablePreview(vendorId: string, reason: string) {
  const alias = TEST_VENDOR_ALIASES.find((candidate) => candidate.vendorId === vendorId);
  if (!alias) {
    throw new VendorBoundaryError(
      "Only an approved Test Vendor can use this action.",
      400,
    );
  }
  const normalizedReason = reasonValue(reason);
  return {
    previewHash: createHash("sha256")
      .update(
        JSON.stringify({
          action: "disable-test-vendor",
          vendorId,
          reason: normalizedReason,
        }),
      )
      .digest("hex"),
    vendorId,
    displayName: alias.displayName,
    action: "Disable Test Vendor identity",
    target: alias.displayName,
    externalDelivery: false,
    ...executionEvidenceMarker("test"),
    exactEffect:
      "Disable this Test Vendor user, revoke its Firebase sessions, and close its simulated mailbox access. No live provider is contacted.",
  };
}

export function testVendorSetupLinkRegenerationPreview(vendorId: string, reason: string) {
  const alias = getTestVendorAliasByVendorId(vendorId);
  assertNonRoutableTestEmail(alias.email);
  const normalizedReason = reasonValue(reason);
  const previewHash = createHash("sha256")
    .update(
      JSON.stringify({
        action: TEST_VENDOR_SETUP_LINK_REGENERATION_ACTION,
        artifact: TEST_VENDOR_SETUP_LINK_REGENERATION_ARTIFACT,
        vendorId: alias.vendorId,
        email: alias.email,
        reason: normalizedReason,
      }),
    )
    .digest("hex");

  return {
    previewHash,
    artifact: TEST_VENDOR_SETUP_LINK_REGENERATION_ARTIFACT,
    vendorId: alias.vendorId,
    displayName: alias.displayName,
    email: alias.email,
    action: TEST_VENDOR_SETUP_LINK_REGENERATION_ACTION,
    target: `${alias.displayName} (${alias.email})`,
    externalDelivery: false,
    ...executionEvidenceMarker("test"),
    exactEffect:
      "Generate a new Firebase password-setup link for the existing pending Test Vendor and return it only in this Admin response. The user and Vendor record are not altered, and no external delivery occurs.",
  };
}

export function testVendorAuthenticationResetPreview(
  vendorId: string,
  reason: string,
  binding: {
    uid: string;
    status: VendorRecord["status"];
    inviteVersion: number;
  },
) {
  const alias = getTestVendorAliasByVendorId(vendorId);
  assertNonRoutableTestEmail(alias.email);
  const normalizedReason = reasonValue(reason);
  if (
    binding.uid.trim().length === 0 ||
    !["pending_setup", "active", "disabled"].includes(binding.status) ||
    !Number.isSafeInteger(binding.inviteVersion) ||
    binding.inviteVersion < 0 ||
    !Number.isSafeInteger(binding.inviteVersion + 1)
  ) {
    throw testVendorAuthenticationResetUnavailable();
  }
  const previewHash = createHash("sha256")
    .update(
      JSON.stringify({
        action: TEST_VENDOR_AUTHENTICATION_RESET_ACTION,
        artifact: TEST_VENDOR_AUTHENTICATION_RESET_ARTIFACT,
        vendorId: alias.vendorId,
        email: alias.email,
        reason: normalizedReason,
        currentUid: binding.uid,
        currentStatus: binding.status,
        currentInviteVersion: binding.inviteVersion,
      }),
    )
    .digest("hex");

  return {
    previewHash,
    artifact: TEST_VENDOR_AUTHENTICATION_RESET_ARTIFACT,
    vendorId: alias.vendorId,
    displayName: alias.displayName,
    email: alias.email,
    currentStatus: binding.status,
    currentInviteVersion: binding.inviteVersion,
    nextStatus: "pending_setup" as const,
    nextInviteVersion: binding.inviteVersion + 1,
    action: TEST_VENDOR_AUTHENTICATION_RESET_ACTION,
    target: `${alias.displayName} (${alias.email})`,
    externalDelivery: false,
    ...executionEvidenceMarker("test"),
    exactEffect:
      "Delete the current Firebase principal and replace it with a new Firebase UID. Before deletion, disable it, replace its password with an unreturned random value, clear every MFA factor, and revoke every session. Preserve the stable Test Vendor and its isolated workflow data, transition its app identity to pending_setup with the next invite version, then enable only the replacement principal and return one one-time password-setup link in this Admin response. No live provider or external delivery is used.",
  };
}

function testVendorAuthenticationResetPreviewAndBindingForRecord(
  vendorId: string,
  reason: string,
  record: VendorRecord,
  nowMs = Date.now(),
) {
  const currentBinding = {
    uid: record.uid,
    status: record.status,
    inviteVersion: record.inviteVersion,
  };
  const currentPreview = () => ({
    binding: currentBinding,
    preview: testVendorAuthenticationResetPreview(vendorId, reason, currentBinding),
  });
  const rawMarker = (record as VendorRecord & { authenticationReset?: unknown })
    .authenticationReset;
  if (rawMarker === undefined) return currentPreview();
  if (typeof rawMarker !== "object" || rawMarker === null || Array.isArray(rawMarker)) {
    throw testVendorAuthenticationResetUnavailable();
  }
  const candidate = rawMarker as Record<string, unknown>;
  if (candidate.status === "completed") return currentPreview();
  if (candidate.status !== "claimed" && candidate.status !== "prepared") {
    throw testVendorAuthenticationResetUnavailable();
  }
  if (
    typeof candidate.previewHash !== "string" ||
    candidate.previewHash.length === 0 ||
    typeof candidate.sourceUid !== "string" ||
    candidate.sourceUid.trim().length === 0 ||
    (candidate.sourceStatus !== "pending_setup" &&
      candidate.sourceStatus !== "active" &&
      candidate.sourceStatus !== "disabled") ||
    typeof candidate.sourceInviteVersion !== "number" ||
    !Number.isSafeInteger(candidate.sourceInviteVersion) ||
    candidate.sourceInviteVersion < 0 ||
    typeof candidate.inviteVersion !== "number" ||
    !Number.isSafeInteger(candidate.inviteVersion) ||
    candidate.inviteVersion < 0 ||
    typeof candidate.claimId !== "string" ||
    candidate.claimId.trim().length === 0 ||
    typeof candidate.claimExpiresAtMs !== "number" ||
    !Number.isFinite(candidate.claimExpiresAtMs)
  ) {
    throw testVendorAuthenticationResetUnavailable();
  }
  const marker = candidate as unknown as NonNullable<
    TestVendorAuthenticationResetRecord["authenticationReset"]
  >;
  const lifecycleIsConsistent =
    record.id === vendorId &&
    (marker.status === "claimed"
      ? record.uid === marker.sourceUid &&
        record.status === marker.sourceStatus &&
        record.inviteVersion === marker.sourceInviteVersion &&
        marker.inviteVersion === record.inviteVersion
      : record.status === "pending_setup" &&
        record.uid !== marker.sourceUid &&
        record.inviteVersion === marker.inviteVersion &&
        marker.sourceInviteVersion < Number.MAX_SAFE_INTEGER &&
        marker.sourceInviteVersion + 1 === record.inviteVersion);

  if (!lifecycleIsConsistent) return currentPreview();

  const binding = {
    uid: marker.sourceUid,
    status: marker.sourceStatus,
    inviteVersion: marker.sourceInviteVersion,
  };
  const preview = testVendorAuthenticationResetPreview(vendorId, reason, binding);
  if (preview.previewHash !== marker.previewHash && marker.claimExpiresAtMs > nowMs) {
    // A live owner keeps its exact preview. Once its lease expires, an Admin
    // can review a fresh reason against the immutable source tuple without
    // persisting the prior plaintext reason.
    throw testVendorAuthenticationResetUnavailable();
  }
  return { binding, preview };
}

export function testVendorAuthenticationResetPreviewForRecord(
  vendorId: string,
  reason: string,
  record: VendorRecord,
  nowMs = Date.now(),
) {
  return testVendorAuthenticationResetPreviewAndBindingForRecord(
    vendorId,
    reason,
    record,
    nowMs,
  ).preview;
}

function testVendorAuthenticationResetUnavailable() {
  return new VendorBoundaryError("Test Vendor authentication reset is unavailable.", 409);
}

function hasCanonicalTestVendorClaims(
  claims: Record<string, unknown> | undefined,
  vendorId: string,
) {
  const exactClaimKeys = ["data_mode", "vendor", "vendor_id"];
  return (
    claims !== undefined &&
    Object.keys(claims)
      .sort()
      .every((key, index) => key === exactClaimKeys[index]) &&
    Object.keys(claims).length === exactClaimKeys.length &&
    claims?.vendor === true &&
    claims.vendor_id === vendorId &&
    claims.data_mode === "test"
  );
}

function randomUnreturnedPassword() {
  return randomBytes(48).toString("base64url");
}

export async function resetTestVendorAuthentication(
  input: {
    actor: AuthenticatedUser;
    vendorId: string;
    reason: string;
    confirmedPreviewHash: string;
  },
  dependencies: {
    auth: TestVendorAuthenticationResetAuth;
    store: TestVendorAuthenticationResetStore;
    now?: () => Date;
  },
) {
  if (!can(input.actor.role, "manageAdmin")) {
    throw new VendorBoundaryError("Admin access is required.", 403);
  }
  const alias = getTestVendorAliasByVendorId(input.vendorId);
  assertNonRoutableTestEmail(alias.email);
  const record = await dependencies.store.getVendorById(alias.vendorId);
  if (
    !record ||
    record.id !== alias.vendorId ||
    !["pending_setup", "active", "disabled"].includes(record.status) ||
    vendorRecordDataMode(record) !== "test" ||
    normalizedEmail(record.email) !== normalizedEmail(alias.email) ||
    record.uid.trim().length === 0 ||
    !Number.isSafeInteger(record.inviteVersion) ||
    record.inviteVersion < 0
  ) {
    throw testVendorAuthenticationResetUnavailable();
  }
  if (await dependencies.store.getConnection(alias.vendorId)) {
    // The canonical Test Vendor is app-mailbox-only. Refuse reset rather than
    // silently orphaning or touching unexpected Live OAuth/token metadata.
    throw testVendorAuthenticationResetUnavailable();
  }

  const readNow = dependencies.now ?? (() => new Date());
  const previewedAt = readNow();
  const { binding: sourceBinding, preview } =
    testVendorAuthenticationResetPreviewAndBindingForRecord(
      input.vendorId,
      input.reason,
      record,
      previewedAt.getTime(),
    );
  if (preview.previewHash !== input.confirmedPreviewHash) {
    throw new VendorBoundaryError(
      "The Test Vendor authentication-reset preview changed. Review it again.",
      409,
    );
  }

  const user = await dependencies.auth.findUserByEmail(preview.email);
  if (
    user &&
    (!user.emailVerified ||
      user.email === null ||
      normalizedEmail(user.email) !== normalizedEmail(preview.email))
  ) {
    throw testVendorAuthenticationResetUnavailable();
  }
  if (
    user &&
    (!hasCanonicalTestVendorClaims(user.customClaims, preview.vendorId) ||
      (user.uid !== record.uid && !user.disabled))
  ) {
    // A different-UID Firebase principal is adoptable only when it is already
    // disabled and carries the exact canonical Test Vendor claims. Never
    // harden, delete, or rewrite a drifted identity as part of recovery.
    throw testVendorAuthenticationResetUnavailable();
  }

  const reasonHash = createHash("sha256").update(input.reason.trim()).digest("hex");
  const claimId = randomBytes(24).toString("base64url");
  const claimedAt = readNow();
  const claimResult = await dependencies.store.claimVendorAuthenticationReset({
    actorUid: input.actor.uid,
    vendorId: preview.vendorId,
    expectedUid: sourceBinding.uid,
    expectedStatus: sourceBinding.status,
    expectedInviteVersion: sourceBinding.inviteVersion,
    expectedEmail: preview.email,
    previewHash: preview.previewHash,
    reasonHash,
    claimId,
    nowMs: claimedAt.getTime(),
    nowIso: claimedAt.toISOString(),
    claimExpiresAtMs:
      claimedAt.getTime() + TEST_VENDOR_AUTHENTICATION_RESET_CLAIM_LEASE_MS,
  });
  if (claimResult.outcome !== "claimed") {
    // An overlapping or already-completed exact reset never reaches Firebase,
    // so it cannot disable the winner or mint a second setup link.
    throw testVendorAuthenticationResetUnavailable();
  }
  const claimedRecord = claimResult.record;
  const recoveredExpiredClaim = claimResult.recoveredExpiredClaim;
  const preparedReset =
    claimedRecord.authenticationReset?.status === "prepared" &&
    claimedRecord.authenticationReset.previewHash === preview.previewHash;

  const stagedReplacement =
    user !== null &&
    user.uid !== claimedRecord.uid &&
    user.disabled &&
    hasCanonicalTestVendorClaims(user.customClaims, preview.vendorId);
  const resumableCommittedReset =
    user !== null &&
    user.uid === claimedRecord.uid &&
    preparedReset &&
    hasCanonicalTestVendorClaims(user.customClaims, preview.vendorId);

  const hardenAndRevoke = async (uid: string) => {
    await dependencies.auth.updateUser(uid, {
      disabled: true,
      password: randomUnreturnedPassword(),
      multiFactor: { enrolledFactors: null },
    });
    await dependencies.auth.revokeRefreshTokens(uid);
  };

  let replacementUid: string;
  if (!recoveredExpiredClaim && (stagedReplacement || resumableCommittedReset)) {
    replacementUid = user.uid;
    // Re-harden a staged replacement on every retry. This is idempotent and
    // invalidates any action code minted by an interrupted earlier attempt.
    await hardenAndRevoke(replacementUid);
  } else {
    const forbiddenReplacementUids = new Set([sourceBinding.uid]);
    if (recoveredExpiredClaim) {
      // A prepared marker's Firestore UID can outlive a missing Auth lookup,
      // while a claimed marker can have a different staged Auth UID. Neither
      // abandoned identity may become the takeover winner.
      forbiddenReplacementUids.add(claimedRecord.uid);
      if (user) forbiddenReplacementUids.add(user.uid);
    }
    if (user) {
      // This single Firebase mutation closes every known sign-in path before
      // the old UID is removed. The password is never returned or persisted.
      await hardenAndRevoke(user.uid);
      await dependencies.auth.deleteUser(user.uid);
    }

    const replacement = await dependencies.auth.createUser({
      email: preview.email,
      emailVerified: true,
      disabled: true,
      displayName: preview.displayName,
      password: randomUnreturnedPassword(),
    });
    replacementUid = replacement.uid;
    if (
      replacementUid.trim().length === 0 ||
      forbiddenReplacementUids.has(replacementUid)
    ) {
      await dependencies.auth.deleteUser(replacementUid).catch(() => undefined);
      throw testVendorAuthenticationResetUnavailable();
    }
    try {
      await dependencies.auth.setCustomUserClaims(replacementUid, {
        vendor: true,
        vendor_id: preview.vendorId,
        data_mode: "test",
      });
    } catch (error) {
      await dependencies.auth.deleteUser(replacementUid).catch(() => undefined);
      throw error;
    }
  }

  const resetAt = readNow();
  const resetRecord = await dependencies.store.resetVendorAuthentication({
    actorUid: input.actor.uid,
    vendorId: preview.vendorId,
    expectedUid: sourceBinding.uid,
    expectedStatus: sourceBinding.status,
    expectedInviteVersion: sourceBinding.inviteVersion,
    replacementUid,
    expectedEmail: preview.email,
    previewHash: preview.previewHash,
    claimId,
    reasonHash,
    nowMs: resetAt.getTime(),
    nowIso: resetAt.toISOString(),
  });
  if (!resetRecord) {
    // Authentication deliberately remains disabled if the transactional
    // identity reconciliation fails. A confirmed retry can safely resume.
    throw testVendorAuthenticationResetUnavailable();
  }

  const renewClaim = async () => {
    const renewedAt = readNow();
    return dependencies.store.renewVendorAuthenticationResetClaim({
      vendorId: preview.vendorId,
      previewHash: preview.previewHash,
      claimId,
      nowMs: renewedAt.getTime(),
      claimExpiresAtMs:
        renewedAt.getTime() + TEST_VENDOR_AUTHENTICATION_RESET_CLAIM_LEASE_MS,
    });
  };
  if (!(await renewClaim())) {
    throw testVendorAuthenticationResetUnavailable();
  }

  const hardenOnlyWhileOwned = async () => {
    const stillOwned = await renewClaim().catch(() => false);
    if (stillOwned) {
      await hardenAndRevoke(replacementUid).catch(() => undefined);
    }
  };

  let setupLink: string;
  try {
    await dependencies.auth.updateUser(replacementUid, { disabled: false });
    // Re-fence after the external enable call. If the lease expired while that
    // call was in flight and a retry completed, this request is now the loser:
    // it must not mint another setup link or compensate against the winner.
    if (!(await renewClaim())) {
      throw testVendorAuthenticationResetUnavailable();
    }
    setupLink = await dependencies.auth.generatePasswordResetLink(preview.email);
    assertHttpsSetupLink(setupLink);
  } catch (error) {
    await hardenOnlyWhileOwned();
    throw error;
  }

  let completedRecord: VendorRecord | null;
  try {
    const completedAt = readNow();
    completedRecord = await dependencies.store.completeVendorAuthenticationReset({
      vendorId: preview.vendorId,
      replacementUid,
      previewHash: preview.previewHash,
      claimId,
      nowMs: completedAt.getTime(),
    });
  } catch (error) {
    await hardenOnlyWhileOwned();
    throw error;
  }
  if (!completedRecord) {
    await hardenOnlyWhileOwned();
    throw testVendorAuthenticationResetUnavailable();
  }

  return {
    vendor: completedRecord,
    setup: {
      artifact: TEST_VENDOR_AUTHENTICATION_RESET_ARTIFACT,
      setupLink,
      oneTime: true as const,
      authenticationReset: true as const,
      deliveredExternally: false as const,
    },
    callout: {
      ...executionEvidenceMarker("test"),
      externalEffect: false as const,
    },
  };
}

export async function regenerateTestVendorSetupLink(
  input: {
    actor: AuthenticatedUser;
    vendorId: string;
    reason: string;
    confirmedPreviewHash: string;
  },
  dependencies: {
    auth: TestVendorSetupLinkRecoveryAuth;
    store: TestVendorSetupLinkRecoveryStore;
    now?: () => Date;
  },
) {
  if (!can(input.actor.role, "manageAdmin")) {
    throw new VendorBoundaryError("Admin access is required.", 403);
  }
  const preview = testVendorSetupLinkRegenerationPreview(input.vendorId, input.reason);
  if (preview.previewHash !== input.confirmedPreviewHash) {
    throw new VendorBoundaryError(
      "The Test Vendor setup-link preview changed. Review it again.",
      409,
    );
  }

  const record = await dependencies.store.getVendorById(preview.vendorId);
  const unavailable = () =>
    new VendorBoundaryError("Test Vendor setup-link recovery is unavailable.", 409);
  if (
    !record ||
    record.id !== preview.vendorId ||
    record.status !== "pending_setup" ||
    vendorRecordDataMode(record) !== "test" ||
    normalizedEmail(record.email) !== normalizedEmail(preview.email) ||
    record.uid.trim().length === 0 ||
    !Number.isSafeInteger(record.inviteVersion) ||
    record.inviteVersion < 0
  ) {
    throw unavailable();
  }

  const readNow = dependencies.now ?? (() => new Date());
  const reasonHash = createHash("sha256").update(input.reason.trim()).digest("hex");
  const claimId = randomBytes(24).toString("base64url");
  const claimedAt = readNow();
  const claimResult = await dependencies.store.claimVendorSetupLinkRegeneration({
    actorUid: input.actor.uid,
    vendorId: preview.vendorId,
    expectedUid: record.uid,
    expectedInviteVersion: record.inviteVersion,
    expectedEmail: preview.email,
    previewHash: preview.previewHash,
    reasonHash,
    claimId,
    nowMs: claimedAt.getTime(),
    nowIso: claimedAt.toISOString(),
    claimExpiresAtMs:
      claimedAt.getTime() + TEST_VENDOR_AUTHENTICATION_RESET_CLAIM_LEASE_MS,
  });
  if (claimResult !== "claimed") throw unavailable();
  const releaseClaim = async () => {
    await dependencies.store
      .releaseVendorSetupLinkRegenerationClaim({
        vendorId: preview.vendorId,
        previewHash: preview.previewHash,
        claimId,
      })
      .catch(() => false);
  };

  const user = await dependencies.auth.findUserByEmail(preview.email).catch(async () => {
    await releaseClaim();
    return null;
  });
  if (
    !user ||
    user.disabled ||
    !user.emailVerified ||
    user.uid !== record.uid ||
    user.email === null ||
    normalizedEmail(user.email) !== normalizedEmail(preview.email)
  ) {
    await releaseClaim();
    throw unavailable();
  }

  const renewedAt = readNow();
  if (
    !(await dependencies.store.renewVendorSetupLinkRegenerationClaim({
      vendorId: preview.vendorId,
      previewHash: preview.previewHash,
      claimId,
      nowMs: renewedAt.getTime(),
      claimExpiresAtMs:
        renewedAt.getTime() + TEST_VENDOR_AUTHENTICATION_RESET_CLAIM_LEASE_MS,
    }))
  ) {
    await releaseClaim();
    throw unavailable();
  }

  let setupLink: string;
  try {
    setupLink = await dependencies.auth.generatePasswordResetLink(preview.email);
    assertHttpsSetupLink(setupLink);
  } catch (error) {
    await releaseClaim();
    throw error;
  }

  let completed: boolean;
  try {
    const completedAt = readNow();
    completed = await dependencies.store.completeVendorSetupLinkRegeneration({
      actorUid: input.actor.uid,
      vendorId: preview.vendorId,
      expectedUid: record.uid,
      expectedInviteVersion: record.inviteVersion,
      expectedEmail: preview.email,
      previewHash: preview.previewHash,
      claimId,
      reasonHash,
      nowMs: completedAt.getTime(),
      nowIso: completedAt.toISOString(),
    });
  } catch (error) {
    await releaseClaim();
    throw error;
  }
  if (!completed) {
    await releaseClaim();
    throw unavailable();
  }

  // The Firebase action code exists only in this response. Neither the link nor
  // any part of it is stored in the Vendor record or bodyless audit evidence.
  return {
    vendor: record,
    setup: {
      artifact: TEST_VENDOR_SETUP_LINK_REGENERATION_ARTIFACT,
      setupLink,
      oneTime: true as const,
      regenerated: true as const,
      deliveredExternally: false as const,
    },
    callout: {
      ...executionEvidenceMarker("test"),
      externalEffect: false as const,
    },
  };
}

export async function provisionTestVendor(
  input: {
    actor: AuthenticatedUser;
    aliasKey: string;
    reason: string;
    confirmedPreviewHash: string;
  },
  dependencies: {
    auth: TestVendorIdentityAuth;
    store: TestVendorIdentityStore;
    now?: () => Date;
  },
) {
  if (!can(input.actor.role, "manageAdmin")) {
    throw new VendorBoundaryError("Admin access is required.", 403);
  }
  const preview = testVendorProvisionPreview(input.aliasKey, input.reason);
  if (preview.previewHash !== input.confirmedPreviewHash) {
    throw new VendorBoundaryError(
      "The Test Vendor setup preview changed. Review it again.",
      409,
    );
  }
  if (await dependencies.store.findVendorByEmail(preview.email)) {
    throw new VendorBoundaryError("That Test Vendor account already exists.", 409);
  }

  const createdAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const user = await dependencies.auth.createUser({
    email: preview.email,
    emailVerified: true,
    disabled: false,
    displayName: preview.displayName,
  });
  let vendorSaved = false;
  try {
    await dependencies.auth.setCustomUserClaims(user.uid, {
      vendor: true,
      vendor_id: preview.vendorId,
      data_mode: "test",
    });
    const record: VendorRecord = {
      id: preview.vendorId,
      uid: user.uid,
      email: preview.email,
      displayName: preview.displayName,
      status: "pending_setup",
      inviteVersion: 1,
      data_mode: "test",
      identityState: {
        emailVerified: true,
        totpRequired: true,
        totpVerified: false,
      },
      createdAt,
      updatedAt: createdAt,
    };
    await dependencies.store.saveVendor(record);
    vendorSaved = true;
    const setupLink = await dependencies.auth.generatePasswordResetLink(preview.email);
    assertHttpsSetupLink(setupLink);
    await dependencies.store.appendAudit({
      actorUid: input.actor.uid,
      vendorId: preview.vendorId,
      action: "test_vendor_provisioned",
      reasonHash: createHash("sha256").update(input.reason.trim()).digest("hex"),
      createdAt,
    });

    // The Firebase action code is returned only in this response and is single-use.
    // It is never persisted, delivered, audited, or eligible as live evidence.
    return {
      vendor: record,
      setup: {
        artifact: TEST_VENDOR_SETUP_ARTIFACT,
        setupLink,
        oneTime: true as const,
        deliveredExternally: false as const,
      },
      callout: {
        ...executionEvidenceMarker("test"),
        externalEffect: false as const,
      },
    };
  } catch (error) {
    if (vendorSaved) {
      await dependencies.store.removeVendor(preview.vendorId).catch(() => undefined);
    }
    await dependencies.auth.deleteUser(user.uid).catch(() => undefined);
    throw error;
  }
}
