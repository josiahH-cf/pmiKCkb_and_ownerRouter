// S148/S150: one execution per user and operation on this instance. A duplicate delivery of the
// same Dashboard submission joins the in-flight answer, or reuses it for a short while after it
// completes, so it never asks the model a second time. Later deliveries replay the completed
// history turn instead. Per instance, like the model throttle (lib/api/model-call-throttle.ts).
// In memory only: nothing here is persisted, and no answer is ever served to another user or
// another operation.

const RETAIN_AFTER_SETTLE_MS = 2 * 60_000;
const MAX_ENTRIES = 1_000;

interface Entry {
  readonly promise: Promise<unknown>;
  settledAt: number | null;
}

const entries = new Map<string, Entry>();

function prune(nowMs: number) {
  for (const [key, entry] of entries) {
    if (entry.settledAt !== null && nowMs - entry.settledAt > RETAIN_AFTER_SETTLE_MS) {
      entries.delete(key);
    }
  }
  // Never let the map grow without bound; the oldest settled entries go first.
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/**
 * Run `execute` once for `key`. A concurrent or recent duplicate gets the same promise and
 * `joined: true`. A failed execution is not retained, so an explicit retry runs again.
 */
export function runOncePerOperation<T>(
  key: string,
  execute: () => Promise<T>,
  now: () => number = Date.now,
): { readonly promise: Promise<T>; readonly joined: boolean } {
  const nowMs = now();
  prune(nowMs);
  const existing = entries.get(key);
  if (existing) return { promise: existing.promise as Promise<T>, joined: true };
  const entry: Entry = { promise: Promise.resolve(), settledAt: null };
  const promise = execute().then(
    (value) => {
      entry.settledAt = now();
      return value;
    },
    (error: unknown) => {
      entries.delete(key);
      throw error;
    },
  );
  (entry as { promise: Promise<unknown> }).promise = promise;
  entries.set(key, entry);
  return { promise, joined: false };
}

/** Test seam: forget every retained operation. */
export function resetOperationDedupe() {
  entries.clear();
}
