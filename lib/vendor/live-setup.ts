import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const VENDOR_SETUP_CHALLENGE_COLLECTION = "vendor_setup_challenges";
export const VENDOR_SETUP_TOKEN_BYTES = 32;
export const VENDOR_SETUP_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
export const VENDOR_SETUP_CLAIM_LEASE_MS = 2 * 60 * 1000;
const VENDOR_SETUP_CONSUME_ATTEMPTS = 3;

const MINIMUM_TTL_MS = 5 * 60 * 1000;
const MAXIMUM_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const VENDOR_ID_PATTERN = /^[^/\s]{1,200}$/;
const UID_PATTERN = /^[^/\s]{1,128}$/;

export type VendorSetupChallengeStatus =
  | "pending"
  | "claimed"
  | "effect_started"
  | "consumed";
export type VendorSetupChallengeOutcome = "completed" | "rejected" | "expired";

/**
 * Bodyless, server-owned state. The raw setup token and Vendor email must never be added to this
 * record. `tokenHash` is also the Firestore document id, making lookup exact without a query.
 */
export interface VendorSetupChallenge {
  schemaVersion: 2;
  tokenHash: string;
  vendorRef: `vendors/${string}`;
  uid: string;
  inviteVersion: number;
  lifecycleExecutionId: string;
  emailHash: string;
  dataMode: "live";
  status: VendorSetupChallengeStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  claimId?: string;
  claimedAt?: string;
  claimExpiresAt?: string;
  effectStartedAt?: string;
  consumedAt?: string;
  outcome?: VendorSetupChallengeOutcome;
}

export type VendorSetupClaimResult =
  | { kind: "claimed"; challenge: VendorSetupChallenge }
  | { kind: "missing" | "invalid" | "expired" | "busy" | "consumed" };

export interface VendorSetupChallengeStore {
  /**
   * Must provide create-only semantics. A false result means the token hash already exists.
   */
  create(challenge: VendorSetupChallenge): Promise<boolean>;
  /**
   * Must atomically transition pending -> claimed. An expired claim may be reclaimed.
   */
  claim(input: {
    tokenHash: string;
    claimId: string;
    now: string;
    claimExpiresAt: string;
  }): Promise<VendorSetupClaimResult>;
  /**
   * Must atomically and irreversibly transition only the caller's claim to `effect_started`.
   * Neither an expired claim lease nor a retryable provider error may make this challenge
   * claimable again after this boundary.
   */
  startEffects(input: {
    tokenHash: string;
    claimId: string;
    now: string;
  }): Promise<boolean>;
  /**
   * Must atomically transition only the caller's claim to consumed.
   */
  consume(input: {
    tokenHash: string;
    claimId: string;
    now: string;
    outcome: Exclude<VendorSetupChallengeOutcome, "expired">;
  }): Promise<boolean>;
  /**
   * Must atomically release only the caller's claim. Used for retryable dependency failures.
   */
  release(input: { tokenHash: string; claimId: string; now: string }): Promise<boolean>;
}

export interface VendorSetupAuthUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  disabled: boolean;
  customClaims?: Record<string, unknown>;
}

export interface VendorSetupAuth {
  getUser(uid: string): Promise<VendorSetupAuthUser>;
  markEmailVerified(uid: string): Promise<void>;
  generatePasswordResetLink(email: string): Promise<string>;
}

export class VendorSetupDependencyError extends Error {
  constructor(readonly definitive: boolean) {
    super("Vendor setup dependency failed.");
    this.name = "VendorSetupDependencyError";
  }
}

export class VendorSetupPublicError extends Error {
  constructor(
    readonly status: 400 | 404 | 405 | 409 | 410 | 413 | 415 | 503,
    message: string,
  ) {
    super(message);
    this.name = "VendorSetupPublicError";
  }
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^@\s]+@[^@\s]+$/.test(normalized)) {
    throw new VendorSetupPublicError(400, "Vendor setup details are invalid.");
  }
  return normalized;
}

export function vendorSetupEmailHash(email: string) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

