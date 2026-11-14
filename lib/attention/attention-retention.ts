// S280 R-S280-4 (ARCH-S280-3): keep the Dashboard's last renewal rows when a renewal read is older
// than its freshness limit or a re-read of it fails. The rows stay, marked retained with their read
// time, and "Refresh" runs the existing bounded re-read. A retained row is information: deciding on
// it still requires the existing current read on its review surface. Pure and client-safe.

import type { AttentionQueue } from "@/lib/attention/attention-queue";

/** The panel's words for a retained renewal read. */
export const RETAINED_RENEWAL_WORDS = {
  readAt: (readAt: string) => `Renewal data last read ${readAt}`,
  refresh: "Refresh",
  refreshFailed:
    "The renewal data could not be read just now. The renewal rows shown are from the last read.",
} as const;

/**
 * A re-read whose renewal feed did not answer keeps the previous renewal rows, marked retained with
 * their read time, instead of dropping them. Queue items always come from the new read.
 */
export function keepRetainedRenewalRows(
  previous: AttentionQueue,
  next: AttentionQueue,
): { queue: AttentionQueue; renewalFailed: boolean } {
  const renewalUnanswered = next.unavailableFeeds.includes("renewal_reviews");
  if (!renewalUnanswered || next.renewalRead || !previous.renewalRead)
    return { queue: next, renewalFailed: false };
  const kept = previous.rows
    .filter((row) => row.kind !== "queue_item")
    .map((row) => ({ ...row, retained: true as const }));
  if (kept.length === 0) return { queue: next, renewalFailed: true };
  const keys = new Set(next.rows.map((row) => row.key));
  return {
    queue: {
      ...next,
      state: next.state === "unavailable" ? "partial" : next.state,
      rows: [...next.rows, ...kept.filter((row) => !keys.has(row.key))],
      renewalRead: {
        state: "retained",
        readAtIso:
          previous.renewalRead.state === "retained"
            ? previous.renewalRead.readAtIso
            : previous.checkedAtIso,
      },
    },
    renewalFailed: true,
  };
}
