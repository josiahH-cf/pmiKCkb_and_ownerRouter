import { describe, expect, it } from "vitest";

import {
  INTAKE_TOKEN_MAX_TTL_MS,
  INTAKE_TOKEN_VERSION,
  mintIntakeToken,
  verifyIntakeToken,
} from "@/lib/maintenance/intake-token";

const SECRET = "unit-test-secret";
const NOW = Date.parse("2026-07-09T00:00:00.000Z");

function mint(overrides: Partial<Parameters<typeof mintIntakeToken>[0]> = {}) {
  return mintIntakeToken(
    { secret: SECRET, propertyKey: "prop-123", jti: "jti-abc", epoch: 0, ...overrides },
    NOW,
  );
}

describe("intake token mint + verify", () => {
  it("round-trips a valid token", () => {
    const token = mint();
    const result = verifyIntakeToken(SECRET, token, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.v).toBe(INTAKE_TOKEN_VERSION);
      expect(result.payload.propertyKey).toBe("prop-123");
      expect(result.payload.jti).toBe("jti-abc");
      expect(result.payload.singleUse).toBe(true);
      expect(result.payload.epoch).toBe(0);
    }
  });

  it("rejects a token signed with a different secret", () => {
    const token = mint();
    expect(verifyIntakeToken("other-secret", token, NOW)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const token = mint();
    const [, sig] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({
        v: INTAKE_TOKEN_VERSION,
        propertyKey: "attacker-prop",
        jti: "x",
        iat: NOW,
        exp: NOW + 1000,
        epoch: 0,
        singleUse: true,
      }),
      "utf8",
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifyIntakeToken(SECRET, `${forgedPayload}.${sig}`, NOW).ok).toBe(false);
  });

  it("does NOT throw on a signature of a different length (timingSafeEqual guard)", () => {
    const token = mint();
    const [payload] = token.split(".");
    // A short/garbage signature must return a generic failure, never crash the caller.
    expect(() => verifyIntakeToken(SECRET, `${payload}.short`, NOW)).not.toThrow();
    expect(verifyIntakeToken(SECRET, `${payload}.short`, NOW).ok).toBe(false);
  });

  it("reports expired once past exp", () => {
    const token = mint({ ttlMs: 1000 });
    expect(verifyIntakeToken(SECRET, token, NOW + 2000)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("clamps the lifetime to the max TTL at mint time", () => {
    const token = mint({ ttlMs: INTAKE_TOKEN_MAX_TTL_MS * 10 });
    const result = verifyIntakeToken(SECRET, token, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.exp - result.payload.iat).toBeLessThanOrEqual(
        INTAKE_TOKEN_MAX_TTL_MS,
      );
    }
  });

  it("fails closed for a missing secret or missing token", () => {
    const token = mint();
    expect(verifyIntakeToken(undefined, token, NOW).ok).toBe(false);
    expect(verifyIntakeToken(SECRET, undefined, NOW).ok).toBe(false);
    expect(verifyIntakeToken(SECRET, "", NOW).ok).toBe(false);
    expect(verifyIntakeToken(SECRET, "no-dot-here", NOW).ok).toBe(false);
  });

  it("refuses to mint without a secret or propertyKey", () => {
    expect(() =>
      mintIntakeToken({ secret: "", propertyKey: "p", jti: "j", epoch: 0 }),
    ).toThrow();
    expect(() =>
      mintIntakeToken({ secret: SECRET, propertyKey: "", jti: "j", epoch: 0 }),
    ).toThrow();
  });
});
