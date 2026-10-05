export class OperationWaitError extends Error {
  constructor(read: boolean) {
    super(
      read
        ? "This read did not finish. Retry when ready."
        : "The response did not arrive. The outcome is unknown; recover the original attempt before trying again.",
    );
    this.name = "OperationWaitError";
  }
}
/** The message for a failed request: an elapsed wait keeps its own wording, never a definite failure. */
export function waitFailureMessage(error: unknown, fallback: string): string {
  return error instanceof OperationWaitError ? error.message : fallback;
}
/** A deadline stops local waiting; it never implies cancellation at the server/provider. */
export async function fetchWithDeadline(
  input: RequestInfo | URL,
  init: RequestInit = {},
  waitMs = 60_000,
): Promise<Response> {
  if (!Number.isFinite(waitMs) || waitMs <= 0)
    throw new RangeError("The request wait must be finite and positive.");
  const deadline = Date.now() + waitMs;
  const controller = new AbortController();
  const onAbort = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener("abort", onAbort, { once: true });
  if (init.signal?.aborted) onAbort();
  if (controller.signal.aborted)
    throw new DOMException("Local waiting was stopped before dispatch.", "AbortError");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      fetch(input, { ...init, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new OperationWaitError((init.method ?? "GET").toUpperCase() === "GET"));
        }, waitMs);
      }),
    ]);
    const readers = new Set(["json", "text", "blob", "arrayBuffer", "formData", "bytes"]);
    return new Proxy(response, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (typeof value !== "function") return value;
        if (typeof key !== "string" || !readers.has(key)) return value.bind(target);
        return async (...args: unknown[]) => {
          const remaining = deadline - Date.now();
          if (remaining <= 0 || init.signal?.aborted)
            throw new OperationWaitError((init.method ?? "GET").toUpperCase() === "GET");
          let bodyTimer: ReturnType<typeof setTimeout> | undefined;
          init.signal?.addEventListener("abort", onAbort, { once: true });
          try {
            return await Promise.race([
              value.apply(target, args),
              new Promise<never>((_, reject) => {
                bodyTimer = setTimeout(() => {
                  controller.abort();
                  reject(
                    new OperationWaitError(
                      (init.method ?? "GET").toUpperCase() === "GET",
                    ),
                  );
                }, remaining);
              }),
            ]);
          } finally {
            clearTimeout(bodyTimer);
            init.signal?.removeEventListener("abort", onAbort);
          }
        };
      },
    });
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", onAbort);
  }
}