export function vendorSetupTokenHash(token: string) {
  if (!TOKEN_PATTERN.test(token)) {
    throw new VendorSetupPublicError(400, "This Vendor setup link is invalid.");
  }
  return createHash("sha256").update(token).digest("hex");
}

function safeHashEqual(left: string, right: string) {
  if (!HASH_PATTERN.test(left) || !HASH_PATTERN.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function validateAppBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new VendorSetupPublicError(503, "Vendor setup is unavailable.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new VendorSetupPublicError(503, "Vendor setup is unavailable.");
  }
  return url;
}

function validateVendorId(vendorId: string) {
  const value = vendorId.trim();
  if (!VENDOR_ID_PATTERN.test(value)) {
    throw new VendorSetupPublicError(400, "Vendor setup details are invalid.");
  }
  return value;
}

function validateUid(uid: string) {
  const value = uid.trim();
  if (!UID_PATTERN.test(value)) {
    throw new VendorSetupPublicError(400, "Vendor setup details are invalid.");
  }
  return value;
}

function validateInviteVersion(inviteVersion: number) {
  if (!Number.isSafeInteger(inviteVersion) || inviteVersion < 1) {
    throw new VendorSetupPublicError(400, "Vendor setup details are invalid.");
  }
  return inviteVersion;
}

function validateLifecycleExecutionId(lifecycleExecutionId: string) {
  const value = lifecycleExecutionId.trim();
  if (!HASH_PATTERN.test(value)) {
    throw new VendorSetupPublicError(400, "Vendor setup details are invalid.");
  }
  return value;
}

function parseIso(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isValidVendorSetupChallenge(
  value: VendorSetupChallenge,
  expectedTokenHash?: string,
): boolean {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof value.vendorRef !== "string" ||
    typeof value.uid !== "string" ||
    typeof value.inviteVersion !== "number" ||
    typeof value.lifecycleExecutionId !== "string" ||
    typeof value.tokenHash !== "string" ||
    typeof value.emailHash !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    typeof value.expiresAt !== "string"
  ) {
    return false;
  }
  const vendorId = value.vendorRef.slice("vendors/".length);
  const createdAt = parseIso(value.createdAt);
  const updatedAt = parseIso(value.updatedAt);
  const expiresAt = parseIso(value.expiresAt);
  const effectStartedAt =
    typeof value.effectStartedAt === "string" ? parseIso(value.effectStartedAt) : null;
  return (
    value.schemaVersion === 2 &&
    HASH_PATTERN.test(value.tokenHash) &&
    (!expectedTokenHash || safeHashEqual(value.tokenHash, expectedTokenHash)) &&
    value.vendorRef === `vendors/${vendorId}` &&
    typeof vendorId === "string" &&
    VENDOR_ID_PATTERN.test(vendorId) &&
    UID_PATTERN.test(value.uid) &&
    Number.isSafeInteger(value.inviteVersion) &&
    value.inviteVersion >= 1 &&
    HASH_PATTERN.test(value.lifecycleExecutionId) &&
    HASH_PATTERN.test(value.emailHash) &&
    value.dataMode === "live" &&
    (value.status === "pending" ||
      value.status === "claimed" ||
      value.status === "effect_started" ||
      value.status === "consumed") &&
    (value.status !== "effect_started" || effectStartedAt !== null) &&
    createdAt !== null &&
    updatedAt !== null &&
    expiresAt !== null &&
    expiresAt > createdAt
  );
}

export async function createVendorSetupChallenge(
  input: {
    vendorId: string;
    uid: string;
    email: string;
    dataMode: "live";
    inviteVersion: number;
    lifecycleExecutionId: string;
    appBaseUrl: string;
    expiresAt?: string;
    ttlMs?: number;
  },
  dependencies: {
    store: VendorSetupChallengeStore;
    now?: () => Date;
    token?: () => string;
  },
): Promise<{ setupUrl: string; expiresAt: string }> {
  if (input.dataMode !== "live") {
    throw new VendorSetupPublicError(400, "Vendor setup details are invalid.");
  }
  const vendorId = validateVendorId(input.vendorId);
  const uid = validateUid(input.uid);
  const inviteVersion = validateInviteVersion(input.inviteVersion);
  const lifecycleExecutionId = validateLifecycleExecutionId(input.lifecycleExecutionId);
  const emailHash = vendorSetupEmailHash(input.email);
  const baseUrl = validateAppBaseUrl(input.appBaseUrl);
  const now = (dependencies.now ?? (() => new Date()))();
  if (!Number.isFinite(now.getTime())) {
    throw new VendorSetupPublicError(503, "Vendor setup is unavailable.");
  }
  const createdAt = now.toISOString();
  let expiresAt: string;
  if (input.expiresAt !== undefined) {
    if (input.ttlMs !== undefined) {
      throw new VendorSetupPublicError(400, "Vendor setup details are invalid.");
    }
    const explicitExpiry = parseIso(input.expiresAt);
    const lifetime =
      explicitExpiry === null ? Number.NaN : explicitExpiry - now.getTime();
    if (
      explicitExpiry === null ||
      new Date(explicitExpiry).toISOString() !== input.expiresAt ||
      lifetime < MINIMUM_TTL_MS ||
      lifetime > MAXIMUM_TTL_MS
    ) {
      throw new VendorSetupPublicError(400, "Vendor setup details are invalid.");
    }
    expiresAt = input.expiresAt;
  } else {
    const ttlMs = input.ttlMs ?? VENDOR_SETUP_DEFAULT_TTL_MS;
    if (!Number.isInteger(ttlMs) || ttlMs < MINIMUM_TTL_MS || ttlMs > MAXIMUM_TTL_MS) {
      throw new VendorSetupPublicError(400, "Vendor setup details are invalid.");
    }
    expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  }
  const tokenFactory =
    dependencies.token ??
    (() => randomBytes(VENDOR_SETUP_TOKEN_BYTES).toString("base64url"));

  // A create-only collision is exceptionally unlikely, but retry without ever surfacing the token.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = tokenFactory();
    const tokenHash = vendorSetupTokenHash(token);
    const challenge: VendorSetupChallenge = {
      schemaVersion: 2,
      tokenHash,
      vendorRef: `vendors/${vendorId}`,
      uid,
      inviteVersion,
      lifecycleExecutionId,
      emailHash,
      dataMode: "live",
      status: "pending",
      createdAt,
      updatedAt: createdAt,
      expiresAt,
    };
    if (await dependencies.store.create(challenge)) {
      // The fragment is never sent in an HTTP request or captured by Cloud Run/proxy access logs.
      // The public bridge clears it before a same-origin form POST.
      const setupUrl = new URL("/vendor/setup", baseUrl);
      setupUrl.hash = new URLSearchParams({ token }).toString();
      // This URL is the only returned representation of the raw token. The token is never returned
      // separately and the persistence boundary received only its SHA-256 hash.
      return { setupUrl: setupUrl.toString(), expiresAt };
    }
  }
  throw new VendorSetupPublicError(503, "Vendor setup is unavailable.");
}

