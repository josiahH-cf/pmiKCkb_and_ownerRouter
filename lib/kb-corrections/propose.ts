// S32 corrections -> proposals pipeline. PURE and deterministic, mirroring the proven Gmail-triage
// `proposeRuleChangeFromFeedback` (lib/gmail-inbox-zero/rules.ts): given ONE Admin-reviewable correction,
// it produces three `status:"Proposed"` artifacts and nothing else. No I/O, no wall-clock, no random id
// (ids derive from the correction id), no network, no model. Nothing here writes, approves, or activates
// anything — an Admin approval turns a proposal into a Draft KB placeholder (which STILL needs its own
// approval), a redaction-required review-lane eval case, and a re-rank HINT a future human config could
// consume. Corrections harden the app; they never train a model.

import type { AskCorrectionRecord } from "@/lib/firestore/types";

/** A proposed Draft KB placeholder, shaped for the existing editable-layer `createPlaceholder`. */
export interface ProposedKbEntry {
  status: "Proposed";
  source_correction_id: string;
  space_id: string;
  placeholder: {
    missing_detail: string;
    note: string;
    owner_uid: string;
    priority: "P2";
    source_hint: string;
    status: "Open";
  };
}

/** A proposed eval case. It stays a review-lane record; `redaction_required` blocks any raw emit. */
export interface ProposedEvalCase {
  status: "Proposed";
  redaction_required: true;
  source_correction_id: string;
  question: string;
  expected_note: string;
}

/** A per-source re-rank HINT. Only a future human-approved config could ever consume it. */
export interface ProposedRerankSignal {
  status: "Proposed";
  source_correction_id: string;
  source_id: string;
  direction: "down" | "up";
  weight_hint: number;
}

/** Turn a correction into a Draft KB placeholder proposal (still requires Admin approval to file). */
export function proposeKbEntryFromCorrection(
  correction: AskCorrectionRecord,
): ProposedKbEntry {
  return {
    status: "Proposed",
    source_correction_id: correction.id,
    space_id: correction.space_id,
    placeholder: {
      missing_detail: correction.question,
      note: `Proposed from a correction (${correction.kind}): ${correction.note}`,
      owner_uid: correction.user_uid,
      priority: "P2",
      source_hint: `correction:${correction.kind}`,
      status: "Open",
    },
  };
}

/** Turn a correction into a redaction-required eval-case proposal (never an emitted fixture). */
export function proposeEvalCaseFromCorrection(
  correction: AskCorrectionRecord,
): ProposedEvalCase {
  return {
    status: "Proposed",
    redaction_required: true,
    source_correction_id: correction.id,
    question: correction.question,
    expected_note: correction.note,
  };
}

/**
 * Turn a correction into per-source re-rank HINTS, one per cited source. A `wrong_source` correction
 * proposes a down-weight for each cited source; any other kind proposes a small up-weight (the answer
 * leaned on the right sources but got a detail wrong). A correction with no citations yields no signal.
 */
export function proposeRerankSignalFromCorrection(
  correction: AskCorrectionRecord,
): ProposedRerankSignal[] {
  const down = correction.kind === "wrong_source";
  return correction.citations.map((citation) => ({
    status: "Proposed",
    source_correction_id: correction.id,
    source_id: citation.source_id,
    direction: down ? "down" : "up",
    weight_hint: down ? -0.1 : 0.05,
  }));
}
