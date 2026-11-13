// S282 R-S282-1..5 (ARCH-S282-1..3): the review of an off-cycle lease end date.
//
// A lease whose end date falls in a renewal window but is not a month end is held for review by
// the cohort (`cohort.ts`). Staff record that review once per end date on Check the numbers: a
// decision ("Include in this renewal month" or "Keep on hold"), a required short reason, and Save.
// The record is app-owned and kept on the lease's work record (the existing workspace save path,
// with its role check, version check and audit entry), bound to the cycle and the exact end date
// value reviewed, with the actor and time. It writes nothing to RentVine or the Sheet.
//
// The one current decision for a lease is the latest review whose recorded end date equals the
// lease end the source reports now, exactly. A review for any other value is history: when the
// source end date changes the block returns for the new value, and a restored value finds its
// own earlier decision again only when the recorded value matches exactly. "Include" clears the
// block for that date; "Keep on hold" keeps it, with its reason, who set it and when.
//
// The cohort, the stage blocker, the readiness lists, the desk row and the preparation run all
// read these functions, so they cannot disagree. Pure and client-safe: no I/O and no clock.

import { formatCalendarDate } from "@/lib/date-display";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";

export const OFF_CYCLE_DECISIONS = ["include", "hold"] as const;
export type OffCycleDecision = (typeof OFF_CYCLE_DECISIONS)[number];

/** The longest reason the form accepts: one short line, not an attestation. */
export const OFF_CYCLE_REASON_MAX = 240;

/** One recorded review of one exact end date value, kept on the lease's work record. */
export interface OffCycleEndDateReview {
  /** The workspace save operation that recorded it (the audit entry's id). */
  readonly eventId: string;
  /** The work record cycle it was recorded on. */
  readonly cycleId: string;
  /** The exact lease end date value staff reviewed (YYYY-MM-DD). */
  readonly endDateIso: string;
  readonly decision: OffCycleDecision;
  readonly reason: string;
  readonly actorUid: string;
  /** The staff identity shown beside the decision (the signed-in staff email). */
  readonly actorLabel: string;
  readonly recordedAt: string;
}

/** The exact staff-visible words this suite settles. */
export const OFF_CYCLE_REVIEW_WORDS = {
  heading: "Lease end date review",
  /** R-S282-4: the blocker button and every fix link name the fix. */
  fix: "Review the lease end date",
  include: "Include in this renewal month",
  hold: "Keep on hold",
  decision: "Decision",
  reason: "Reason",
  reasonHint: "One short line: why this lease is included or held.",
  save: "Save",
  saving: "Saving…",
  source: "Source: RentVine lease end date.",
  readinessLabel: "Lease end date",
  readinessState: "needs review (off-cycle)",
  needsReview: "Off-cycle end date: needs review",
  decisionRequired: "Choose Include in this renewal month or Keep on hold.",
  reasonRequired: "Enter a short reason for this decision.",
  saved: "Saved.",
  readOnly: "You can read this review. Recording one needs Editor access in Renewals.",
  reloadFirst: "Reload current staff records before recording this review.",
  history: "Earlier decisions",
  retireLead: "To leave this lease out of renewal work, use Retire from renewals under",
  retireLink: "Record work",
} as const;

/** R-S282-4: the form the blocker lands on, and its first control. */
export const OFF_CYCLE_REVIEW_TARGET = "renewal-off-cycle-review";
export const OFF_CYCLE_REVIEW_FIRST_CONTROL = "renewal-off-cycle-review-include";
/** The existing Record work control that holds Retire from renewals (S255). */
export const OFF_CYCLE_RETIRE_TARGET = "renewal-record-work";

/** True when the ISO date is the last calendar day of its month (the cohort's month-end rule). */
function monthEnd(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const lastDay = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  return Number(match[3]) === lastDay;
}

function exactDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * ARCH-S282-1: the one current review for this exact end date value: the latest recorded review
 * whose end date equals it. Null when the date is missing or no review names it.
 */
export function currentOffCycleReview(
  reviews: readonly OffCycleEndDateReview[] | null | undefined,
  endDateIso: string | null | undefined,
): OffCycleEndDateReview | null {
  if (!reviews || !exactDate(endDateIso)) return null;
  for (let index = reviews.length - 1; index >= 0; index -= 1) {
    const review = reviews[index]!;
    if (review.endDateIso === endDateIso) return review;
  }
  return null;
}

/**
 * ARCH-S282-1: the reviews each lease's current work record holds, by lease id, for the cohort.
 * Absent when the work records were not read, so nothing is assumed reviewed.
 */
export function endDateReviewsByLease(
  states:
    | ReadonlyMap<
        string,
        { readonly endDateReviews?: readonly OffCycleEndDateReview[] | undefined } | null
      >
    | undefined,
): Map<string, readonly OffCycleEndDateReview[]> | undefined {
  if (!states) return undefined;
  const byLease = new Map<string, readonly OffCycleEndDateReview[]>();
  for (const [leaseId, state] of states)
    if (state?.endDateReviews?.length) byLease.set(leaseId, state.endDateReviews);
  return byLease;
}

/** R-S282-3: every recorded review except the current one, newest first. */
export function offCycleReviewHistory(
  reviews: readonly OffCycleEndDateReview[] | null | undefined,
  endDateIso: string | null | undefined,
): OffCycleEndDateReview[] {
  const current = currentOffCycleReview(reviews, endDateIso);
  return [...(reviews ?? [])].filter((review) => review !== current).reverse();
}

