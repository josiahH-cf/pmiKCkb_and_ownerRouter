// S32 source-freshness signal. PURE and deterministic: given a source's last-reviewed date, its review
// interval, and a reference date (all passed in — never a wall-clock read), it returns an honest
// staleness status. When either the review date or the interval is absent it returns `unknown` (never a
// fabricated due date), so a source with no configured interval simply shows "reviewed <date>" with no chip.

const DAY_MS = 86_400_000;

export type SourceFreshnessStatus = "fresh" | "review-due" | "stale" | "unknown";

export interface SourceFreshness {
  status: SourceFreshnessStatus;
  /** The computed next-review date (YYYY-MM-DD), present for every status except `unknown`. */
  dueDateIso?: string;
  /** Whole days past due, present only when `review-due` or `stale`. */
  daysOverdue?: number;
}

export function computeSourceFreshness(input: {
  lastReviewedAt?: string;
  reviewIntervalDays?: number;
  referenceDateIso: string;
}): SourceFreshness {
  const { lastReviewedAt, reviewIntervalDays, referenceDateIso } = input;
  if (
    !lastReviewedAt ||
    reviewIntervalDays === undefined ||
    !Number.isFinite(reviewIntervalDays) ||
    reviewIntervalDays <= 0
  ) {
    return { status: "unknown" };
  }

  const reviewedMs = Date.parse(lastReviewedAt);
  const referenceMs = Date.parse(referenceDateIso);
  if (Number.isNaN(reviewedMs) || Number.isNaN(referenceMs)) {
    return { status: "unknown" };
  }

  const dueMs = reviewedMs + reviewIntervalDays * DAY_MS;
  const dueDateIso = new Date(dueMs).toISOString().slice(0, 10);
  const daysOverdue = Math.floor((referenceMs - dueMs) / DAY_MS);

  if (daysOverdue < 0) {
    return { status: "fresh", dueDateIso };
  }
  // Overdue by up to one more full interval reads as "review due"; beyond that it is "stale".
  if (daysOverdue <= reviewIntervalDays) {
    return { status: "review-due", dueDateIso, daysOverdue };
  }
  return { status: "stale", dueDateIso, daysOverdue };
}
