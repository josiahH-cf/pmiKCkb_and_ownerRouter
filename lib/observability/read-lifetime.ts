// Bounds the caller's read wait. This does not cancel or redispatch work at the source.
// Diagnostics contain only a fixed phase key and duration, never values, URLs or identities.
export const SOURCE_READ_WAIT_MS = 60_000;
export class ReadDeadlineError extends Error {
  constructor() {
    super("The source read did not finish within its supported wait.");
    this.name = "ReadDeadlineError";
  }
}
export async function withReadDeadline<T>(
  read: () => Promise<T>,
  waitMs = SOURCE_READ_WAIT_MS,
): Promise<T> {
  if (!Number.isFinite(waitMs) || waitMs <= 0)
    throw new RangeError("A finite read deadline is required.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ReadDeadlineError()), waitMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function measureRead<T>(
  phase:
    | "renewal.inventory"
    | "renewal.sheet"
    | "renewal.supporting"
    | "assistant.sources"
    | "assistant.interpretation",
  read: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  let outcome = "failed";
  try {
    const value = await read();
    outcome = "completed";
    return value;
  } finally {
    console.info(
      JSON.stringify({
        event: "read_phase",
        phase,
        outcome,
        durationMs: Math.round(performance.now() - start),
      }),
    );
  }
}
