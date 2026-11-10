// S262 R-S262-1 / R-S262-3 (ARCH-S262-1, ARCH-S262-3, BEH-S262-3): what a recorded owner answer
// actually approved, as a typed scope at the approval boundary.
//
// - amount_only: the owner approved one exact base rent. It covers only the current-cycle working
//   renewal base revision the reviewed save wrote. A later base revision makes it earlier
//   evidence; a date or charge change never widens it.
// - exact_terms: the owner approved the base and the renewal dates as they stood (the S234
//   capture, including its calculated packet economics). Legacy S234 approvals read as this.
// - offer_snapshot: the owner approved one exact tenant offer snapshot, identified by S264. It is
//   typed here so S264 adds the snapshot identity without reworking the boundary; nothing in this
//   slice records it, so an offer that needs it is held.
//
// Pure and client-safe. No backfill: a recorded answer keeps the scope it actually had.

import { z } from "zod";

import type { RenewalWorkingRecord } from "./working-record";
import type { ApprovedWorkingTerms, RenewalWorkspaceState } from "./workspace-state";

const approvedAmount = z
  .number()
  .finite()
  .positive()
  .max(1_000_000)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001,
    "Use cents precision.",
  );

export const OWNER_APPROVAL_SCOPE_KINDS = ["amount_only", "exact_terms"] as const;
export type RecordedApprovalScopeKind = (typeof OWNER_APPROVAL_SCOPE_KINDS)[number];

/**
 * S262 R-S262-1: the Amount approved staff entered on the approving branch, with the revisions the
 * review showed. The server checks both revisions and the cycle in the same transaction.
 */
export const ApprovedBaseInputSchema = z
  .object({
    amount: approvedAmount,
    scope: z.enum(OWNER_APPROVAL_SCOPE_KINDS),
    /** The working renewal base revision the review showed (0 when none was saved). */
    expectedWorkingRevision: z.number().int().nonnegative(),
    /** The Rent to recommend revision the review showed (0 when it is not its own fact). */
    expectedRecommendationRevision: z.number().int().nonnegative(),
  })
  .strict();
export type ApprovedBaseInput = z.infer<typeof ApprovedBaseInputSchema>;

/** S262 R-S262-2: what the record keeps about the approved base, written with the response. */
export const ApprovedBaseSchema = z
  .object({
    amount: approvedAmount,
    scope: z.enum(OWNER_APPROVAL_SCOPE_KINDS),
    cycleId: z.string().uuid(),
    /** The working renewal base revision this save wrote or confirmed for the amount. */
    workingRevision: z.number().int().positive(),
    /** The recommendation the review named, with its revision; null when it was unavailable. */
    recommended: z
      .object({
        value: approvedAmount,
        revision: z.number().int().positive(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type ApprovedBase = z.infer<typeof ApprovedBaseSchema>;

/** S264 extension point: the identity of the exact tenant offer snapshot an owner approved. */
export interface OfferSnapshotIdentity {
  readonly snapshotId: string;
  readonly snapshotHash: string;
}

export type OwnerApprovalScope =
  | {
      readonly kind: "amount_only";
      readonly cycleId: string;
      readonly rent: number;
      readonly rentRevision: number;
    }
  | {
      readonly kind: "exact_terms";
      readonly cycleId: string;
      readonly terms: ApprovedWorkingTerms;
    }
  | {
      readonly kind: "offer_snapshot";
      readonly cycleId: string;
      readonly terms: ApprovedWorkingTerms;
      readonly offer: OfferSnapshotIdentity;
    };

/** The recorded approval's actual scope on this work record, or null when none is recorded. */
export function ownerApprovalScope(
  workspace: RenewalWorkspaceState | null | undefined,
): OwnerApprovalScope | null {
  const response = workspace?.ownerResponse;
  if (!workspace || response?.outcome !== "approved_terms") return null;
  const base = response.approvedBase;
  if (base?.scope === "amount_only")
    return {
      kind: "amount_only",
      cycleId: base.cycleId,
      rent: base.amount,
      rentRevision: base.workingRevision,
    };
  return response.approvedWorkingTerms
    ? {
        kind: "exact_terms",
        cycleId: workspace.cycleId,
        terms: response.approvedWorkingTerms,
      }
    : null;
}

/**
 * Whether the scope still covers the current working renewal base: the same cycle, the same
 * revision and the same amount. Any later base revision makes the approval earlier evidence.
 */
export function approvalCoversWorkingBase(
  scope: OwnerApprovalScope | null,
  working: RenewalWorkingRecord | null | undefined,
): boolean {
  if (!scope) return false;
  const entry = working?.fields.terms_rent;
  if (!entry || typeof entry.value !== "number") return false;
  if (working?.cycle && working.cycle.cycleId !== scope.cycleId) return false;
  const rent = scope.kind === "amount_only" ? scope.rent : scope.terms.rent;
  const revision =
    scope.kind === "amount_only" ? scope.rentRevision : scope.terms.fieldRevisions.rent;
  return entry.revision === revision && Math.abs(entry.value - rent) < 0.005;
}

/** True only when the scope names exact terms (dates included); an amount alone never does. */
export function approvalCoversRenewalDates(scope: OwnerApprovalScope | null): boolean {
  return scope?.kind === "exact_terms" || scope?.kind === "offer_snapshot";
}

/**
 * R-S262-3 / AC-S262-3: an offer's charges are covered only by the exact offer snapshot the owner
 * approved. Amount-only and exact-terms approvals never cover offer charges, and an unchanged
 * packet hash is not an offer snapshot.
 */
export function approvalCoversOfferSnapshot(
  scope: OwnerApprovalScope | null,
  offer: OfferSnapshotIdentity | null,
): boolean {
  return (
    scope?.kind === "offer_snapshot" &&
    offer !== null &&
    scope.offer.snapshotId === offer.snapshotId &&
    scope.offer.snapshotHash === offer.snapshotHash
  );
}
