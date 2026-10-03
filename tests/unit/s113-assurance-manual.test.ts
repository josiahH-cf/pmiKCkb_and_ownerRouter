import { describe, expect, it } from "vitest";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";
import {
  INDEPENDENT_UNRECORDED_STAFF_LANE,
  independentLeaseDetailIds,
  projectIndependentManualRenewal,
  projectIndependentStaffLaneManualRenewal,
} from "@/lib/production-assurance/manual-renewal-projection";
import {
  validPhaseWorkspaceDestination,
  PRODUCTION_RECONCILIATION_DESK_VIEW,
} from "@/lib/production-assurance/renewal-source-projection";
import {
  classifyIndependentRenewalRetention,
  projectIndependentExpectedGuidanceState,
} from "../../scripts/run-production-reconciliation";
const initial = () =>
  emptyRenewalWorkspace("701", "41239147-6bfb-4878-8c46-c36b97021909", {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "provider",
  });
const act = (state: ReturnType<typeof initial>, action: RenewalWorkspaceAction) =>
  planRenewalWorkspaceAction(state, action, {
    actorUid: "operator",
    recordedAt: "2026-09-10T12:00:00.000Z",
    eventId: "event",
  });
describe("S113 independent production-assurance continuation", () => {
  it("uses actual numeric export identities for detail reads", () => {
    expect(
      independentLeaseDetailIds([
        { lease: { leaseID: "701" } },
        { leaseId: 702 },
        { id: "d" },
        { id: "0" },
        { id: "-1" },
        { id: null },
        { lease: { id: "701" } },
      ]),
    ).toEqual(["701", "702"]);
  });
  it("derives staff completion and pending source updates without inventing provider receipts", () => {
    let state = act(initial(), {
      kind: "owner_response",
      outcome: "declined_non_renewal",
      source: "phone",
    });
    expect(projectIndependentManualRenewal(state)).toMatchObject({
      complete: false,
      nextActivity: "non_renewal_handoff",
    });
    state = act(state, {
      kind: "activity",
      activity: "non_renewal_handoff",
      outcome: "done",
      source: "recorded handoff",
    });
    expect(projectIndependentManualRenewal(state)).toMatchObject({
      complete: false,
      nextActivity: "complete",
    });
    state = act(state, { kind: "complete", source: "reviewed handoff" });
    const done = projectIndependentManualRenewal(state);
    expect(done).toMatchObject({ complete: true, actionStepId: "compliance-close" });
    expect(done).not.toHaveProperty("receipt");
    expect(
      projectIndependentManualRenewal({
        ...state,
        termsRevision: state.termsRevision + 1,
      }).complete,
    ).toBe(false);
    expect(
      projectIndependentManualRenewal({ ...state, revision: state.revision + 1 })
        .sourceDigest,
    ).not.toBe(done.sourceDigest);
  });
  it("keeps pending manual work retained outside the periodic review window", () => {
    expect(
      classifyIndependentRenewalRetention({
        row: {
          leaseId: "701",
          endDate: "2025-01-01",
          monthToMonth: { signal: true, startDateIso: "2026-08-01" },
        } as never,
        trackedIncomplete: false,
        referenceDateIso: "2026-09-10",
        manualPending: true,
      }),
    ).toBe("tracked_incomplete");
  });
  it("checks a source-derived exact manual anchor and retains default fragment refusal", () => {
    const origin = "https://candidate---pmi-kc-app-abc-uc.a.run.app";
    const href = `/lease-renewal/live/desk/lease/701?step=owner-decision&deskView=${encodeURIComponent(PRODUCTION_RECONCILIATION_DESK_VIEW)}#renewal-manual-owner_outreach`;
    expect(
      validPhaseWorkspaceDestination(
        href,
        origin,
        "701",
        "owner-decision",
        PRODUCTION_RECONCILIATION_DESK_VIEW,
        "#renewal-manual-owner_outreach",
      ),
    ).toBe(true);
    expect(validPhaseWorkspaceDestination(href, origin, "701", "owner-decision")).toBe(
      false,
    );
    expect(
      validPhaseWorkspaceDestination(
        href,
        origin,
        "702",
        "owner-decision",
        PRODUCTION_RECONCILIATION_DESK_VIEW,
        "#renewal-manual-owner_outreach",
      ),
    ).toBe(false);
    expect(
      validPhaseWorkspaceDestination(
        href,
        origin,
        "701",
        "owner-decision",
        PRODUCTION_RECONCILIATION_DESK_VIEW,
        "#renewal-manual-tenant_offer",
      ),
    ).toBe(false);
  });
  it("uses persisted manual state for the manual status while retaining missing-source holds", () => {
    const manual = projectIndependentManualRenewal(initial());
    const input = {
      dispositionExpected: "actionable" as const,
      retentionExpected: "window" as const,
      processExpected: true,
      rentReconciliationExpected: true,
      rentExpectation: {
        evidence: "agree" as const,
        rentVerification: "verified" as const,
        verifiedByResolutionDiffers: false,
        resolvedValue: 1250,
      },
      processState: {
        processStatus: "active",
        currentStepId: "owner-decision",
        currentStepState: "blocked",
        waitingParty: "none",
      },
      manual,
    };
    expect(projectIndependentExpectedGuidanceState(input)).toMatchObject({
      overallStatus: "ready",
      actionStepId: "owner-decision",
    });
    expect(
      projectIndependentExpectedGuidanceState({
        ...input,
        rentExpectation: {
          ...input.rentExpectation,
          evidence: "missing_sheet",
          rentVerification: "needs_verification",
        },
      }),
    ).toMatchObject({
      overallStatus: "needs_verification",
      actionStepId: "verify-renewal",
    });
    // S157: under the staff-lane rules the same missing source is evidence, never a status.
    expect(
      projectIndependentExpectedGuidanceState({
        ...input,
        contract: "staff_lane",
        manual: projectIndependentStaffLaneManualRenewal(initial()),
        rentExpectation: {
          ...input.rentExpectation,
          evidence: "missing_sheet",
          rentVerification: "needs_verification",
        },
      }),
    ).toEqual({
      overallStatus: "ready",
      actionStepId: "owner-decision",
      actionFragment: "#renewal-manual-owner_outreach",
      markerMismatches: 0,
    });
  });
});

