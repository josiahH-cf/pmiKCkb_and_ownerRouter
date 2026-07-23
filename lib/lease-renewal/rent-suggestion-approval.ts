// Rent-suggestion APPROVAL path (S29, owner decision D-RENT-SUGGEST). A comp-derived SUGGESTED rent
// number (rent-suggestion.ts) does nothing on its own; THIS layer lets an Admin explicitly AUTHORIZE that
// exact number to enter the owner-notice draft (Approved) or RETURN it for revision.
//
// GOVERNANCE: this is a decision-recording control plane only, and a byte-for-byte mirror of the
// write-back approval FSM (writeback-approval.ts). It NEVER executes a send or a system-of-record write —
// approving merely records human authorization to PLACE the number in a draft; a human still reviews and
// sends. Every plan carries the compile-checked `productionAllowed: false` / `executed: false` invariant.
// Pure and deterministic (no I/O).

import { EditableLayerError } from "@/lib/firestore/errors";

/** The reachable approval states. There is no executing state — this FSM never writes or sends. */
export type RentSuggestionApprovalState =
  | "Awaiting Approval"
  | "Approved"
  | "Returned for Revision";

/** A recorded decision only ever lands the suggestion in one of these two states. */
export type RentSuggestionApprovalDecidedState = "Approved" | "Returned for Revision";

/** A human decision on a computed suggestion. */
export type RentSuggestionApprovalDecision = "approve" | "return";

/** The implicit state of a freshly computed suggestion that has no decision record yet. */
export const RENT_SUGGESTION_AWAITING_APPROVAL = "Awaiting Approval" as const;

// Minimal, purpose-built transition table. A `return` from `Approved` is a REVOKE — safe because nothing
// has executed. Double-approve and re-return are undefined (rejected) so the audit log never records a
// no-op transition.
const APPROVAL_TRANSITIONS: Record<
  RentSuggestionApprovalState,
  Partial<Record<RentSuggestionApprovalDecision, RentSuggestionApprovalDecidedState>>
> = {
  "Awaiting Approval": { approve: "Approved", return: "Returned for Revision" },
  Approved: { return: "Returned for Revision" },
  "Returned for Revision": { approve: "Approved" },
};

export interface RentSuggestionApprovalPlan {
  state: RentSuggestionApprovalDecidedState;
  /** Invariants surfaced on the plan so persistence and the UI cannot misrepresent them. */
  productionAllowed: false;
  executed: false;
}

/**
 * Decide a computed rent suggestion. `previousState` is the suggestion's current effective approval
 * state — `"Awaiting Approval"` when it has no (non-stale) decision record yet. Throws
 * `EditableLayerError(409)` on an illegal transition (double-approve, re-return) so the caller can
 * surface a clear message and the activity log never captures a no-op. Never executes anything.
 */
export function planRentSuggestionApprovalDecision(
  decision: RentSuggestionApprovalDecision,
  previousState: RentSuggestionApprovalState = RENT_SUGGESTION_AWAITING_APPROVAL,
): RentSuggestionApprovalPlan {
  const next = APPROVAL_TRANSITIONS[previousState][decision];
  if (!next) {
    throw new EditableLayerError(
      `Cannot ${decision} a rent suggestion that is "${previousState}".`,
      409,
    );
  }
  return { state: next, productionAllowed: false, executed: false };
}
