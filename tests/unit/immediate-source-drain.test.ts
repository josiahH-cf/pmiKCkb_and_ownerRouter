import { setImmediate } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearLiveLeaseCache,
  getLiveLeaseSnapshot,
  LEASE_EXPORT_TTL_MS,
} from "@/lib/lease-renewal/live-lease-cache";
import { runAfterImmediateSourceDrain } from "../helpers/immediate-source-drain";
import { createPendingRequestTracker } from "../helpers/pending-requests";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(async () => {
  // Every test releases its owned work; this turn finishes immediate synthetic continuations.
  await setImmediate();
  clearLiveLeaseCache();
  vi.restoreAllMocks();
});

describe("immediate synthetic source fixture lifecycle", () => {
  it.each([false, true])(
    "real stale cache returns before admission settles; turn fence=%s owns cache publication",
    async (fenced) => {
      clearLiveLeaseCache();
      const tracker = createPendingRequestTracker();
      const admission = deferred<void>();
      const events: string[] = [];
      let exports = 0;
      const reader = {
        beforeLeaseSourceRead: async () => {
          if (exports > 0) await tracker.track(admission.promise);
        },
        listAllLeasesExport: async () => {
          exports++;
          events.push(`export_${exports}`);
          return { rows: [{ lease: { leaseID: 1 } }], pages: 1, complete: true };
        },
        getLease: async () => {
          // A finite chain of immediately fulfilled promises models the source's async mapping
          // and detail continuations. There is no timer, network, extra read, or changed cache TTL.
          for (let step = 0; step < 20; step++) await Promise.resolve();
          events.push(`detail_${exports}`);
          return { leaseID: 1, baseRentAmount: "1000.00" };
        },
      };
      try {
        const initialAt = 1_000;
        await getLiveLeaseSnapshot(reader, initialAt);
        const staleAt = initialAt + LEASE_EXPORT_TTL_MS;
        const stale = await tracker.track(getLiveLeaseSnapshot(reader, staleAt));
        expect(stale.currency.state).toBe("stale");
        expect(stale.currency.refreshing).toBe(true);
        expect(stale.snapshot.readAtMs).toBe(initialAt);
        expect(tracker.snapshot().pending).toBe(1);
        expect(exports).toBe(1);

        let snapshotAtReset: number | undefined;
        const reset = vi.fn(async () => {
          events.push("reset");
          // Observes the already held entry without causing another source fetch.
          snapshotAtReset = (await getLiveLeaseSnapshot(reader, staleAt)).snapshot
            .readAtMs;
        });
        const finished = fenced
          ? runAfterImmediateSourceDrain(tracker, reset, 1_000)
          : tracker.runAfterDrain(reset, 1_000);
        await Promise.resolve();
        expect(reset).not.toHaveBeenCalled();
        admission.resolve();
        await finished;
        expect(reset).toHaveBeenCalledTimes(1);
        expect(snapshotAtReset).toBe(fenced ? staleAt : initialAt);
        await setImmediate();
        expect(exports).toBe(2);
        expect(events.indexOf("detail_2") < events.indexOf("reset")).toBe(fenced);
        expect((await getLiveLeaseSnapshot(reader, staleAt)).snapshot.readAtMs).toBe(
          staleAt,
        );
        expect(exports).toBe(2);
      } finally {
        admission.resolve();
        await setImmediate();
      }
    },
  );

  it("rechecks work registered during the empty-drain turn before reset", async () => {
    const tracker = createPendingRequestTracker();
    const late = deferred<void>();
    const reset = vi.fn();
    const finished = runAfterImmediateSourceDrain(tracker, reset, 1_000);
    // The fence has awaited its initially empty drain. Register new ownership before its turn.
    tracker.track(late.promise);
    try {
      await setImmediate();
      expect(reset).not.toHaveBeenCalled();
      late.resolve();
      await finished;
      expect(reset).toHaveBeenCalledTimes(1);
      expect(tracker.snapshot().pending).toBe(0);
    } finally {
      late.resolve();
      await finished;
    }
  });

  it("refuses reset when a tracked source exceeds the original bounded budget", async () => {
    const tracker = createPendingRequestTracker();
    const held = deferred<void>();
    tracker.track(held.promise);
    const reset = vi.fn();
    try {
      await expect(
        runAfterImmediateSourceDrain(tracker, reset, 20),
      ).rejects.toMatchObject({
        name: "PendingRequestDrainError",
        pendingCount: 1,
      });
      expect(reset).not.toHaveBeenCalled();
      expect(tracker.snapshot().pending).toBe(1);
    } finally {
      held.resolve();
      await tracker.drain(1_000);
    }
  });

  it("does not reset when its final turn has exhausted the same original budget", async () => {
    const tracker = createPendingRequestTracker();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const reset = vi.fn();
    const finished = runAfterImmediateSourceDrain(tracker, reset, 10);
    // Exhaust the budget after the initial drain, without introducing a new timeout allowance.
    const advance = setImmediate().then(() => {
      now = 11;
    });
    await expect(finished).rejects.toMatchObject({ name: "PendingRequestDrainError" });
    await advance;
    expect(reset).not.toHaveBeenCalled();
  });
});
