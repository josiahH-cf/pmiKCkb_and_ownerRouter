import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { EditableLayerError } from "@/lib/firestore/errors";
import { recordRenewalDiscrepancyDisposition } from "@/lib/firestore/renewal-discrepancy-dispositions";
import {
  CurrentRentReviewSchema,
  currentRentReviewFromDisposition,
} from "@/lib/lease-renewal/correction-review";
import { resolveFreshOperatingSheetLeaseContext } from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
const Body = CurrentRentReviewSchema.extend({
  leaseId: z.string().regex(/^[1-9]\d*$/),
}).strict();
/** Persist staff's proposed value in the existing audited disposition lane. This grants no resolution or write approval. */
export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("record_discrepancy_disposition"),
      "renewals",
    );
    if (isVerificationAccount(actor))
      throw new EditableLayerError(
        "Verification accounts cannot record correction proposals.",
        403,
      );
    assertMutationAllowed(requireEnvironmentDescriptor());
    const { leaseId, ...review } = await parseJsonBody(request, Body);
    const current = await resolveFreshOperatingSheetLeaseContext(leaseId);
    if (
      !current.row ||
      current.row.currentRentCandidateFingerprint !== review.candidateFingerprint
    )
      throw new EditableLayerError(
        "Current-rent sources changed or the Sheet row is ambiguous. Refresh before saving this review handoff.",
        409,
      );
    const disposition = await recordRenewalDiscrepancyDisposition(actor, {
      lease_id: leaseId,
      sheet_row_number: current.row.rowNumber,
      source_hash: review.candidateFingerprint,
      field: "current_rent",
      category:
        current.row.currentRentAgreement === "agree"
          ? "agree"
          : current.row.currentRentAgreement === "conflict"
            ? "conflict"
            : current.row.currentRentAgreement === "missing"
              ? "missing"
              : current.row.currentRentAgreement === "single_source"
                ? current.row.currentRentValue.trim()
                  ? "sheet_only"
                  : "rentvine_only"
                : "missing",
      authoritative_source: "not_determined",
      proposed_correction: JSON.stringify(review),
      reason: review.source,
      owner_uid: actor.uid,
      status: "proposed",
      evidence_refs: [review.source],
    });
    return NextResponse.json({ review: currentRentReviewFromDisposition(disposition) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
