// In-instance token-bucket pre-gate for the public tokenized maintenance intake (A5). PURE (no deps).
//
// This is the CHEAP first line of defense: it runs before any HMAC verify or Firestore read, so a burst
// of junk requests is shed in-process without spending crypto or a billable read. It is best-effort and
// per-instance (memory only — it does NOT coordinate across Cloud Run instances), so it is explicitly
// NOT the authoritative limit; the per-property global daily cap enforced transactionally in the writer
// is. Keying is up to the caller (we key on the salted IP hash, falling back to a single global bucket
// when no IP is available) so a spoofed-XFF flood can't multiply buckets.

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimiterOptions {
  /** Bucket capacity — the largest instantaneous burst allowed. */
  capacity: number;
  /** Sustained refill rate (tokens per second). */
  refillPerSecond: number;
  /** Max distinct keys held before the oldest are evicted (memory bound). */
  maxKeys: number;
}

export const DEFAULT_INTAKE_RATE_LIMIT: RateLimiterOptions = {
  capacity: 10,
  refillPerSecond: 0.2, // ~1 sustained request per 5s per key after the burst is spent
  maxKeys: 10_000,
};

/**
 * A token-bucket limiter with injectable time (so tests are deterministic). One instance per process;
 * the public route holds a module-level singleton.
 */
export class IntakeRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly options: RateLimiterOptions = DEFAULT_INTAKE_RATE_LIMIT) {}

  check(key: string, now: number): RateLimitDecision {
    const { capacity, refillPerSecond, maxKeys } = this.options;
    let bucket = this.buckets.get(key);

    if (!bucket) {
      if (this.buckets.size >= maxKeys) {
        // Evict the least-recently-updated key to bound memory (simple, good enough for a pre-gate).
        let oldestKey: string | null = null;
        let oldestAt = Infinity;
        for (const [candidateKey, candidate] of this.buckets) {
          if (candidate.updatedAt < oldestAt) {
            oldestAt = candidate.updatedAt;
            oldestKey = candidateKey;
          }
        }
        if (oldestKey !== null) this.buckets.delete(oldestKey);
      }
      bucket = { tokens: capacity, updatedAt: now };
      this.buckets.set(key, bucket);
    } else {
      const elapsedSec = Math.max(0, (now - bucket.updatedAt) / 1000);
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSecond);
      bucket.updatedAt = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, retryAfterMs: 0 };
    }

    const deficit = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil((deficit / refillPerSecond) * 1000);
    return { allowed: false, retryAfterMs };
  }

  /** Test-only: drop all buckets. */
  reset(): void {
    this.buckets.clear();
  }
}
