// TOTP second factor (D-2 / AUM-3, owner ruling "TOTP only" 2026-07-18). A dependency-free RFC 6238
// implementation: enroll (generate a secret + authenticator-app otpauth URI) and verify a 6-digit code
// with a small time-window tolerance. Pure + deterministic given an injected clock, so it is fully
// unit-testable against the RFC 6238 published vectors with no email/SMS/deploy dependency.
//
// SCOPE: this is the crypto core + pure enrollment helpers only. WHERE a user's secret is stored, and
// the session wiring that enforces the second factor, touch the sensitive identity system and belong
// with the owner-gated self-registration flow — they are deliberately NOT here. Nothing here performs
// any outbound send. The generated secret is per-user and created at runtime; it is never committed.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD_SECONDS = 30;
/** Default acceptance window (±N periods) to tolerate clock skew between server and authenticator. */
const DEFAULT_WINDOW = 1;

export interface TotpParams {
  /** Base32-encoded shared secret (no padding). */
  secret: string;
  digits?: number;
  periodSeconds?: number;
}

/** RFC 4648 base32 encode (no padding), the encoding authenticator apps expect in an otpauth secret. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** RFC 4648 base32 decode; tolerant of lowercase, spaces, and `=` padding. Throws on invalid chars. */
export function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/=+$/u, "").replace(/\s+/gu, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid base32 character in TOTP secret.");
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** Generate a fresh base32 secret (default 20 random bytes = 160 bits, the RFC-recommended size). */
export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

/** HOTP (RFC 4226): the counter-based code the TOTP time-counter feeds into. */
function hotp(secret: Uint8Array, counter: number, digits: number): string {
  const buffer = Buffer.alloc(8);
  // 64-bit big-endian counter. Split to stay within 32-bit bitwise ops.
  buffer.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  buffer.writeUInt32BE(counter % 0x1_0000_0000, 4);
  const digest = createHmac("sha1", Buffer.from(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

/** The TOTP counter (number of periods since the Unix epoch) for a given time in seconds. */
function counterFor(nowSeconds: number, periodSeconds: number): number {
  return Math.floor(nowSeconds / periodSeconds);
}

/** Compute the current TOTP code. `nowSeconds` is injectable so tests are deterministic. */
export function generateTotp(
  params: TotpParams,
  nowSeconds: number = Date.now() / 1000,
): string {
  const digits = params.digits ?? DEFAULT_DIGITS;
  const period = params.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const secret = base32Decode(params.secret);
  return hotp(secret, counterFor(nowSeconds, period), digits);
}

export interface VerifyTotpOptions {
  /** Accept codes ±window periods from now (default 1) to tolerate clock skew. */
  window?: number;
  /** Injectable clock (seconds) for deterministic verification. */
  nowSeconds?: number;
}

/**
 * Verify a submitted code against the secret, scanning ±window periods. Uses a constant-time compare
 * for every candidate so a match is not distinguishable by timing. Returns false for malformed input.
 *
 * REPLAY: this verifier is stateless and therefore cannot detect a code reused within its own period.
 * The consuming sign-in/enrollment flow must record the last-accepted counter (or code) per user and
 * refuse a second use — that enforcement is intentionally out of scope for this pure primitive.
 */
export function verifyTotp(
  params: TotpParams,
  token: string,
  options: VerifyTotpOptions = {},
): boolean {
  const digits = params.digits ?? DEFAULT_DIGITS;
  const period = params.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const window = options.window ?? DEFAULT_WINDOW;
  const nowSeconds = options.nowSeconds ?? Date.now() / 1000;

  const normalized = token.replace(/\s+/gu, "");
  if (!new RegExp(`^\\d{${digits}}$`, "u").test(normalized)) {
    return false;
  }

  const secret = base32Decode(params.secret);
  const baseCounter = counterFor(nowSeconds, period);
  let matched = false;
  // Scan the full window without early-exit so overall time does not leak which offset matched.
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = hotp(secret, baseCounter + offset, digits);
    if (constantTimeEquals(candidate, normalized)) {
      matched = true;
    }
  }
  return matched;
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

export interface TotpAuthUriInput {
  secret: string;
  /** The user identity shown in the authenticator app (e.g. an email address). */
  accountName: string;
  /** The issuer/app label shown in the authenticator app. */
  issuer: string;
  digits?: number;
  periodSeconds?: number;
}

/**
 * Build the `otpauth://totp/...` URI an authenticator app imports (typically via a QR code). The label
 * and issuer are URL-encoded. This URI carries the shared secret and must be treated as sensitive.
 */
export function totpAuthUri(input: TotpAuthUriInput): string {
  const label = `${input.issuer}:${input.accountName}`;
  const query = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: String(input.digits ?? DEFAULT_DIGITS),
    period: String(input.periodSeconds ?? DEFAULT_PERIOD_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
}
