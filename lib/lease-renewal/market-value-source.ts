// S278 R-S278-1 (ARCH-S278-1): the operating Sheet "Market value" takes the reviewed PMI
// recommended monthly rent (S118 R118.3 and the spreadsheet map). That is the current-cycle
// recommendation, the value Rent to recommend shows, once a person reviewed it: a staff member
// saved or changed it, or a staff member confirmed the review of an owner message that states it.
// The hidden provider-filled comparison figure no longer feeds the Sheet, and the low and high
// range stay app evidence. An untouched suggestion saved by the monthly preparation is not yet
// reviewed, so it prepares no Market value until one of those reviews exists.
//
// Pure and client-safe. Reading writes nothing; the server re-derives the same value from its own
// reads before it records or prepares anything.

import { recommendationFact, recommendationField } from "./current-cycle-terms";
import type { LeaseOutreachEvidenceInput } from "./outreach-evidence";
import { formatRentAmount, rentBasisOf } from "./rent-basis";
import type { SheetFieldIntent } from "./sheet-writeback/field-intent";
import type { RenewalWorkingRecord, WorkingFieldEntry } from "./working-record";

/** How the recommendation was reviewed. */
export type RecommendationReview = "staff_save" | "owner_message_review";

/** The recommendation entry a Market value update is bound to. */
export interface RecommendationBinding {
  readonly field: "terms_rent" | "recommended_rent";
  readonly revision: number;
  readonly eventId: string;
  readonly review: RecommendationReview;
}

export interface ReviewedRecommendation extends RecommendationBinding {
  readonly value: number;
  /** The short basis phrase of the recommendation (S277 R-S277-2), such as "entered by staff". */
  readonly basisPhrase: string;
}

export type MarketValueSource =
  | { readonly kind: "reviewed"; readonly recommendation: ReviewedRecommendation }
  /** A recommendation exists but nobody reviewed it yet; no Market value update is shown. */
  | { readonly kind: "not_reviewed"; readonly value: number }
  | { readonly kind: "none" };

/** The words the Market value source uses. */
export const MARKET_VALUE_WORDS = {
  sourceLabel: "Rent to recommend",
  ownerReview: "stated in the reviewed owner message",
  notReviewed:
    "Market value is prepared from Rent to recommend once staff review it: save or change Rent to recommend, or confirm the review of an owner message that states it.",
  changed:
    "Rent to recommend changed after this Market value update was prepared, so nothing was sent to the Sheet. Prepare it again from the current recommendation.",
  retired:
    "This Market value came from the comparison figure, which no longer feeds the Sheet. Market value is prepared from Rent to recommend once staff review it.",
} as const;

const SOURCE_MAX = 240;

function recordedMs(entry: WorkingFieldEntry): number {
  const value = Date.parse(entry.recordedAt);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

/**
 * R-S278-1: whether a staff member confirmed the review of an owner message that states this exact
 * recommendation entry. The owner message is composed from the current recommendation and is held
 * or refused when it changes after the review (S272, S274), so a confirmed owner send of this
 * cycle after the entry was saved, or a confirmed schedule reviewed after it, states it. A message
 * staff marked as not the renewal outreach does not count.
 */
export function ownerReviewStatesRecommendation(
  entry: WorkingFieldEntry,
  outreach: LeaseOutreachEvidenceInput | null | undefined,
  cycleId: string | null,
): boolean {
  if (!outreach?.readable || !cycleId) return false;
  const savedAt = recordedMs(entry);
  const corrected = new Set(
    outreach.records
      .filter((record) => record.correction !== null)
      .map((record) => record.occurrenceId),
  );
  return outreach.messages.some(
    (message) =>
      message.audience === "owner" &&
      message.cycleId === cycleId &&
      (message.accepted.some(
        (attempt) => attempt.sentAtMs >= savedAt && !corrected.has(attempt.occurrenceId),
      ) ||
        (message.scheduledForMs !== null && message.createdAtMs >= savedAt)),
  );
}

/**
 * ARCH-S278-1: the Market value source for the lease's current cycle. `record` is the working
 * record projected onto the active cycle (S262 R-S262-5), so an earlier cycle's recommendation
 * never feeds this one.
 */
export function marketValueSource(input: {
  readonly record: RenewalWorkingRecord | null | undefined;
  readonly outreach?: LeaseOutreachEvidenceInput | null;
  readonly cycleId: string | null;
}): MarketValueSource {
  const fact = recommendationFact(input.record);
  if (fact.kind === "unavailable") return { kind: "none" };
  const entry = fact.entry;
  if (!entry || typeof entry.value !== "number" || entry.value <= 0)
    return { kind: "none" };
  const basis = rentBasisOf(entry);
  if (!basis) return { kind: "none" };
  const review: RecommendationReview | null = !basis.savedByPreparation
    ? "staff_save"
    : ownerReviewStatesRecommendation(entry, input.outreach, input.cycleId)
      ? "owner_message_review"
      : null;
  if (!review) return { kind: "not_reviewed", value: entry.value };
  return {
    kind: "reviewed",
    recommendation: {
      field: recommendationField(input.record),
      revision: entry.revision,
      eventId: entry.eventId,
      review,
      value: entry.value,
      basisPhrase: basis.phrase,
    },
  };
}

/** The basis the Market value update carries: "Rent to recommend, entered by staff". */
export function marketValueBasis(recommendation: ReviewedRecommendation): string {
  const text =
    recommendation.review === "owner_message_review"
      ? `${MARKET_VALUE_WORDS.sourceLabel}, ${recommendation.basisPhrase}, ${MARKET_VALUE_WORDS.ownerReview}`
      : `${MARKET_VALUE_WORDS.sourceLabel}, ${recommendation.basisPhrase}`;
  return text.length > SOURCE_MAX ? `${text.slice(0, SOURCE_MAX - 1)}…` : text;
}

/** R-S278-1: the Sheet field intent the reviewed recommendation prepares. */
export function marketValueSheetIntent(
  recommendation: ReviewedRecommendation,
): SheetFieldIntent {
  return {
    field: "market_value",
    value: recommendation.value,
    source: marketValueBasis(recommendation),
  };
}

/** The binding a recorded Market value keeps, without the amount or the words. */
export function recommendationBinding(
  recommendation: ReviewedRecommendation,
): RecommendationBinding {
  return {
    field: recommendation.field,
    revision: recommendation.revision,
    eventId: recommendation.eventId,
    review: recommendation.review,
  };
}

/**
 * Whether a recorded Market value is still bound to the current recommendation: the same entry,
 * revision and amount. A changed recommendation makes the prepared value out of date.
 */
export function marketValueBindingCurrent(
  binding: RecommendationBinding,
  value: unknown,
  source: MarketValueSource,
): boolean {
  if (source.kind !== "reviewed") return false;
  const current = source.recommendation;
  return (
    current.field === binding.field &&
    current.revision === binding.revision &&
    current.eventId === binding.eventId &&
    typeof value === "number" &&
    Math.abs(current.value - value) < 0.005
  );
}

/** "Market value $1,500.00 from Rent to recommend, entered by staff" for the pending list. */
export function marketValueLine(recommendation: ReviewedRecommendation): string {
  return `${formatRentAmount(recommendation.value)} from ${marketValueBasis(recommendation)}`;
}
