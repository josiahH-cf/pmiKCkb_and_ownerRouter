import { clearImmediate, setImmediate } from "node:timers";
import {
  createPendingRequestTracker,
  PendingRequestDrainError,
} from "./pending-requests";

type Tracker = ReturnType<typeof createPendingRequestTracker>;

/**
 * Fixture-only fence for tracked HTTP/transaction promises followed by immediate synthetic source
 * promises. The event-loop turn lets their microtask-only mapping/detail/cache publication finish.
 * This does not own untracked timers, delayed providers, network requests, or arbitrary background
 * jobs. Those require their own tracked promises before this fence can protect fixture reset.
 */
export async function runAfterImmediateSourceDrain<T>(
  tracker: Tracker,
  reset: () => T | Promise<T>,
  timeoutMs: number,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error("Immediate-source drain requires a positive bounded timeout.");
  const deadline = performance.now() + timeoutMs;
  const remaining = () => {
    const budget = deadline - performance.now();
    if (budget <= 0) throw new PendingRequestDrainError(tracker.snapshot().pending);
    return budget;
  };
  while (true) {
    await tracker.drain(remaining());
    const startedBeforeTurn = tracker.snapshot().started;
    await new Promise<void>((resolve, reject) => {
      const budget = remaining();
      const turn = setImmediate(() => {
        clearTimeout(timer);
        resolve();
      });
      const timer = setTimeout(() => {
        clearImmediate(turn);
        reject(new PendingRequestDrainError(tracker.snapshot().pending));
      }, budget);
    });
    remaining();
    const current = tracker.snapshot();
    if (current.pending || current.started !== startedBeforeTurn) continue;
    // No await between the final ownership check and invoking reset.
    return reset();
  }
}
