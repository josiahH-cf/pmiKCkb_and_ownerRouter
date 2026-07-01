// Write-back proposal APPROVAL path (Q-WRITEBACK-METHOD phase-2 control plane — the "future
// admin-enabled, per-write button-press surface" the resolution layer defers to). A resolution QUEUES
// an append-only proposed write-back (`production_allowed:false`); THIS layer lets an Admin explicitly
// AUTHORIZE that queued proposal (Approved = ready to write) or RETURN it for a fresh resolution.
//
// GOVERNANCE: this is a decision-recording control plane only. It NEVER executes a Sheet / system-of-
// record write — approving merely records human authorization; the actual write stays gated behind an
// approved per-action spec and is not built. The reachable states are a strict, compile-checked subset
// of the audited write-back safety FSM (`writeback.ts`); the executing states (Writing/Verifying/
// Written) are unreachable from here BY CONSTRUCTION. Pure + deterministic (no I/O).

import { EditableLayerError } from "@/lib/firestore/errors";
import type { WriteBackState } from "@/lib/lease-renewal/writeback";

/**
 * The approval states, pinned to the audited FSM's non-executing states via `Extract`. This will not
 * compile if any literal drifts from `WriteBackState`, so the approval vocabulary can never diverge
 * from — or reach past — the safety machine.
 */
export type WritebackApprovalState = Extract<
  WriteBackState,
  "Awaiting Approval" | "Approved" | "Returned for Revision"
>;

/** A recorded decision only ever lands the proposal in one of these two states. */
export type WritebackApprovalDecidedState = Extract<
  WritebackApprovalState,
  "Approved" | "Returned for Revision"
>;

/** A human decision on a queued proposal. */
export type WritebackApprovalDecision = "approve" | "return";

/** The implicit state of a freshly queued proposal that has no decision record yet. */
export const WRITEBACK_AWAITING_APPROVAL = "Awaiting Approval" as const;

// Minimal, purpose-built transition table. Every target is a non-executing FSM state (checked by the
// `WritebackApprovalDecidedState` return type). A `return` from `Approved` is a REVOKE — safe because
// nothing has executed. Double-approve and re-return are undefined (rejected) so the audit log never
// records a no-op transition.
const APPROVAL_TRANSITIONS: Record<
  WritebackApprovalState,
  Partial<Record<WritebackApprovalDecision, WritebackApprovalDecidedState>>
> = {
  "Awaiting Approval": { approve: "Approved", return: "Returned for Revision" },
  Approved: { return: "Returned for Revision" },
  "Returned for Revision": { approve: "Approved" },
};

export interface WritebackApprovalPlan {
  state: WritebackApprovalDecidedState;
  /** Invariants surfaced on the plan so persistence and the UI cannot misrepresent them. */
  productionAllowed: false;
  executed: false;
}

/**
 * Decide a queued write-back proposal. `previousState` is the proposal's current effective approval
 * state — `"Awaiting Approval"` when it has no (non-stale) decision record yet. Throws
 * `EditableLayerError(409)` on an illegal transition (double-approve, re-return) so the caller can
 * surface a clear message and the activity log never captures a no-op. Never executes anything.
 */
export function planWritebackApprovalDecision(
  decision: WritebackApprovalDecision,
  previousState: WritebackApprovalState = WRITEBACK_AWAITING_APPROVAL,
): WritebackApprovalPlan {
  const next = APPROVAL_TRANSITIONS[previousState][decision];
  if (!next) {
    throw new EditableLayerError(
      `Cannot ${decision} a write-back proposal that is "${previousState}".`,
      409,
    );
  }
  return { state: next, productionAllowed: false, executed: false };
}
