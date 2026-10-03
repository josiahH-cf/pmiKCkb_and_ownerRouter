import { describe, expect, it } from "vitest";

import {
  buildDeskLeaseGuidance,
  type DeskGuidanceInput,
} from "@/lib/lease-renewal/desk-guidance";
import { OVERALL_STATUS_URGENCY_RANK } from "@/lib/lease-renewal/desk-query-v2";
import {
  RENEWAL_COMPLETION_REQUIREMENTS,
  buildRenewalEvidenceReference,
  projectRenewalProcess,
  type RenewalEvidenceMap,
  type RenewalEvidenceReference,
  type RenewalEvidenceSource,
  type RenewalProcessProjection,
  type RenewalTenantOutcome,
} from "@/lib/lease-renewal/renewal-process";
import type { RenewalFollowUpProjection } from "@/lib/lease-renewal/follow-up-projection";
import type { LiveOwnerCurrentRentDecision } from "@/lib/lease-renewal/live-desk";
import { DESK_GUIDANCE_CONTRACT } from "@/lib/lease-renewal/desk-guidance";
import {
  MANUAL_REQUIRED_RENEWAL,
  emptyRenewalWorkspace,
  manualRenewalSummary,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";

// S156/S157 (8a3f929d): the staff-recorded lane guides every worklist lease. Status is
// needs_verification only for a stale or incomplete read, unreadable progress with nothing
// recorded, or a flagged lease fact; otherwise it comes from the staff lane (complete, waiting,
// ready). There is no Blocked status and no blocker list; a rent or source difference is
// advisory evidence carried by `rentVerification`.

/** The staff-lane summary after the given records, as the live desk row carries it. */
function staffLane(...actions: RenewalWorkspaceAction[]) {
  let state = emptyRenewalWorkspace("L-1", "b4bc3b81-c402-4f62-a2e2-c605c67867fb", {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
  let event = 0;
  for (const action of actions)
    state = planRenewalWorkspaceAction(state, action, {
      actorUid: "fixture-staff",
      recordedAt: "2026-09-01T12:00:00.000Z",
      eventId: `00000000-0000-4000-8000-${String((event += 1)).padStart(12, "0")}`,
    });
  return manualRenewalSummary(state);
}

function verified(
  key: string,
  source: RenewalEvidenceSource = "app_record",
): RenewalEvidenceReference {
  return buildRenewalEvidenceReference({
    ref: `${source}:${key}:receipt-1`,
    source,
    disposition: "verified",
  });
}

function notApplicable(key: string): RenewalEvidenceReference {
  return buildRenewalEvidenceReference({
    ref: `policy:${key}:not-applicable`,
    source: "policy_version",
    disposition: "not_applicable",
    reason: `The approved ${key} rule does not apply to this lease.`,
  });
}

function acceptedEvidence(): RenewalEvidenceMap {
  const evidence: RenewalEvidenceMap = {};
  for (const requirement of RENEWAL_COMPLETION_REQUIREMENTS) {
    evidence[requirement.key] = requirement.allowNotApplicable
      ? notApplicable(requirement.key)
      : verified(requirement.key);
  }
  return evidence;
}

function acceptedOutcome(evidence: RenewalEvidenceMap): RenewalTenantOutcome {
  return {
    state: "accepted",
    evidence: evidence["tenant-outcome"] ?? verified("tenant-outcome", "gmail_receipt"),
  };
}

// Enough verify-renewal evidence that the remaining required substeps are genuinely `ready` —
// present, unblocked, and awaiting operator work — without advancing into the dependency-blocked
// later phases.
const PARTIAL_VERIFY_EVIDENCE_KEYS = [
  "lease-tracked",
  "lease-identity",
  "recurring-charges-separated",
  "lease-end-date",
  "source-snapshot-current",
] as const;

function partialVerifyEvidence(): RenewalEvidenceMap {
  const evidence: RenewalEvidenceMap = {};
  for (const key of PARTIAL_VERIFY_EVIDENCE_KEYS) evidence[key] = verified(key);
  return evidence;
}

function blockedProcess(): RenewalProcessProjection {
  return projectRenewalProcess({
    processVersion: "renewal-v1",
    evidence: {},
    evidenceBlockers: {
      "base-rent": {
        reason: "Contractual base rent is missing, stale, ambiguous, or conflicting.",
        nextAction: "Resolve contractual base rent before continuing.",
      },
      "source-conflicts-resolved": {
        reason: "2 blocking source items remain.",
        nextAction: "Record an exact source disposition or leave the lease visibly held.",
      },
    },
  });
}

function readyProcess(): RenewalProcessProjection {
  return projectRenewalProcess({
    processVersion: "renewal-v1",
    evidence: partialVerifyEvidence(),
  });
}

function waitingProcess(): RenewalProcessProjection {
  // Every operator-side item is complete; the only open state is the tenant's response, so the
  // forced current phase is not blocked and the projection reports a true waiting status.
  return projectRenewalProcess({
    processVersion: "renewal-v1",
    evidence: acceptedEvidence(),
    tenantOutcome: {
      state: "awaiting_response",
      evidence: verified("tenant-outcome", "gmail_receipt"),
    },
  });
}

function completeProcess(): RenewalProcessProjection {
  const evidence = {
    ...acceptedEvidence(),
    "app-completion": verified("app-completion", "compliance_record"),
  };
  return projectRenewalProcess({
    processVersion: "renewal-v1",
    evidence,
    tenantOutcome: acceptedOutcome(evidence),
    complete: true,
  });
}

function followUpWaitingOn(party: "owner" | "tenant" | null): RenewalFollowUpProjection {
  return {
    version: "renewal-follow-up-v1",
    leaseId: "L-1",
    asOfIso: "2026-09-01T12:00:00.000Z",
    linkedThread: null,
    waiting: party
      ? { state: "verified", party, source: null }
      : { state: "not_waiting", party: null, source: null },
    lastContact: { state: "needs_verification", atIso: null, source: null },
    policy: {
      state: "unset",
      label: "Timing policy not confirmed",
      version: null,
      updatedAtIso: null,
      effectiveScope: null,
      effectiveKey: null,
      intervalDays: null,
    },
    due: { state: "unset", atIso: null },
    nextAction: "Continue from exact evidence.",
    workItem: null,
    attentionState: "not_applicable",
    attention: null,
  };
}

function decision(
  agreement: LiveOwnerCurrentRentDecision["currentRentEvidence"]["agreement"],
  currentRent: number,
  currencyState: "fresh" | "stale" | "expired" = "fresh",
): LiveOwnerCurrentRentDecision {
  return {
    currentRent,
    currentRentEvidence: {
      agreement,
      currencyState,
      readAtIso: "2026-09-01T12:00:00.000Z",
      ...(agreement === "resolved"
        ? { resolvedSource: "Human-resolved current rent" }
        : {}),
    },
  };
}

function input(overrides: Partial<DeskGuidanceInput> = {}): DeskGuidanceInput {
  return {
    summary: {
      id: "L-1",
      disposition: "actionable",
      reason: "actionable",
      reasonLabel: "Ready to work",
      retention: { state: "window", label: "Inside the current-month renewal window" },
      followUp: followUpWaitingOn(null),
    },
    process: readyProcess(),
    dataCheck: null,
    rentvineCurrentRent: 1500,
    rentDecision: decision("agree", 1500),
    currencyState: "fresh",
    readComplete: true,
    ...overrides,
  };
}

describe("S82 rent display and verification", () => {
  it("displays the exact RentVine amount and never substitutes a resolved value", () => {
    const guidance = buildDeskLeaseGuidance(
      input({ rentDecision: decision("resolved", 1725) }),
    );
    expect(guidance.currentBaseRent).toBe(1500);
    expect(guidance.currentBaseRentSource).toBe("RentVine");
    expect(guidance.rentVerification.state).toBe("verified");
    expect(guidance.rentVerification.verifiedByResolutionDiffers).toBe(true);
  });

  it("keeps a resolution-equal verification without the differs marker", () => {
    const guidance = buildDeskLeaseGuidance(
      input({ rentDecision: decision("resolved", 1500) }),
    );
    expect(guidance.rentVerification.verifiedByResolutionDiffers).toBe(false);
    expect(guidance.rentVerification.state).toBe("verified");
  });

  it("renders a missing RentVine rent as null — never zero — with needs_verification", () => {
    const guidance = buildDeskLeaseGuidance(
      input({
        rentvineCurrentRent: null,
        rentDecision: decision("missing", 0),
      }),
    );
    expect(guidance.currentBaseRent).toBeNull();
    expect(guidance.rentVerification.state).toBe("needs_verification");
  });

  it("never treats a non-positive or non-finite resolved rent as verified", () => {
    for (const currentRent of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
      const guidance = buildDeskLeaseGuidance(
        input({
          rentvineCurrentRent: null,
          rentDecision: decision("resolved", currentRent),
        }),
      );
      expect(guidance.currentBaseRent).toBeNull();
      expect(guidance.rentVerification.state).toBe("needs_verification");
      expect(guidance.rentVerification.verifiedByResolutionDiffers).toBe(false);
    }
  });

  it("marks a conflicting or single-source rent needs_verification and stale reads unavailable", () => {
    expect(
      buildDeskLeaseGuidance(input({ rentDecision: decision("conflict", 1500) }))
        .rentVerification.state,
    ).toBe("needs_verification");
    expect(
      buildDeskLeaseGuidance(input({ rentDecision: decision("single_source", 1500) }))
        .rentVerification.state,
    ).toBe("needs_verification");
    expect(
      buildDeskLeaseGuidance(input({ currencyState: "expired" })).rentVerification.state,
    ).toBe("unavailable");
    expect(
      buildDeskLeaseGuidance(input({ readComplete: false })).rentVerification.state,
    ).toBe("unavailable");
  });

  it("S157 BEH-6/7: keeps a single-source or conflicting rent advisory, never a status", () => {
    const singleSource = buildDeskLeaseGuidance(
      input({
        rentDecision: decision("single_source", 1500),
        dataCheck: [
          {
            fieldKey: "current_rent",
            fieldLabel: "Rent",
            agreement: "single_source",
            candidates: [],
          },
        ],
      }),
    );
    expect(singleSource.rentVerification.state).toBe("needs_verification");
    expect(singleSource.overallStatus).toBe("ready");
    expect(singleSource.isBlocked).toBe(false);
    expect(singleSource.blockers).toEqual([]);

    const conflict = buildDeskLeaseGuidance(
      input({
        process: blockedProcess(),
        rentDecision: decision("conflict", 1500),
        dataCheck: [
          {
            fieldKey: "current_rent",
            fieldLabel: "Rent",
            agreement: "conflict",
            candidates: [],
          },
        ],
      }),
    );
    // The difference stays visible through the verification destination; the row stays workable.
    expect(conflict.rentVerification).toEqual({
      state: "needs_verification",
      verifiedByResolutionDiffers: false,
      destination: { kind: "workspace_phase", stepId: "verify-renewal" },
    });
    expect(conflict.overallStatus).toBe("ready");
    expect(conflict.isBlocked).toBe(false);
    expect(conflict.action).toMatchObject({ kind: "act", label: "Owner outreach" });
  });
});

describe("S82 overall status precedence", () => {
  it("orders needs_verification above the staff lane and never produces Blocked", () => {
    // S156: a blocked evidence graph no longer withholds work; the staff lane leads.
    const blocked = buildDeskLeaseGuidance(input({ process: blockedProcess() }));
    expect(blocked.overallStatus).toBe("ready");
    expect(blocked.isBlocked).toBe(false);
    expect(blocked.contract).toBe(DESK_GUIDANCE_CONTRACT);

    const expired = buildDeskLeaseGuidance(
      input({ process: blockedProcess(), currencyState: "expired" }),
    );
    expect(expired.overallStatus).toBe("needs_verification");
    expect(expired.isBlocked).toBe(true);
    expect(expired.blockers).toEqual([]);
    expect(expired.action).toMatchObject({
      kind: "needs_verification",
      label: "Lease data is out of date. Refresh to see current data.",
      destination: { kind: "none" },
    });
    // An expired read outranks a recorded staff lane, including a completed one.
    expect(
      buildDeskLeaseGuidance(
        input({
          currencyState: "expired",
          summary: {
            ...input().summary,
            manualProgress: staffLane({ kind: "complete", source: "Staff" }),
          },
        }),
      ).overallStatus,
    ).toBe("needs_verification");

    const incomplete = buildDeskLeaseGuidance(
      input({ process: blockedProcess(), readComplete: false }),
    );
    expect(incomplete.blockers).toEqual([]);
    expect(incomplete.action).toMatchObject({
      kind: "needs_verification",
      label: expect.stringContaining("did not complete"),
      destination: { kind: "none" },
    });
  });

  it("reports complete, waiting, and ready from the staff-recorded lane", () => {
    const withLane = (manualProgress: ReturnType<typeof staffLane>) =>
      buildDeskLeaseGuidance(input({ summary: { ...input().summary, manualProgress } }));
    expect(withLane(staffLane({ kind: "complete", source: "Staff" })).overallStatus).toBe(
      "complete",
    );
    const waiting = withLane(
      staffLane({
        kind: "activity",
        activity: "owner_outreach",
        outcome: "done",
        source: "Owner call",
      }),
    );
    expect(waiting.overallStatus).toBe("waiting");
    expect(waiting.isBlocked).toBe(false);
    const ready = buildDeskLeaseGuidance(input());
    expect(ready.overallStatus).toBe("ready");
    expect(ready.isBlocked).toBe(false);
    // The evidence graph's own complete, waiting and ready states are no longer the status: a
    // lease with nothing recorded by staff is Ready for its first staff activity.
    for (const process of [completeProcess(), waitingProcess(), readyProcess()]) {
      const guidance = buildDeskLeaseGuidance(
        input({
          process,
          summary: { ...input().summary, followUp: followUpWaitingOn("tenant") },
        }),
      );
      expect(guidance.overallStatus).toBe("ready");
      expect(guidance.action).toMatchObject({ kind: "act", label: "Owner outreach" });
    }
  });

  it("treats a review-disposition row as fail-closed needs_verification", () => {
    const guidance = buildDeskLeaseGuidance(
      input({
        process: blockedProcess(),
        summary: {
          ...input().summary,
          disposition: "review",
          reason: "no_end_date",
          reasonLabel: "No end date on file",
        },
      }),
    );
    expect(guidance.overallStatus).toBe("needs_verification");
    expect(guidance.isBlocked).toBe(true);
    expect(guidance.action).toMatchObject({
      kind: "needs_verification",
      label: expect.stringContaining("No end date on file"),
      destination: { kind: "workspace_phase", stepId: "verify-renewal" },
    });
    expect(guidance.blockers).toEqual([]);
  });

  it("fails closed without an actionable destination when saved progress is unreadable", () => {
    const normallyReady = buildDeskLeaseGuidance(input());
    expect(normallyReady.overallStatus).toBe("ready");
    expect(normallyReady.action.kind).toBe("act");

    const unavailable = buildDeskLeaseGuidance(input({ progressStateAvailable: false }));
    expect(unavailable.overallStatus).toBe("needs_verification");
    expect(unavailable.isBlocked).toBe(true);
    expect(unavailable.action).toEqual({
      kind: "needs_verification",
      label: "Saved renewal progress could not be read. Refresh to see it.",
      destination: { kind: "none" },
    });
    // A readable staff record answers for itself; unreadable S72 progress then changes nothing.
    const recorded = buildDeskLeaseGuidance(
      input({
        progressStateAvailable: false,
        summary: { ...input().summary, manualProgress: staffLane() },
      }),
    );
    expect(recorded.overallStatus).toBe("ready");
    expect(recorded.action).toMatchObject({ kind: "act", label: "Owner outreach" });
  });

  it("keeps a merely non-actionable row needs_review and never isBlocked", () => {
    const guidance = buildDeskLeaseGuidance(
      input({
        process: null,
        summary: {
          ...input().summary,
          disposition: "skip",
          reason: "month_to_month",
          reasonLabel: "Month-to-month",
        },
      }),
    );
    expect(guidance.overallStatus).toBe("needs_review");
    expect(guidance.isBlocked).toBe(false);
    expect(guidance.action).toMatchObject({ kind: "review", label: "Month-to-month" });
    expect(guidance.urgencyRank).toBe(OVERALL_STATUS_URGENCY_RANK.needs_review);
  });
});

describe("S82 guidance and the suggested next action", () => {
  it("S156 ARCH-2: a blocked evidence graph withholds nothing from the staff lane", () => {
    const guidance = buildDeskLeaseGuidance(input({ process: blockedProcess() }));
    expect(guidance.blockers).toEqual([]);
    expect(guidance.isBlocked).toBe(false);
    expect(guidance.contract).toBe("s156-staff-lane");
    expect(guidance.action).toEqual({
      kind: "act",
      label: "Owner outreach",
      destination: {
        kind: "workspace_phase",
        stepId: "owner-decision",
        controlId: "renewal-manual-owner_outreach",
      },
    });
  });

  it("carries the staff-lane contract on every row", () => {
    for (const guidance of [
      buildDeskLeaseGuidance(input()),
      buildDeskLeaseGuidance(input({ currencyState: "expired" })),
      buildDeskLeaseGuidance(input({ process: null })),
    ]) {
      expect(guidance.contract).toBe("s156-staff-lane");
      expect(guidance.blockers).toEqual([]);
    }
  });

  it("offers exactly one next control when unblocked", () => {
    const guidance = buildDeskLeaseGuidance(input());
    expect(guidance.blockers).toEqual([]);
    expect(guidance.action.kind).toBe("act");
    if (guidance.action.kind !== "act") throw new Error("Expected an act action.");
    expect(guidance.action.destination).toMatchObject({ kind: "workspace_phase" });
    expect(guidance.action.label.length).toBeGreaterThan(0);
  });

  it("routes waiting and complete rows to the staff record they come from", () => {
    const waiting = buildDeskLeaseGuidance(
      input({
        summary: {
          ...input().summary,
          followUp: followUpWaitingOn("tenant"),
          manualProgress: staffLane(
            {
              kind: "activity",
              activity: "owner_outreach",
              outcome: "done",
              source: "Owner call",
            },
            {
              kind: "owner_response",
              outcome: "approved_terms",
              terms: { rent: 1550, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
              source: "Owner email",
            },
            {
              kind: "activity",
              activity: "tenant_offer",
              outcome: "done",
              source: "Offer email",
            },
          ),
        },
      }),
    );
    expect(waiting.overallStatus).toBe("waiting");
    expect(waiting.action).toEqual({
      kind: "waiting",
      label: "Record tenant response",
      destination: {
        kind: "workspace_phase",
        stepId: "tenant-decision",
        controlId: "renewal-manual-tenant_response",
      },
    });
    const complete = buildDeskLeaseGuidance(
      input({
        summary: {
          ...input().summary,
          manualProgress: staffLane(
            {
              kind: "owner_response",
              outcome: "approved_terms",
              terms: { rent: 1550, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
              source: "Owner email",
            },
            { kind: "tenant_response", outcome: "accepted", source: "Tenant email" },
            ...MANUAL_REQUIRED_RENEWAL.map(
              (activity): RenewalWorkspaceAction => ({
                kind: "activity",
                activity,
                outcome: "done",
                source: "Staff",
              }),
            ),
            { kind: "complete", source: "Staff" },
          ),
        },
      }),
    );
    expect(complete.overallStatus).toBe("complete");
    expect(complete.action).toEqual({
      kind: "complete",
      label: "Review completion recorded by staff.",
      destination: {
        kind: "workspace_phase",
        stepId: "compliance-close",
        controlId: "renewal-manual-complete",
      },
    });
  });
});
