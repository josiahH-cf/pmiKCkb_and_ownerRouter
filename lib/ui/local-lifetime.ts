export class LocalWaitError extends Error {
  constructor() {
    super("The local operation was not confirmed within its wait.");
    this.name = "LocalWaitError";
  }
}
/** A bounded local wait; a late browser operation may still complete. */
export async function boundedLocalWait<T>(
  operation: Promise<T>,
  waitMs = 8_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new LocalWaitError()), waitMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
