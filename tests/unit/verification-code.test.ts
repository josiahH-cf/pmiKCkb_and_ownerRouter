import { describe, expect, it } from "vitest";

import {
  createVerification,
  generateVerificationCode,
  verifyVerificationCode,
} from "@/lib/auth/verification-code";

describe("verification code", () => {
  it("mints a zero-padded numeric code of the requested length", () => {
    expect(generateVerificationCode()).toMatch(/^\d{6}$/u);
    expect(generateVerificationCode(8)).toMatch(/^\d{8}$/u);
  });

  it("never stores the plaintext code and salts the hash", () => {
    const now = 1700000000;
    const a = createVerification({ nowSeconds: now });
    const b = createVerification({ nowSeconds: now });
    // Different salts ⇒ different hashes even if two codes ever collided.
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toContain(a.code);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(a.expiresAtSeconds).toBe(now + 600);
  });

  it("verifies the correct code within the TTL and rejects a wrong one", () => {
    const now = 1700000000;
    const challenge = createVerification({ nowSeconds: now });
    expect(verifyVerificationCode(challenge, challenge.code, now)).toBe(true);
    const wrong = challenge.code === "000000" ? "111111" : "000000";
    expect(verifyVerificationCode(challenge, wrong, now)).toBe(false);
  });

  it("tolerates incidental whitespace in the submitted code", () => {
    const now = 1700000000;
    const challenge = createVerification({ digits: 6, nowSeconds: now });
    const spaced = `${challenge.code.slice(0, 3)} ${challenge.code.slice(3)}`;
    expect(verifyVerificationCode(challenge, spaced, now)).toBe(true);
  });

  it("rejects an expired code even when correct", () => {
    const now = 1700000000;
    const challenge = createVerification({ ttlSeconds: 300, nowSeconds: now });
    expect(verifyVerificationCode(challenge, challenge.code, now + 299)).toBe(true);
    expect(verifyVerificationCode(challenge, challenge.code, now + 301)).toBe(false);
  });

  it("honors a custom TTL and digit length", () => {
    const now = 1700000000;
    const challenge = createVerification({
      digits: 8,
      ttlSeconds: 120,
      nowSeconds: now,
    });
    expect(challenge.code).toMatch(/^\d{8}$/u);
    expect(challenge.expiresAtSeconds).toBe(now + 120);
  });
});
