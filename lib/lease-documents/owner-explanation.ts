// S253 (R-S253-7, R-S253-12): the owner acknowledgment's explanation for one lease and renewal cycle.
//
// Staff write it on the lease; the application writes none of it. It ships no starting text, makes
// no text from the lease's values and never carries one lease's explanation to another: the only
// text that reaches a form is the text staff saved on that lease for that cycle. Pure and
// client-safe.

import {
  PARAGRAPH_TEXT_MAX_LENGTH,
  normalizeParagraphText,
} from "@/lib/lease-documents/paragraph-text";

/** The fact the owner acknowledgment's multi-line box is filled from. */
export const OWNER_EXPLANATION_FACT = "owner_acknowledgment.explanation";
export const OWNER_EXPLANATION_SOURCE_SYSTEM = "renewal_staff_entry";

/**
 * The starting text the application ships: none. An Admin may save the team's own starting text;
 * until then staff begin from an empty box.
 */
export const SHIPPED_OWNER_EXPLANATION_STARTING_TEXT = "";

export const OWNER_EXPLANATION_NEED = "Needs the explanation for this lease";
export const OWNER_EXPLANATION_TERMS_CHANGED = "Terms changed after this was written";
export const OWNER_EXPLANATION_MAX_LENGTH = PARAGRAPH_TEXT_MAX_LENGTH;

/** The explanation as the packet inputs keep it. */
export interface StoredOwnerExplanation {
  revision: number;
  /** Null after staff deliberately clear it. */
  text: string | null;
  /** The renewal cycle it was written for; it applies to no other cycle. */
  cycleId: string | null;
  recordedAt: string;
  recordedByUid: string;
}

export interface OwnerExplanationState {
  /** The text that applies to this lease and cycle, in its normal form; null when none does. */
  text: string | null;
  revision: number;
  recordedAt: string | null;
  recordedByUid: string | null;
  /** True when text is recorded for an earlier cycle: it is kept on the record and applies to none. */
  fromEarlierCycle: boolean;
  /** True when a renewal term changed after the text was written. The text is kept. */
  termsChangedAfter: boolean;
  /** The single need this form waits on, or null. */
  need: string | null;
}

/**
 * What the lease shows for the explanation. `termsChangedAt` is the latest time a renewal term of
 * this cycle (rent, effective date or end date) was recorded; a later term change flags the text
 * and clears nothing.
 */
export function ownerExplanationState(input: {
  stored: StoredOwnerExplanation | null | undefined;
  cycleId: string | null;
  termsChangedAt: string | null;
}): OwnerExplanationState {
  const stored = input.stored ?? null;
  const written = stored?.text ? normalizeParagraphText(stored.text) : "";
  // An explanation written for another cycle is never reused: the cycle must be the same one.
  const applies =
    written !== "" && stored !== null && (stored.cycleId ?? null) === input.cycleId;
  const text = applies ? written : null;
  return {
    text,
    revision: stored?.revision ?? 0,
    recordedAt: applies ? stored!.recordedAt : null,
    recordedByUid: applies ? stored!.recordedByUid : null,
    fromEarlierCycle: written !== "" && !applies,
    termsChangedAfter:
      applies &&
      input.termsChangedAt !== null &&
      Date.parse(input.termsChangedAt) > Date.parse(stored!.recordedAt),
    need: text === null ? OWNER_EXPLANATION_NEED : null,
  };
}
