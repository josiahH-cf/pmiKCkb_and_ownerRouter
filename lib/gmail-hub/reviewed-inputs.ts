// S274: a reviewed message is refused at Send, or held at its due time, only when a fact it was
// reviewed on really changed, and the screen then names that fact. A lease read that is still in
// progress makes the app wait, never refuse.
//
// This module is pure and client-safe: the typed settled or not-settled lease read (ARCH-S274-1),
// the labelled inputs a review displayed and the typed list of changed inputs (ARCH-S274-3), with
// the one wording every surface (the lease review dialog, the Communications composer and the
// lease step) derives from that list. Later suites (S272, S273) consume the same types.

import { z } from "zod";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import {
  OWNER_TERM_INPUT_KEYS,
  OWNER_WORDING_UPDATED_LINE,
  isOwnerWordingChange,
} from "@/lib/lease-renewal/owner-copy-version";

/**
 * Why a lease read is not settled yet (R-S274-1, R-S274-2, R-S274-4):
 * - `generation_not_ready`: the notice observation was made on a generation that an admitted read
 *   in flight already superseded (the marker is pending that newer read);
 * - `retirement_not_fresh`: the saved retirement status reads unavailable only because the lease
 *   read is not fresh;
 * - `read_in_flight`: the admitted lease read could not settle against the read floors because
 *   further admissions landed while it was read.
 * A real outage (the lease or status source could not be read) is not one of these: it stays the
 * existing unreadable-source case and is never treated as unchanged.
 */
export const LEASE_READ_UNSETTLED_REASONS = [
  "generation_not_ready",
  "retirement_not_fresh",
  "read_in_flight",
] as const;
export type LeaseReadUnsettledReason = (typeof LEASE_READ_UNSETTLED_REASONS)[number];

/** ARCH-S274-1: one lease read, settled or not, as a typed result. */
export type LeaseReadSettlement =
  | { readonly state: "settled" }
  | { readonly state: "not_settled"; readonly reason: LeaseReadUnsettledReason };

export const SETTLED_LEASE_READ: LeaseReadSettlement = { state: "settled" };

/**
 * R-S274-1: the waits before each further read of an unsettled lease read at confirm. The same
 * bounded window the lease preview already uses: three re-reads over about ten seconds. Never
 * lengthened without a new decision.
 */
export const LEASE_READ_REREAD_WAITS_MS = [1_500, 3_000, 5_000] as const;

/** R-S274-3: the one line staff read when the read does not settle within the bound. */
export const LEASE_READ_NOT_SETTLED_MESSAGE =
  "The lease is being re-read. Nothing was sent. Try again in a moment.";

/**
 * One input a review displayed, with its label as staff read it and its displayed value. A
 * `digest` stands in for a value that has no plain words (an offer snapshot, a notice identity);
 * the comparison then uses it and the line names the input without values.
 */
export interface ReviewedInput {
  readonly key: string;
  readonly label: string;
  readonly value: string | null;
  readonly digest?: string;
}

/**
 * ARCH-S274-3: one changed input. `previous` is the value the review displayed; it is absent when
 * that value is not known (an authorization kept no values), and `null` when the input was empty.
 */
export interface ChangedInput {
  readonly key: string;
  readonly label: string;
  readonly previous?: string | null;
  readonly current: string | null;
}

/** The key prefix of a hold (a blocker) the review did not show. */
export const NEW_HOLD_KEY_PREFIX = "hold:";
export const NEW_HOLD_LABEL = "New hold";
/** When the list cannot name a narrower input: the material source changed as a whole. */
export const SOURCE_FACTS_INPUT: ChangedInput = {
  key: "source",
  label: "Lease or recipient facts",
  current: null,
};

export const REVIEWED_INPUT_LIMIT = 64;
export const ReviewedInputSchema = z
  .object({
    key: z.string().min(1).max(600),
    label: z.string().min(1).max(160),
    value: z.string().max(2_000).nullable(),
    digest: z.string().min(1).max(200).optional(),
  })
  .strict();
export const ReviewedInputsSchema = z
  .array(ReviewedInputSchema)
  .max(REVIEWED_INPUT_LIMIT);
export const ChangedInputSchema = z
  .object({
    key: z.string().min(1).max(600),
    label: z.string().min(1).max(160),
    previous: z.string().max(2_000).nullable().optional(),
    current: z.string().max(2_000).nullable(),
  })
  .strict();