describe("S156 staff-lane manual projection beside the predecessor projection", () => {
  const outreach = () =>
    act(initial(), { kind: "activity", activity: "owner_outreach", outcome: "done" });
  const accepted = () => {
    let state = act(outreach(), {
      kind: "owner_response",
      outcome: "approved_terms",
      terms: { rent: 1300, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
    });
    state = act(state, { kind: "activity", activity: "tenant_offer", outcome: "done" });
    return act(state, { kind: "tenant_response", outcome: "accepted" });
  };

  it("guides a lease with nothing recorded to the first staff activity", () => {
    expect(INDEPENDENT_UNRECORDED_STAFF_LANE).toEqual({
      complete: false,
      nextActivity: "owner_outreach",
      actionStepId: "owner-decision",
    });
    expect(projectIndependentStaffLaneManualRenewal(initial())).toMatchObject({
      complete: false,
      nextActivity: "owner_outreach",
      actionStepId: "owner-decision",
      pendingSourceUpdates: 0,
    });
  });

  it("BEH-S156: completion is the staff record; the predecessor still required the checklist", () => {
    const state = act(outreach(), { kind: "complete" });
    expect(projectIndependentStaffLaneManualRenewal(state)).toMatchObject({
      complete: true,
      nextActivity: "complete",
      actionStepId: "compliance-close",
    });
    expect(projectIndependentManualRenewal(state)).toMatchObject({
      complete: false,
      nextActivity: "owner_response",
    });
    // A later record or a later terms revision does not clear a recorded completion.
    const later = act(state, { kind: "owner_response", outcome: "revision_requested" });
    expect(later.termsRevision).toBeGreaterThan(state.termsRevision);
    expect(projectIndependentStaffLaneManualRenewal(later).complete).toBe(true);
    expect(projectIndependentManualRenewal(later).complete).toBe(false);
    expect(
      projectIndependentStaffLaneManualRenewal(act(later, { kind: "reopen" })).complete,
    ).toBe(false);
  });

  it("BEH-S156: a conditional Not applicable needs no reason or policy under the staff lane only", () => {
    const state = act(accepted(), {
      kind: "activity",
      activity: "information_form",
      outcome: "not_applicable",
    });
    expect(projectIndependentStaffLaneManualRenewal(state).nextActivity).toBe(
      "form_returned",
    );
    expect(projectIndependentManualRenewal(state).nextActivity).toBe("information_form");
    // Not applicable never satisfies an activity that does not depend on the lease.
    const current = accepted();
    const notApplicable = {
      ...current.activities.tenant_offer!,
      outcome: "not_applicable" as const,
    };
    expect(
      projectIndependentStaffLaneManualRenewal({
        ...current,
        activities: {
          ...current.activities,
          information_form: notApplicable,
          form_returned: notApplicable,
          documents: notApplicable,
        },
      }).nextActivity,
    ).toBe("documents");
  });

  it("keeps an approval recorded without terms on the owner response in both rule sets", () => {
    const state = act(outreach(), { kind: "owner_response", outcome: "approved_terms" });
    // S156 BEH-4: the approval is the recorded answer; the staff lane moves on to the offer.
    expect(projectIndependentStaffLaneManualRenewal(state)).toMatchObject({
      nextActivity: "tenant_offer",
      actionStepId: "tenant-decision",
    });
    expect(projectIndependentManualRenewal(state).nextActivity).toBe("owner_response");
  });

  it("maps every staff-lane activity to its workspace step and keeps a private digest", () => {
    const state = accepted();
    expect(projectIndependentStaffLaneManualRenewal(state)).toMatchObject({
      nextActivity: "information_form",
      actionStepId: "tenant-decision",
    });
    const declined = act(outreach(), {
      kind: "owner_response",
      outcome: "declined_non_renewal",
    });
    expect(projectIndependentStaffLaneManualRenewal(declined)).toMatchObject({
      nextActivity: "non_renewal_handoff",
      actionStepId: "compliance-close",
    });
    expect(projectIndependentStaffLaneManualRenewal(state).sourceDigest).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(
      projectIndependentStaffLaneManualRenewal({ ...state, revision: state.revision + 1 })
        .sourceDigest,
    ).not.toBe(projectIndependentStaffLaneManualRenewal(state).sourceDigest);
  });
});
