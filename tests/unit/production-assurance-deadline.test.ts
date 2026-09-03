import { describe, expect, it, vi } from "vitest";

import {
  assuranceAbortSignal,
  createAssuranceDeadline,
  remainingAssuranceTime,
  withAssuranceTimeout,
} from "@/lib/production-assurance";

describe("production assurance deadlines", () => {
  it("turns a provider that never settles into a bounded symbolic refusal", async () => {
    vi.useFakeTimers();
    try {
      const result = withAssuranceTimeout(
        () => new Promise<never>(() => undefined),
        "exact_provider_deadline",
        25,
      );
      const rejection = expect(result).rejects.toThrow("exact_provider_deadline");
      await vi.advanceTimersByTimeAsync(25);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("caps every call at the remaining global budget and rejects exhausted budgets", () => {
    expect(remainingAssuranceTime(11_000, 30_000, 10_000)).toBe(1_000);
    expect(remainingAssuranceTime(50_000, 30_000, 10_000)).toBe(30_000);
    expect(remainingAssuranceTime(9_999, 30_000, 10_000)).toBe(0);
    expect(assuranceAbortSignal(0).aborted).toBe(true);
  });

  it("aborts every shared operation at one global deadline and disposes its timer", async () => {
    vi.useFakeTimers();
    try {
      const deadline = createAssuranceDeadline(10_025, undefined, 10_000);
      expect(deadline.signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(25);
      expect(deadline.signal.aborted).toBe(true);

      const disposed = createAssuranceDeadline(20_025, undefined, 20_000);
      disposed.dispose();
      expect(disposed.signal.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(25);
    } finally {
      vi.useRealTimers();
    }
  });

  it("awaits timeout cleanup before a raced provider is allowed to escape", async () => {
    vi.useFakeTimers();
    try {
      let releaseCleanup!: () => void;
      const cleanupFinished = new Promise<void>((resolve) => {
        releaseCleanup = resolve;
      });
      const onTimeout = vi.fn(() => cleanupFinished);
      const result = withAssuranceTimeout(
        () => new Promise<never>(() => undefined),
        "provider_stalled",
        25,
        { onTimeout },
      );
      let rejected = false;
      void result.catch(() => {
        rejected = true;
      });
      await vi.advanceTimersByTimeAsync(25);
      expect(onTimeout).toHaveBeenCalledOnce();
      expect(rejected).toBe(false);
      releaseCleanup();
      await expect(result).rejects.toThrow("provider_stalled");
    } finally {
      vi.useRealTimers();
    }
  });
});