/** $1,425.00: the money format the message and the review show. */
export function formatReviewedMoney(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const [whole, cents] = Math.abs(value).toFixed(2).split(".");
  return `${value < 0 ? "-" : ""}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

/** 12/31/2027 from 2027-12-31; any other value is kept as it reads. */
export function formatReviewedDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value;
}

/** A reviewed input, without an undefined member (stored records refuse undefined values). */
export function reviewedInput(
  key: string,
  label: string,
  value: string | null | undefined,
  digest?: string | null,
): ReviewedInput {
  return {
    key,
    label,
    value: value === undefined || value === "" ? null : value,
    ...(digest ? { digest } : {}),
  };
}

function comparable(input: ReviewedInput): string {
  return input.digest !== undefined
    ? `digest:${input.digest}`
    : `value:${input.value ?? ""}`;
}

/**
 * ARCH-S274-3: the inputs that differ between the review and the settled read, in the order the
 * current read lists them. A hold the review did not show is listed as a new hold; a value known
 * from the review carries it as `previous`. With no reviewed list, nothing narrower than the
 * source as a whole can be named.
 */
export function changedReviewedInputs(
  reviewed: readonly ReviewedInput[] | null | undefined,
  current: readonly ReviewedInput[] | null | undefined,
): ChangedInput[] {
  if (!reviewed || !current) return [];
  const before = new Map(reviewed.map((input) => [input.key, input]));
  const changes: ChangedInput[] = [];
  for (const input of current) {
    const earlier = before.get(input.key);
    before.delete(input.key);
    if (input.key.startsWith(NEW_HOLD_KEY_PREFIX)) {
      if (!earlier)
        changes.push({ key: input.key, label: NEW_HOLD_LABEL, current: input.value });
      continue;
    }
    if (!earlier) {
      changes.push({
        key: input.key,
        label: input.label,
        previous: null,
        current: input.value,
      });
      continue;
    }
    if (comparable(earlier) === comparable(input)) continue;
    // Both displayed values; an input known only by its digest (or whose words did not change)
    // reads as "{label} changed".
    changes.push({
      key: input.key,
      label: input.label,
      previous: earlier.value,
      current: input.value,
    });
  }
  // An input the review showed that the current read no longer has (a hold that cleared is not a
  // change staff must act on, so only values are listed).
  for (const earlier of before.values()) {
    if (earlier.key.startsWith(NEW_HOLD_KEY_PREFIX)) continue;
    changes.push({
      key: earlier.key,
      label: earlier.label,
      previous: earlier.value,
      current: null,
    });
  }
  // S285 R-S285-6: when the owner wording version changed, the renewal dates the new wording
  // states for the first time are part of that one change, not separate changes.
  if (changes.some(isOwnerWordingChange)) {
    const shownBefore = new Set(reviewed.map((input) => input.key));
    return changes.filter(
      (change) =>
        !(OWNER_TERM_INPUT_KEYS as readonly string[]).includes(change.key) ||
        shownBefore.has(change.key),
    );
  }
  return changes;
}

/**
 * S285 R-S285-6: the changed input a hold stores when the only change is the owner wording an
 * approver published; its line reads "The owner message wording was updated".
 */
export const OWNER_WORDING_UPDATED_INPUT: ChangedInput = Object.freeze({
  key: "ownerWording",
  label: OWNER_WORDING_UPDATED_LINE,
  current: null,
});

/**
 * The staff line for one changed input: "Rent to recommend: was $1,400.00, now $1,425.00". A new
 * hold reads "New hold: {text}"; an input without plain values reads "{label} changed". S285: the
 * owner message's approved template changing reads "The owner message wording was updated".
 */
export function changedInputLine(change: ChangedInput): string {
  if (change.key.startsWith(NEW_HOLD_KEY_PREFIX))
    return `${NEW_HOLD_LABEL}: ${change.current ?? ""}`.trim();
  if (change.key === OWNER_WORDING_UPDATED_INPUT.key || isOwnerWordingChange(change))
    return OWNER_WORDING_UPDATED_LINE;
  const { previous, current } = change;
  if (previous === undefined || previous === current) return `${change.label} changed`;
  if (previous === null && current === null) return `${change.label} changed`;
  if (previous === null) return `${change.label}: was not set, now ${current}`;
  if (current === null) return `${change.label}: was ${previous}, now not set`;
  return `${change.label}: was ${previous}, now ${current}`;
}

/** Every line of a changed-input list, never empty: an unnamed change reads as the source. */
export function changedInputLines(changes: readonly ChangedInput[]): string[] {
  return (changes.length ? changes : [SOURCE_FACTS_INPUT]).map(changedInputLine);
}

/** The opening of the refusal text; kept from the earlier refusal so it reads the same way. */
export const TARGET_CHANGED_LEAD =
  "The recipients or source facts changed after the preview.";

/** R-S274-5: the refusal text the composer shows, derived from the typed list. */
export function targetChangedMessage(changes: readonly ChangedInput[]): string {
  return `${TARGET_CHANGED_LEAD} ${changedInputLines(changes)
    .map((line) => `${line}.`)
    .join(" ")} Review the current message before Send or Schedule.`;
}

/** R-S274-3: a lease read that did not settle within the bound. Retryable; nothing was sent. */
export class LeaseReadNotSettledError extends EditableLayerError {
  readonly code = "lease_read_not_settled";
  readonly retryable = true;
  constructor(readonly reason: LeaseReadUnsettledReason) {
    super(LEASE_READ_NOT_SETTLED_MESSAGE, 409);
    this.name = "LeaseReadNotSettledError";
  }
}

/** R-S274-5: the settled target differs from the reviewed one; each changed input is named. */
export class CommunicationTargetChangedError extends EditableLayerError {
  readonly code = "target_changed";
  readonly changes: readonly ChangedInput[];
  constructor(changes: readonly ChangedInput[]) {
    super(targetChangedMessage(changes), 409);
    this.name = "CommunicationTargetChangedError";
    this.changes = changes.length ? changes : [SOURCE_FACTS_INPUT];
  }
}

/** The response codes a client reads (the sequences route carries them as `code`). */
export const LEASE_READ_NOT_SETTLED_CODE = "lease_read_not_settled";
export const TARGET_CHANGED_CODE = "target_changed";
