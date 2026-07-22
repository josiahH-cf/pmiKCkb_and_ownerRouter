// Per-lease LIVE renewal PROGRESS — the small, app-owned state machine that makes the live workspace
// clickable front-to-back (Phase A). The reconciliation, facts, recipients, and drafts all stay derived
// from RentVine + the Sheet exactly as before; this adds ONLY the operator's own forward progress:
//   • the owner's recorded rent decision (which unlocks + shapes the tenant offer),
//   • the id of the tenant-offer Gmail draft once one has been created,
//   • whether the operator has marked the renewal complete.
//
// It changes NO system of record: RentVine stays read-only, the Sheet stays read-only. This state lives
// in the KB's own Firestore (see lib/firestore/lease-renewal-progress.ts). This module is the PURE core:
// stage arithmetic + transition validation, no I/O and no Date.now(). The Firestore layer calls these
// planners inside a transaction; the route maps a thrown EditableLayerError to its HTTP status.

import { EditableLayerError } from "@/lib/firestore/errors";
import type { OwnerDecision } from "@/lib/lease-renewal/tenant-draft";

/** Stage indices into RENEWAL_STEPS (data → owner → tenant → build). Kept in lockstep with sample-desk. */
export const RENEWAL_STAGE = {
  data: 0,
  owner: 1,
  tenant: 2,
  build: 3,
} as const;

/** Highest valid stage index (build). */
export const MAX_RENEWAL_STAGE = RENEWAL_STAGE.build;

/** The recorded owner rent decision that unlocks the tenant offer. Values are the operator's inputs. */
export interface RenewalOwnerDecision {
  decision: OwnerDecision;
  /** Owner-approved monthly rent to offer. Finite and strictly positive. */
  offeredRent: number;
  /** Optional monthly charges surfaced on the tenant offer. */
  charges?: { rbp?: number; insurance?: number };
  /** Optional tenant info-gathering form link. */
  infoFormUrl?: string;
}

/** One lease's forward progress. `stageIndex` is the furthest step the operator has reached. */
export interface RenewalProgress {
  leaseId: string;
  stageIndex: number;
  ownerDecision: RenewalOwnerDecision | null;
  tenantOfferDraftId: string | null;
  complete: boolean;
}

/** The value-shape a transition planner returns (identity omitted — the store owns the leaseId). */
export interface RenewalProgressPlan {
  stageIndex: number;
  ownerDecision: RenewalOwnerDecision | null;
  tenantOfferDraftId: string | null;
  complete: boolean;
}

const OWNER_DECISIONS: readonly OwnerDecision[] = ["keep_same", "increase", "custom"];

function clampStage(index: number): number {
  if (!Number.isInteger(index)) return RENEWAL_STAGE.data;
  return Math.min(Math.max(index, RENEWAL_STAGE.data), MAX_RENEWAL_STAGE);
}

function assertMoney(value: number, label: string, allowZero: boolean): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new EditableLayerError(`${label} must be a number.`, 400);
  }
  if (allowZero ? value < 0 : value <= 0) {
    throw new EditableLayerError(
      allowZero ? `${label} cannot be negative.` : `${label} must be greater than zero.`,
      400,
    );
  }
  return value;
}

/**
 * Validate + normalize a proposed owner decision. Throws EditableLayerError (400) on any bad input, so
 * the offered rent is always positive, the decision is one of the three, and charges (when present) are
 * non-negative. The infoFormUrl is trusted as-validated upstream (the route enforces a URL shape).
 */
export function normalizeOwnerDecision(
  input: RenewalOwnerDecision,
): RenewalOwnerDecision {
  if (!OWNER_DECISIONS.includes(input.decision)) {
    throw new EditableLayerError("Unknown owner decision.", 400);
  }
  assertMoney(input.offeredRent, "Offered rent", false);
  const charges: { rbp?: number; insurance?: number } = {};
  if (input.charges?.rbp !== undefined) {
    charges.rbp = assertMoney(input.charges.rbp, "Resident benefit package", true);
  }
  if (input.charges?.insurance !== undefined) {
    charges.insurance = assertMoney(input.charges.insurance, "Insurance", true);
  }
  const normalized: RenewalOwnerDecision = {
    decision: input.decision,
    offeredRent: input.offeredRent,
  };
  if (charges.rbp !== undefined || charges.insurance !== undefined) {
    normalized.charges = charges;
  }
  if (input.infoFormUrl && input.infoFormUrl.trim() !== "") {
    normalized.infoFormUrl = input.infoFormUrl.trim();
  }
  return normalized;
}

/**
 * Record the owner's rent decision. This is the seam that makes the flow move: it (re)places the lease at
 * the Tenant-offer step and clears any prior tenant draft, since a changed decision invalidates a draft
 * built from the old numbers. Always leaves `complete: false` — a new decision reopens the work.
 */
export function planRecordOwnerDecision(
  _current: RenewalProgress | null,
  decision: RenewalOwnerDecision,
): RenewalProgressPlan {
  return {
    stageIndex: RENEWAL_STAGE.tenant,
    ownerDecision: normalizeOwnerDecision(decision),
    tenantOfferDraftId: null,
    complete: false,
  };
}

/**
 * Stamp the tenant-offer Gmail draft id and advance to Build docs. Requires a recorded owner decision —
 * a tenant offer without a decision would be an out-of-order state. Idempotent for the same draft id.
 */
export function planRecordTenantOfferDraft(
  current: RenewalProgress | null,
  draftId: string,
): RenewalProgressPlan {
  if (!current || !current.ownerDecision) {
    throw new EditableLayerError(
      "Record the owner decision before drafting the tenant offer.",
      409,
    );
  }
  const trimmed = draftId.trim();
  if (trimmed === "") {
    throw new EditableLayerError("A tenant-offer draft id is required.", 400);
  }
  return {
    stageIndex: Math.max(clampStage(current.stageIndex), RENEWAL_STAGE.build),
    ownerDecision: current.ownerDecision,
    tenantOfferDraftId: trimmed,
    complete: current.complete,
  };
}

/**
 * Mark the renewal complete (operator confirms the process is done for this lease). Requires that the
 * owner decision was recorded — you cannot complete a lease no one has decided. Pins the stage to Build.
 */
export function planMarkComplete(current: RenewalProgress | null): RenewalProgressPlan {
  if (!current || !current.ownerDecision) {
    throw new EditableLayerError(
      "Record the owner decision before marking the renewal complete.",
      409,
    );
  }
  return {
    stageIndex: RENEWAL_STAGE.build,
    ownerDecision: current.ownerDecision,
    tenantOfferDraftId: current.tenantOfferDraftId,
    complete: true,
  };
}

/**
 * The stage the workspace should show. When the operator has recorded progress, that wins; otherwise the
 * data-derived fallback (open conflict → Data check, else Owner decision) computed by the live desk holds.
 */
export function effectiveStageIndex(
  progress: RenewalProgress | null,
  derivedFallback: number,
): number {
  if (!progress) return derivedFallback;
  return clampStage(progress.stageIndex);
}
