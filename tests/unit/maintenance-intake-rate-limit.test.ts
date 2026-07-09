import { describe, expect, it } from "vitest";

import { IntakeRateLimiter } from "@/lib/maintenance/intake-rate-limit";

describe("IntakeRateLimiter", () => {
  it("allows a burst up to capacity, then blocks", () => {
    const limiter = new IntakeRateLimiter({
      capacity: 3,
      refillPerSecond: 0.001,
      maxKeys: 100,
    });
    const now = 1_000_000;
    expect(limiter.check("k", now).allowed).toBe(true);
    expect(limiter.check("k", now).allowed).toBe(true);
    expect(limiter.check("k", now).allowed).toBe(true);
    const blocked = limiter.check("k", now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("refills over time", () => {
    const limiter = new IntakeRateLimiter({
      capacity: 1,
      refillPerSecond: 1,
      maxKeys: 100,
    });
    const now = 5_000_000;
    expect(limiter.check("k", now).allowed).toBe(true);
    expect(limiter.check("k", now).allowed).toBe(false);
    // One second later, one token has refilled.
    expect(limiter.check("k", now + 1000).allowed).toBe(true);
  });

  it("keys are independent", () => {
    const limiter = new IntakeRateLimiter({
      capacity: 1,
      refillPerSecond: 0.001,
      maxKeys: 100,
    });
    const now = 2_000_000;
    expect(limiter.check("a", now).allowed).toBe(true);
    expect(limiter.check("a", now).allowed).toBe(false);
    expect(limiter.check("b", now).allowed).toBe(true);
  });

  it("bounds memory by evicting the oldest key past maxKeys", () => {
    const limiter = new IntakeRateLimiter({
      capacity: 5,
      refillPerSecond: 0.001,
      maxKeys: 2,
    });
    limiter.check("a", 1000);
    limiter.check("b", 2000);
    limiter.check("c", 3000); // evicts "a" (oldest)
    // "a" was evicted, so it starts fresh at full capacity again.
    const revived = limiter.check("a", 4000);
    expect(revived.allowed).toBe(true);
  });
});
