/** Test-fixture ownership only: settling a request does not cancel it or change its result. */
export function createPendingRequestTracker() {
  const pending = new Set<Promise<unknown>>();
  let started = 0;
  let fulfilled = 0;
  let rejected = 0;

  function snapshot() {
    return { started, fulfilled, rejected, pending: pending.size };
  }

  function track<T>(request: Promise<T>): Promise<T> {
    if (pending.has(request)) return request;
    started++;
    pending.add(request);
    // Both callbacks resolve: unlike an ignored finally(), this cannot create an unhandled
    // rejecting derivative. Keep failures even when the request settles before drain begins.
    void request.then(
      () => {
        pending.delete(request);
        fulfilled++;
      },
      () => {
        pending.delete(request);
        rejected++;
      },
    );
    return request;
  }

  function drainDeadline(timeoutMs: number) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error("Pending-request drain requires a positive bounded timeout.");
    }
    return performance.now() + timeoutMs;
  }

  async function drainUntil(deadline: number) {
    while (pending.size) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw new PendingRequestDrainError(pending.size);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.allSettled([...pending]),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new PendingRequestDrainError(pending.size)),
              remaining,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      // A still-running route may have issued another intercepted request while we waited.
    }
    return snapshot();
  }

  async function drain(timeoutMs: number) {
    return drainUntil(drainDeadline(timeoutMs));
  }

  async function runAfterDrain<T>(reset: () => T | Promise<T>, timeoutMs: number) {
    const deadline = drainDeadline(timeoutMs);
    do {
      await drainUntil(deadline);
      // Recheck in the same continuation as reset: another request can be registered in
      // the await gap, even after an empty drain. It shares the original timeout budget.
    } while (pending.size);
    return reset();
  }

  return { track, snapshot, drain, runAfterDrain };
}

export class PendingRequestDrainError extends Error {
  readonly pendingCount: number;

  constructor(pendingCount: number) {
    super("Pending test requests did not settle; fixture reset was refused.");
    this.name = "PendingRequestDrainError";
    this.pendingCount = pendingCount;
  }
}
