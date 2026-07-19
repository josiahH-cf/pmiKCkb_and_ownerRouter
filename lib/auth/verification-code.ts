// One-time verification codes (D-2 / AUM-2 email-code verification + AUM-4 password reset). A pure,
// dependency-free primitive: mint a short numeric code to DELIVER, and verify a submitted code against
// a stored hash with an expiry. The plaintext code is never stored — only a salted SHA-256 hash — and
// comparison is constant-time. Policy (length, TTL) is injectable so this is not guessing an app rule.
//
// SCOPE: crypto core only. The DELIVERY channel (email/SMS) is owner-gated and out of scope. Attempt
// counting / lockout and single-use invalidation are stateful and belong to the consuming flow (it must
// cap attempts and delete the challenge on success). Nothing here sends anything. Staff/cloud/build
// identities never self-register — this primitive is for the end-user (owner/renter/vendor) flow only.

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const DEFAULT_DIGITS = 6;
const DEFAULT_TTL_SECONDS = 600; // 10 minutes

export interface VerificationChallenge {
  /** Salted SHA-256 hash of the code (hex). Safe to persist; the plaintext code is not. */
  hash: string;
  /** Per-challenge random salt (hex). */
  salt: string;
  /** Absolute expiry, Unix seconds. */
  expiresAtSeconds: number;
}

export interface CreatedVerification extends VerificationChallenge {
  /** The plaintext code to DELIVER to the user out-of-band. Never persist this. */
  code: string;
}

/** Mint a zero-padded numeric code using a CSPRNG (uniform, no modulo bias). */
export function generateVerificationCode(digits = DEFAULT_DIGITS): string {
  return randomInt(0, 10 ** digits)
    .toString()
    .padStart(digits, "0");
}

function hashCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

/** Create a challenge: returns the code to deliver plus the persistable {hash, salt, expiresAt}. */
export function createVerification(
  options: { digits?: number; ttlSeconds?: number; nowSeconds?: number } = {},
): CreatedVerification {
  const digits = options.digits ?? DEFAULT_DIGITS;
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const now = options.nowSeconds ?? Date.now() / 1000;
  const code = generateVerificationCode(digits);
  const salt = randomBytes(16).toString("hex");
  return {
    code,
    salt,
    hash: hashCode(code, salt),
    expiresAtSeconds: Math.floor(now) + ttl,
  };
}

/**
 * Verify a submitted code against a stored challenge. Returns false when expired or mismatched. Uses a
 * constant-time hash comparison so a match is not distinguishable by timing. The caller must still cap
 * attempts and invalidate the challenge on success (single-use) — this primitive is stateless.
 */
export function verifyVerificationCode(
  challenge: VerificationChallenge,
  submitted: string,
  nowSeconds: number = Date.now() / 1000,
): boolean {
  if (nowSeconds > challenge.expiresAtSeconds) {
    return false;
  }
  const candidate = hashCode(submitted.replace(/\s+/gu, ""), challenge.salt);
  return constantTimeHexEquals(candidate, challenge.hash);
}

function constantTimeHexEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length !== bufferB.length || bufferA.length === 0) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
