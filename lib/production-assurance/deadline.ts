export const ASSURANCE_PROVIDER_TIMEOUT_MS = 30_000;
export const ASSURANCE_RUN_TIMEOUT_MS = 10 * 60 * 1_000;

export interface AssuranceDeadline {
  readonly deadlineAtMs: number;
  readonly signal: AbortSignal;
  dispose(): void;
}

/** One abort signal owns the complete run and its timer is explicitly disposed on every exit. */
export function createAssuranceDeadline(
  deadlineAtMs: number,
  parentSignal?: AbortSignal,
  nowMs = Date.now(),
): AssuranceDeadline {
  if (!Number.isFinite(deadlineAtMs)) throw new Error("assurance_deadline_invalid");
  const controller = new AbortController();
  const abort = (): void => {
    if (!controller.signal.aborted) {
      controller.abort(new Error("assurance_deadline_exceeded"));
    }
  };
  const parentAbort = (): void => abort();
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener("abort", parentAbort, { once: true });
  const timer = setTimeout(abort, Math.max(0, deadlineAtMs - nowMs));
  return {
    deadlineAtMs,
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", parentAbort);
      // A raced SDK call may still be resolving even though the caller has finished. Abort on every
      // exit so signal-aware network operations and cleanup listeners cannot outlive the run.
      abort();
    },
  };
}

/** Bound APIs that do not expose a usable abort signal (notably Firestore reads). */
export async function withAssuranceTimeout<T>(
  operation: () => Promise<T>,
  code = "assurance_provider_timeout",
  timeoutMs = ASSURANCE_PROVIDER_TIMEOUT_MS,
  options: { readonly onTimeout?: () => void | Promise<void> } = {},
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error(code);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timeoutCleanup: Promise<void> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          timeoutCleanup = Promise.resolve(options.onTimeout?.()).then(
            () => undefined,
            () => undefined,
          );
          reject(new Error(code));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (timeoutCleanup) await timeoutCleanup;
  }
}

export function assuranceAbortSignal(
  timeoutMs = ASSURANCE_PROVIDER_TIMEOUT_MS,
  sharedSignal?: AbortSignal,
): AbortSignal {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return AbortSignal.abort(new Error("assurance_deadline_exceeded"));
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  return sharedSignal ? AbortSignal.any([sharedSignal, timeout]) : timeout;
}

export function remainingAssuranceTime(
  deadlineAtMs: number,
  maximumMs = ASSURANCE_PROVIDER_TIMEOUT_MS,
  nowMs = Date.now(),
): number {
  if (!Number.isFinite(deadlineAtMs)) throw new Error("assurance_deadline_invalid");
  return Math.max(0, Math.min(maximumMs, deadlineAtMs - nowMs));
}