function vendorIdFromRef(vendorRef: string) {
  return vendorRef.slice("vendors/".length);
}

function exactLiveFirebaseAuthority(
  challenge: VendorSetupChallenge,
  user: VendorSetupAuthUser,
) {
  const claims = user.customClaims ?? {};
  const claimKeys = Object.keys(claims).sort();
  let emailHash: string;
  try {
    emailHash = typeof user.email === "string" ? vendorSetupEmailHash(user.email) : "";
  } catch {
    return false;
  }
  return (
    user.uid === challenge.uid &&
    !user.disabled &&
    safeHashEqual(emailHash, challenge.emailHash) &&
    claimKeys.length === 3 &&
    claimKeys[0] === "data_mode" &&
    claimKeys[1] === "vendor" &&
    claimKeys[2] === "vendor_id" &&
    claims.vendor === true &&
    claims.vendor_id === vendorIdFromRef(challenge.vendorRef) &&
    claims.data_mode === "live"
  );
}

function validateResetPolicy(
  expectedFirebaseAuthDomain: string,
  expectedPasswordResetPath: string,
) {
  const expectedDomain = expectedFirebaseAuthDomain.trim().toLowerCase();
  if (
    !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(expectedDomain) ||
    expectedDomain.includes("..") ||
    !expectedPasswordResetPath.startsWith("/") ||
    expectedPasswordResetPath.includes("?") ||
    expectedPasswordResetPath.includes("#")
  ) {
    throw new VendorSetupPublicError(503, "Vendor setup is unavailable.");
  }
  return {
    domain: expectedDomain,
    path: expectedPasswordResetPath,
  };
}

