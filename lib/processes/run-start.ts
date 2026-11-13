// S283 R-S283-4: one staff click starts at most one run, and a refused start says why. The client
// sends a per-click key (`start_key`) with the start; the server binds it to the actor and the
// process, so a repeated or double-clicked request returns the same run. Client-safe and pure.

/** A start key the run start route accepts: a UUID-like token of 8 to 64 safe characters. */
export const RUN_START_KEY_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** A fresh per-click key. */
export function newRunStartKey(): string {
  return crypto.randomUUID();
}

/** The generic line when the server gave no reason of its own. */
export const RUN_START_FALLBACK_REFUSAL =
  "This run did not start. Reload the page and try again.";

/**
 * The server's refusal in staff words: the route's own sentence when it sent one, else the
 * generic line. A refused start created nothing.
 */
export function runStartRefusalText(body: unknown): string {
  const error =
    body && typeof body === "object" && "error" in body
      ? (body as { error?: unknown }).error
      : null;
  return typeof error === "string" && error.trim()
    ? error.trim()
    : RUN_START_FALLBACK_REFUSAL;
}
