import { describe, expect, it } from "vitest";

import { SYNTHETIC_APPROVAL } from "../helpers/owner-approval";
import {
  RENEWAL_PROCESS_VERSION,
  buildRenewalEvidenceReference,
  projectRenewalProcess,
  type RenewalOwnerOutcomeState,
} from "@/lib/lease-renewal/renewal-process";
import {
  earlierOwnerRecordDiffers,
  ownerOutcomeBlocksDownstream,
  planRecordOwnerDecision,
  planRecordTenantOfferDraft,
  type RenewalProgress,
  type RenewalProgressPlan,
} from "@/lib/lease-renewal/renewal-progress";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  staffOwnerOutcome,
} from "@/lib/lease-renewal/workspace-state";

// S234 R-S234-2 (ARCH-S234-2, BEH-S234-3, AC-S234-4): one owner outcome per cycle. The staff
// record's owner outcome is the one every consumer reads; an earlier progress-route record is read
// only without it, and a disagreement is named rather than used. Synthetic records only.

const evidence = (ref: string) =>
  buildRenewalEvidenceReference({
    ref,
    source: "gmail_receipt",
    disposition: "verified",
  });
const asProgress = (plan: RenewalProgressPlan): RenewalProgress => ({
  leaseId: "4821",
  ...plan,
});
/** A progress record with a current owner decision and the given earlier owner outcome. */
function progressWith(state: RenewalOwnerOutcomeState | null): RenewalProgress {
  const decided = asProgress(
    planRecordOwnerDecision(null, { decision: "increase", offeredRent: 1400 }),
  );
  return {
    ...decided,
    ownerOutcome: state ? { state, evidence: evidence("fixture:owner-response") } : null,
  };
}
const meta = {
  actorUid: "operator",
  recordedAt: "2026-09-10T12:00:00.000Z",
  eventId: "event",
};
function staffWith(outcome: "approved_terms" | "declined_non_renewal" | "no_response") {
  return planRenewalWorkspaceAction(
    emptyRenewalWorkspace("4821", "cycle-one", {
      kind: "lease_end",
      dateIso: "2026-12-31",
      source: "RentVine lease end",
    }),
    outcome === "approved_terms"
      ? { kind: "owner_response", outcome, approval: SYNTHETIC_APPROVAL }
      : { kind: "owner_response", outcome },
    meta,
  );
}

describe("S234 one owner outcome per cycle (R-S234-2)", () => {
  it("reads the staff record's owner outcome, only for the lease term it belongs to", () => {
    const staff = staffWith("approved_terms");
    expect(staffOwnerOutcome(staff)).toBe("approved_terms");
    expect(staffOwnerOutcome(staff, "2026-12-31")).toBe("approved_terms");
    // Last term's staff record does not answer this term.
    expect(staffOwnerOutcome(staff, "2027-12-31")).toBeNull();
    expect(
      staffOwnerOutcome(
        emptyRenewalWorkspace("4821", "cycle-one", {
          kind: "lease_end",
          dateIso: "2026-12-31",
          source: "RentVine lease end",
        }),
      ),
    ).toBeNull();
  });

  it("lets the staff record govern the downstream gate and the tenant-offer draft stamp", () => {
    // The earlier record says revision requested; the staff record says approved: no block.
    expect(
      ownerOutcomeBlocksDownstream(progressWith("revision_requested"), "approved_terms"),
    ).toBeNull();
    expect(
      planRecordTenantOfferDraft(
        progressWith("revision_requested"),
        "draft-2",
        "approved_terms",
      ).tenantOfferDraftId,
    ).toBe("draft-2");
    // The staff record's decline blocks even though the earlier record says approved.
    expect(
      ownerOutcomeBlocksDownstream(
        progressWith("approved_terms"),
        "declined_non_renewal",
      ),
    ).toMatch(/owner declined to renew/);
    expect(() =>
      planRecordTenantOfferDraft(
        progressWith("approved_terms"),
        "draft-2",
        "declined_non_renewal",
      ),
    ).toThrow(/owner declined to renew/);
    // Without a staff owner response the earlier record is all there is.
    expect(
      ownerOutcomeBlocksDownstream(progressWith("revision_requested"), null),
    ).toMatch(/asked for a revision/);
  });

  it("projects the process from the staff record's owner outcome", () => {
    const decided = progressWith("revision_requested");
    const project = (staff: RenewalOwnerOutcomeState | null) =>
      projectRenewalProcess({
        processVersion: RENEWAL_PROCESS_VERSION,
        evidence: decided.evidence,
        ownerOutcome: decided.ownerOutcome,
        staffOwnerOutcome: staff,
      });
    expect(project(null).status).toBe("owner_revision_reopened");
    const approved = project("approved_terms");
    expect(approved.status).not.toBe("owner_revision_reopened");
    const bind = approved.steps
      .flatMap((step) => step.substeps)
      .find((substep) => substep.id === "bind-offer-to-owner-decision");
    expect(bind?.blockers.join(" ")).not.toMatch(/revision request/);
    expect(project("declined_non_renewal").status).toBe("non_renewal_handoff_required");
    expect(project("no_response").status).toBe("waiting_on_owner");
  });

  it("names a disagreeing earlier owner record and which record the lease uses", () => {
    expect(earlierOwnerRecordDiffers("revision_requested", "approved_terms")).toBe(
      "Earlier owner record differs. Review: the earlier owner decision record says revision requested; the staff record says approved. This lease uses the staff record.",
    );
    expect(earlierOwnerRecordDiffers("approved_terms", "approved_terms")).toBeNull();
    expect(earlierOwnerRecordDiffers(null, "approved_terms")).toBeNull();
    expect(earlierOwnerRecordDiffers("declined_non_renewal", null)).toBeNull();
  });
});