function validateResetLink(value: string, expected: { domain: string; path: string }) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new VendorSetupDependencyError(true);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hostname.toLowerCase() !== expected.domain ||
    url.pathname !== expected.path ||
    url.hash ||
    url.searchParams.getAll("mode").length !== 1 ||
    url.searchParams.get("mode") !== "resetPassword" ||
    url.searchParams.getAll("oobCode").length !== 1 ||
    !url.searchParams.get("oobCode")
  ) {
    throw new VendorSetupDependencyError(true);
  }
  return url.toString();
}

async function consumeRejectedClaim(
  store: VendorSetupChallengeStore,
  tokenHash: string,
  claimId: string,
  now: string,
) {
  const consumed = await consumeClaimWithRetry(
    store,
    tokenHash,
    claimId,
    now,
    "rejected",
  );
  if (!consumed) {
    throw new VendorSetupPublicError(409, "This Vendor setup link is unavailable.");
  }
}

async function consumeClaimWithRetry(
  store: VendorSetupChallengeStore,
  tokenHash: string,
  claimId: string,
  now: string,
  outcome: "completed" | "rejected",
) {
  for (let attempt = 1; attempt <= VENDOR_SETUP_CONSUME_ATTEMPTS; attempt += 1) {
    try {
      return await store.consume({ tokenHash, claimId, now, outcome });
    } catch {
      if (attempt === VENDOR_SETUP_CONSUME_ATTEMPTS) {
        throw new VendorSetupPublicError(503, "Vendor setup is unavailable.");
      }
    }
  }
  return false;
}

async function releaseRetryableClaim(
  store: VendorSetupChallengeStore,
  tokenHash: string,
  claimId: string,
  now: string,
) {
  try {
    await store.release({ tokenHash, claimId, now });
  } catch {
    // A lost release is safe: the short lease prevents simultaneous external effects, and a later
    // request may reclaim it. Never replace the original dependency failure with sensitive detail.
  }
}

