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
});

describe("S82 overall status precedence", () => {
  it("orders needs_verification above blocked above complete", () => {
    const blocked = buildDeskLeaseGuidance(input({ process: blockedProcess() }));
    expect(blocked.overallStatus).toBe("blocked");
    expect(blocked.isBlocked).toBe(true);

    const expired = buildDeskLeaseGuidance(
      input({ process: blockedProcess(), currencyState: "expired" }),
    );
    expect(expired.overallStatus).toBe("needs_verification");
    expect(expired.isBlocked).toBe(true);
  });

  it("reports complete, waiting, and ready from real process projections", () => {
    expect(
      buildDeskLeaseGuidance(input({ process: completeProcess() })).overallStatus,
    ).toBe("complete");
    const waiting = buildDeskLeaseGuidance(
      input({
        process: waitingProcess(),
        summary: {
          ...input().summary,
          followUp: followUpWaitingOn("tenant"),
        },
      }),
    );
    expect(waiting.overallStatus).toBe("waiting");
    expect(waiting.isBlocked).toBe(false);
    const ready = buildDeskLeaseGuidance(input());
    expect(ready.overallStatus).toBe("ready");
    expect(ready.isBlocked).toBe(false);
  });

  it("treats a review-disposition row as fail-closed needs_verification", () => {
    const guidance = buildDeskLeaseGuidance(
      input({
        process: null,
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
    });
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

describe("S82 blockers and the single safe next action", () => {
  it("exposes every causal blocker with phase destinations and grounded capabilities", () => {
    const guidance = buildDeskLeaseGuidance(input({ process: blockedProcess() }));
    expect(guidance.action).toEqual({ kind: "blocked" });
    expect(guidance.blockers.length).toBeGreaterThan(0);
    const labels = guidance.blockers.map((blocker) => blocker.label);
    expect(labels).toContain(
      "Contractual base rent is missing, stale, ambiguous, or conflicting.",
    );
    expect(labels).toContain("2 blocking source items remain.");
    expect(new Set(labels).size).toBe(labels.length);
    for (const blocker of guidance.blockers) {
      expect(blocker.phaseId).toBe("verify-renewal");
      expect(blocker.destination).toEqual({
        kind: "workspace_phase",
        stepId: "verify-renewal",
      });
    }
    const reconciliation = guidance.blockers.find((blocker) =>
      blocker.label.includes("blocking source items"),
    );
    expect(reconciliation?.requiredCapability).toBe("approve");
  });

  it("offers exactly one next control when unblocked", () => {
    const guidance = buildDeskLeaseGuidance(input());
    expect(guidance.blockers).toEqual([]);
    expect(guidance.action.kind).toBe("act");
    if (guidance.action.kind !== "act") throw new Error("Expected an act action.");
    expect(guidance.action.destination).toMatchObject({ kind: "workspace_phase" });
    expect(guidance.action.label.length).toBeGreaterThan(0);
  });

  it("routes waiting and complete rows to truthful review destinations", () => {
    const waiting = buildDeskLeaseGuidance(
      input({
        process: waitingProcess(),
        summary: { ...input().summary, followUp: followUpWaitingOn("tenant") },
      }),
    );
    expect(waiting.action).toMatchObject({
      kind: "waiting",
      label: expect.stringContaining("the tenant"),
    });
    const complete = buildDeskLeaseGuidance(input({ process: completeProcess() }));
    expect(complete.action).toMatchObject({
      kind: "complete",
      destination: { kind: "workspace_phase", stepId: "compliance-close" },
    });
  });
});
