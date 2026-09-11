import { describe, expect, it } from "vitest";
import {
  countIndependentMigrationHoldMismatches,
  projectIndependentExpectedGuidanceState,
} from "../../scripts/run-production-reconciliation";

const missing = {
  evidence: "missing_sheet",
  rentVerification: "needs_verification",
  verifiedByResolutionDiffers: false,
  resolvedValue: null,
} as const;
describe("independent source holds across the full portfolio", () => {
  it("requires a migration hold without obsolete process blockers, retaining exact rent and blocked state", () => {
    const observed = {
      rentVerification: "needs_verification",
      verifiedByResolutionDiffers: "false",
      overallStatus: "needs_verification",
      isBlocked: "true",
      blockerCount: 0,
    };
    expect(countIndependentMigrationHoldMismatches(missing, observed)).toBe(0);
    for (const patch of [
      { overallStatus: "ready" },
      { isBlocked: "false" },
      { rentVerification: "verified" },
      { verifiedByResolutionDiffers: "true" },
      { blockerCount: 1 },
    ]) {
      expect(
        countIndependentMigrationHoldMismatches(missing, { ...observed, ...patch }),
      ).toBeGreaterThan(0);
    }
  });
  it("requires source verification outside the execution cohort without inventing an execution-phase action", () => {
    const result = projectIndependentExpectedGuidanceState({
      dispositionExpected: "out_of_window",
      retentionExpected: "outside",
      processExpected: false,
      rentReconciliationExpected: false,
      rentExpectation: missing,
      processState: {
        processStatus: "none",
        currentStepId: "none",
        currentStepState: "none",
        waitingParty: "none",
      },
    });
    expect(result).toEqual({
      overallStatus: "needs_verification",
      actionStepId: null,
      markerMismatches: 0,
    });
  });
  it("keeps a process verification hold ahead of an observed rent conflict, without clearing either", () => {
    const result = projectIndependentExpectedGuidanceState({
      dispositionExpected: "actionable",
      retentionExpected: "window",
      processExpected: true,
      rentReconciliationExpected: true,
      rentExpectation: { ...missing, evidence: "conflict" },
      processState: {
        processStatus: "needs_verification",
        currentStepId: "verify-renewal",
        currentStepState: "blocked",
        waitingParty: "unresolved_source",
      },
    });
    expect(result).toEqual({
      overallStatus: "needs_verification",
      actionStepId: "verify-renewal",
      markerMismatches: 0,
    });
  });
});
