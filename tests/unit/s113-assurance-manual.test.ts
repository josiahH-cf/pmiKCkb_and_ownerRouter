import { describe, expect, it } from "vitest";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";
import {
  independentLeaseDetailIds,
  projectIndependentManualRenewal,
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
  });
});
