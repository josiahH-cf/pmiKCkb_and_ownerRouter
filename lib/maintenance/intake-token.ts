// Signed, self-contained token for the public tokenized maintenance intake (A5). A staff member mints
// one for a specific property; a tenant/vendor can then submit ONE maintenance report without signing
// in. The token is HMAC-signed so it cannot be forged, carries its own expiry, a single-use nonce
// (jti), and a revocation epoch — no server lookup is needed to authenticate it (the epoch/nonce are
// checked later, at write time). This module is PURE crypto (node:crypto only): no Firestore, no
// next/*, no auth — so it can be unit-tested deterministically and reused by both the mint route and
// the CLI.
//
// Threat-model choices baked in here (adversarial pass):
//   - HMAC is computed over the LITERAL received payload bytes (never parse-then-reencode), with a
//     version domain-separator prefix, so a token minted for one scheme can never validate under
//     another and a canonicalization mismatch can't be exploited.
//   - Verification uses a constant-time compare guarded by a length check first, because
//     crypto.timingSafeEqual THROWS on a length mismatch — an unguarded call would turn a forged token
//     into a 500 (a crash/timing oracle). Every failure returns the SAME generic result.
//   - A verify-side MAX_TTL clamps the lifetime even if a token claims a longer window, so a stolen
//     mint secret can't be used to forge effectively-eternal tokens (mint also clamps).

import { createHmac, timingSafeEqual } from "node:crypto";

/** Version + domain separator. Bump this to hard-invalidate every previously minted token. */
export const INTAKE_TOKEN_VERSION = "maint-intake-v1";

export const INTAKE_TOKEN_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // single-use links: 7 days
export const INTAKE_TOKEN_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000; // verify-side hard ceiling: 30 days

const MAX_PROPERTY_KEY_LENGTH = 128;

export interface IntakeTokenPayload {
  /** Scheme version; must equal INTAKE_TOKEN_VERSION. */
  v: string;
  /** Opaque property identifier the token authorizes intake for (bounded, safe charset). */
  propertyKey: string;
  /** Unique token id — consumed once for single-use tokens (replay guard). */
  jti: string;
  /** Issued-at (epoch ms). */
  iat: number;
  /** Expiry (epoch ms). */
  exp: number;
  /** Property revocation epoch at mint time; a write is rejected if the property's epoch has advanced. */
  epoch: number;
  /** When true the jti is burned on first successful write (default posture). */
  singleUse: boolean;
  /** Signed lane. Older v1 tokens without this claim normalize to live. */
  dataMode: "live" | "test";
}

export interface MintIntakeTokenInput {
  secret: string;
  propertyKey: string;
  jti: string;
  epoch: number;
  ttlMs?: number;
  singleUse?: boolean;
  dataMode?: "live" | "test";
}

export type VerifyIntakeTokenResult =
  | { ok: true; payload: IntakeTokenPayload }
  | { ok: false; reason: "invalid" | "expired" };

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
}

/** HMAC over the version-prefixed, encoded payload — the exact string that travels in the token. */
function signPayload(secret: string, payloadB64: string): string {
  return createHmac("sha256", secret)
    .update(`${INTAKE_TOKEN_VERSION}|${payloadB64}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Mint a signed intake token. `now` is injectable for deterministic tests. The lifetime is clamped to
 * INTAKE_TOKEN_MAX_TTL_MS at mint time (and again at verify time) so no caller can create an eternal
 * token. Requires a non-empty secret and a bounded, non-empty propertyKey — throws otherwise (a caller
 * with no secret must fail closed, never mint an unsigned/guessable token).
 */
export function mintIntakeToken(
  input: MintIntakeTokenInput,
  now: number = Date.now(),
): string {
  const secret = input.secret?.trim();
  if (!secret) {
    throw new Error("Cannot mint an intake token without a signing secret.");
  }
  const propertyKey = input.propertyKey?.trim();
  if (!propertyKey || propertyKey.length > MAX_PROPERTY_KEY_LENGTH) {
    throw new Error("Intake token requires a non-empty, bounded propertyKey.");
  }
  const jti = input.jti?.trim();
  if (!jti) {
    throw new Error("Intake token requires a jti.");
  }

  const ttlMs = Math.min(
    Math.max(1, input.ttlMs ?? INTAKE_TOKEN_DEFAULT_TTL_MS),
    INTAKE_TOKEN_MAX_TTL_MS,
  );
  const payload: IntakeTokenPayload = {
    v: INTAKE_TOKEN_VERSION,
    propertyKey,
    jti,
    iat: now,
    exp: now + ttlMs,
    epoch: Math.max(0, Math.trunc(input.epoch)),
    singleUse: input.singleUse ?? true,
    dataMode: input.dataMode ?? "live",
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  return `${payloadB64}.${signPayload(secret, payloadB64)}`;
}

/**
 * Verify an intake token. Returns a discriminated result — never throws for a bad/forged/expired token,
 * so the caller can map every failure to one generic response with no error-type or timing oracle. A
 * missing secret always yields `invalid` (fail closed). `now` is injectable for deterministic tests.
 */
export function verifyIntakeToken(
  secret: string | undefined,
  token: string | undefined,
  now: number = Date.now(),
): VerifyIntakeTokenResult {
  const trimmedSecret = secret?.trim();
  if (!trimmedSecret || !token) {
    return { ok: false, reason: "invalid" };
  }

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) {
    return { ok: false, reason: "invalid" };
  }
  const payloadB64 = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  // Constant-time compare, but only after a length guard: timingSafeEqual throws on unequal lengths.
  const expectedSig = signPayload(trimmedSecret, payloadB64);
  let signatureOk = false;
  try {
    const expectedBuf = Buffer.from(expectedSig);
    const providedBuf = Buffer.from(providedSig);
    signatureOk =
      expectedBuf.length === providedBuf.length &&
      timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) {
    return { ok: false, reason: "invalid" };
  }

  let payload: IntakeTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64)) as IntakeTokenPayload;
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (
    !payload ||
    payload.v !== INTAKE_TOKEN_VERSION ||
    typeof payload.propertyKey !== "string" ||
    payload.propertyKey.length === 0 ||
    payload.propertyKey.length > MAX_PROPERTY_KEY_LENGTH ||
    typeof payload.jti !== "string" ||
    payload.jti.length === 0 ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    typeof payload.epoch !== "number" ||
    typeof payload.singleUse !== "boolean" ||
    (payload.dataMode !== undefined &&
      payload.dataMode !== "live" &&
      payload.dataMode !== "test") ||
    !Number.isFinite(payload.iat) ||
    !Number.isFinite(payload.exp)
  ) {
    return { ok: false, reason: "invalid" };
  }

  // Verify-side lifetime ceiling: reject anything whose claimed window exceeds MAX_TTL, independent of
  // what mint clamped. Then the ordinary expiry check.
  if (payload.exp - payload.iat > INTAKE_TOKEN_MAX_TTL_MS) {
    return { ok: false, reason: "invalid" };
  }
  if (now >= payload.exp) {
    return { ok: false, reason: "expired" };
  }

  // Backward compatibility for already-minted v1 tokens. The absent claim can only narrow to the
  // pre-existing Live behavior; a Test lane always requires an explicitly signed claim.
  payload.dataMode ??= "live";

  return { ok: true, payload };
}