/**
 * The lease's off-cycle fact as the cohort reads it: present only for an end date inside a renewal
 * window that is not a month end. Its state follows the current review for that exact value.
 */
export interface OffCycleEndDateFact {
  readonly endDateIso: string;
  readonly state: "needs_review" | "included" | "held";
  readonly review: OffCycleEndDateReview | null;
}

export function projectOffCycleEndDate(input: {
  readonly endDateIso: string | null | undefined;
  /** True when the end date falls inside one of the renewal windows. */
  readonly inWindow: boolean;
  readonly reviews: readonly OffCycleEndDateReview[] | null | undefined;
}): OffCycleEndDateFact | null {
  if (!exactDate(input.endDateIso) || !input.inWindow || monthEnd(input.endDateIso))
    return null;
  const review = currentOffCycleReview(input.reviews, input.endDateIso);
  return {
    endDateIso: input.endDateIso,
    state: !review ? "needs_review" : review.decision === "include" ? "included" : "held",
    review,
  };
}

/** The calendar day a review was recorded, in the business calendar, as staff read it. */
function recordedDay(review: OffCycleEndDateReview): string {
  try {
    return formatCalendarDate(businessDateIso(review.recordedAt));
  } catch {
    return formatCalendarDate(null);
  }
}

/** R-S282-1: the first line of the form. */
export function offCycleEndDateSentence(endDateIso: string): string {
  return `This lease ends ${formatCalendarDate(endDateIso)}, which is not a month end.`;
}

/** R-S282-5: the desk row's reason for a recorded decision. */
export function offCycleDecisionLine(review: OffCycleEndDateReview): string {
  return review.decision === "include"
    ? `Off-cycle end date: included by ${review.actorLabel} on ${recordedDay(review)}`
    : `Off-cycle end date: on hold by ${review.actorLabel} on ${recordedDay(review)}`;
}

/** The row reason for the fact: the recorded decision, or that it still needs review. */
export function offCycleReasonLine(fact: OffCycleEndDateFact): string {
  return fact.review
    ? offCycleDecisionLine(fact.review)
    : OFF_CYCLE_REVIEW_WORDS.needsReview;
}

/** R-S282-2: the hold, with its reason, who set it and when. */
export function offCycleHoldLine(review: OffCycleEndDateReview): string {
  const reason = review.reason.trim().replace(/[.\s]+$/, "");
  return `Off-cycle end date on hold: ${reason}. Set by ${review.actorLabel} on ${recordedDay(review)}.`;
}

/** The stage blocker the off-cycle hold places on the Now card (R-S282-2, R-S282-4). */
export interface OffCycleStageBlocker {
  readonly kind: "off_cycle_end_date";
  readonly label: string;
  readonly target: string;
  /** The cue the Now card shows above the button. */
  readonly line: string;
}

/**
 * ARCH-S282-1/3: the one blocker the Now card and both readiness lists read. Present while the
 * lease has an off-cycle end date and no "Include" review for that exact value.
 */
export function offCycleStageBlocker(
  fact: { readonly endDateIso: string } | null | undefined,
  reviews: readonly OffCycleEndDateReview[] | null | undefined,
): OffCycleStageBlocker | null {
  if (!fact || !exactDate(fact.endDateIso) || monthEnd(fact.endDateIso)) return null;
  const review = currentOffCycleReview(reviews, fact.endDateIso);
  if (review?.decision === "include") return null;
  return {
    kind: "off_cycle_end_date",
    label: OFF_CYCLE_REVIEW_WORDS.fix,
    target: OFF_CYCLE_REVIEW_TARGET,
    line: review ? offCycleHoldLine(review) : OFF_CYCLE_REVIEW_WORDS.needsReview,
  };
}

/** True when a stage blocker is the off-cycle end date hold. */
export function isOffCycleBlocker(
  blocker: { readonly target: string | null; readonly kind?: string } | null | undefined,
): blocker is OffCycleStageBlocker {
  return blocker?.kind === "off_cycle_end_date";
}

/** R-S282-4: the readiness row both send lists show while the block stands. */
export interface OffCycleReadinessItem {
  readonly key: "off_cycle_end_date";
  readonly label: string;
  /** The row exactly as it reads: "Lease end date: needs review (off-cycle)". */
  readonly text: string;
  readonly ready: false;
  readonly fix: { readonly label: string; readonly target: string };
}

/** ARCH-S282-3: the readiness row reads the same blocker the Now card reads, or nothing. */
export function offCycleReadinessItem(
  blocker: { readonly target: string | null; readonly kind?: string } | null | undefined,
): OffCycleReadinessItem | null {
  if (!isOffCycleBlocker(blocker)) return null;
  return {
    key: "off_cycle_end_date",
    label: OFF_CYCLE_REVIEW_WORDS.readinessLabel,
    text: `${OFF_CYCLE_REVIEW_WORDS.readinessLabel}: ${OFF_CYCLE_REVIEW_WORDS.readinessState}`,
    ready: false,
    fix: { label: blocker.label, target: blocker.target },
  };
}

/**
 * R-S282-2: why the month's preparation run leaves a lease out while its off-cycle end date is
 * not included; null when the lease is not held.
 */
export function offCyclePreparationHold(
  fact: OffCycleEndDateFact | null | undefined,
): string | null {
  if (!fact || fact.state === "included") return null;
  return fact.state === "held"
    ? "This lease's off-cycle end date is on hold, so its preparation waits. Review the lease end date on the lease to include it."
    : "This lease's off-cycle end date needs review first, so its preparation waits. Review the lease end date on the lease to include it.";
}