export async function completeVendorSetup(
  token: string,
  dependencies: {
    store: VendorSetupChallengeStore;
    auth: VendorSetupAuth;
    now?: () => Date;
    claimId?: () => string;
    claimLeaseMs?: number;
    expectedFirebaseAuthDomain: string;
    expectedPasswordResetPath: string;
  },
): Promise<{ redirectUrl: string }> {
  const tokenHash = vendorSetupTokenHash(token);
  // Validate deployed Firebase routing before claiming the credential or touching Auth. A missing
  // or malformed production config is an availability failure, never permission to mint a reset
  // credential and reject it afterward.
  const expectedReset = validateResetPolicy(
    dependencies.expectedFirebaseAuthDomain,
    dependencies.expectedPasswordResetPath,
  );
  const clock = dependencies.now ?? (() => new Date());
  const nowDate = clock();
  if (!Number.isFinite(nowDate.getTime())) {
    throw new VendorSetupPublicError(503, "Vendor setup is unavailable.");
  }
  const now = nowDate.toISOString();
  const claimLeaseMs = dependencies.claimLeaseMs ?? VENDOR_SETUP_CLAIM_LEASE_MS;
  if (
    !Number.isInteger(claimLeaseMs) ||
    claimLeaseMs < 30_000 ||
    claimLeaseMs > 5 * 60 * 1000
  ) {
    throw new VendorSetupPublicError(503, "Vendor setup is unavailable.");
  }
  const claimId = (dependencies.claimId ?? randomUUID)();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(claimId)) {
    throw new VendorSetupPublicError(503, "Vendor setup is unavailable.");
  }

  const claim = await dependencies.store.claim({
    tokenHash,
    claimId,
    now,
    claimExpiresAt: new Date(nowDate.getTime() + claimLeaseMs).toISOString(),
  });
  if (claim.kind !== "claimed") {
    const status =
      claim.kind === "invalid" || claim.kind === "missing"
        ? 404
        : claim.kind === "busy"
          ? 409
          : 410;
    throw new VendorSetupPublicError(
      status,
      status === 409
        ? "This Vendor setup link is currently unavailable."
        : "This Vendor setup link is invalid or expired.",
    );
  }

  const challenge = claim.challenge;
  if (
    !isValidVendorSetupChallenge(challenge, tokenHash) ||
    challenge.status !== "claimed" ||
    challenge.claimId !== claimId ||
    challenge.dataMode !== "live"
  ) {
    await consumeRejectedClaim(dependencies.store, tokenHash, claimId, now);
    throw new VendorSetupPublicError(
      404,
      "This Vendor setup link is invalid or expired.",
    );
  }

  let user: VendorSetupAuthUser;
  try {
    user = await dependencies.auth.getUser(challenge.uid);
  } catch (error) {
    if (error instanceof VendorSetupDependencyError && error.definitive) {
      await consumeRejectedClaim(dependencies.store, tokenHash, claimId, now);
      throw new VendorSetupPublicError(
        404,
        "This Vendor setup link is invalid or expired.",
      );
    }
    await releaseRetryableClaim(dependencies.store, tokenHash, claimId, now);
    throw new VendorSetupPublicError(503, "Vendor setup is unavailable.");
  }

  if (!exactLiveFirebaseAuthority(challenge, user)) {
    await consumeRejectedClaim(dependencies.store, tokenHash, claimId, now);
    throw new VendorSetupPublicError(
      404,
      "This Vendor setup link is invalid or expired.",
    );
  }

  let effectsStarted = false;
  // Auth readback can outlive either the setup token or the identity execution it originally
  // observed. Re-read the wall clock immediately before the transactional effect boundary; the
  // store also revalidates the current identity claim in that same transaction.
  const effectsNowDate = clock();
  if (!Number.isFinite(effectsNowDate.getTime())) {
    await releaseRetryableClaim(dependencies.store, tokenHash, claimId, now);
    throw new VendorSetupPublicError(503, "Vendor setup is unavailable.");
  }
  const effectsNow = effectsNowDate.toISOString();
  try {
    effectsStarted = await dependencies.store.startEffects({
      tokenHash,
      claimId,
      now: effectsNow,
    });
  } catch {
    throw new VendorSetupPublicError(503, "Vendor setup is unavailable.");
  }
  if (!effectsStarted) {
    throw new VendorSetupPublicError(409, "This Vendor setup link is unavailable.");
  }

  let resetLink: string;
  try {
    // Token possession and sole effect ownership have both been proven atomically. The
    // non-reclaimable `effect_started` phase prevents a second request from minting another reset
    // credential even if this process stalls beyond the former claim lease.
    if (!user.emailVerified) {
      await dependencies.auth.markEmailVerified(challenge.uid);
    }
    resetLink = validateResetLink(
      await dependencies.auth.generatePasswordResetLink(normalizeEmail(user.email!)),
      expectedReset,
    );
    if (resetLink.includes(token)) {
      // A provider response must never reflect the app setup credential into a redirect URL.
      throw new VendorSetupDependencyError(true);
    }
  } catch (error) {
    // Once external execution starts, no error—retryable or definitive—may release this
    // challenge. Terminal consumption preserves at-most-once Auth mutation/reset-link minting.
    await consumeRejectedClaim(dependencies.store, tokenHash, claimId, effectsNow);
    throw new VendorSetupPublicError(
      error instanceof VendorSetupDependencyError && error.definitive ? 404 : 503,
      error instanceof VendorSetupDependencyError && error.definitive
        ? "This Vendor setup link is invalid or expired."
        : "Vendor setup is unavailable.",
    );
  }

  const consumed = await consumeClaimWithRetry(
    dependencies.store,
    tokenHash,
    claimId,
    effectsNow,
    "completed",
  );
  if (!consumed) {
    // The reset link is deliberately discarded if this request no longer owns the exact claim.
    throw new VendorSetupPublicError(409, "This Vendor setup link is unavailable.");
  }
  return { redirectUrl: resetLink };
}
