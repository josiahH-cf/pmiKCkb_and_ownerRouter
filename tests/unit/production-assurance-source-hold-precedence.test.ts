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
  it("S157: no process, migration or rent hold changes the status under the staff-lane rules", () => {
    for (const processStatus of ["needs_verification", "migration_required", "active"]) {
      for (const evidence of ["missing_rentvine", "missing_sheet", "conflict"] as const) {
        const input = {
          dispositionExpected: "actionable",
          retentionExpected: "window",
          processExpected: true,
          rentReconciliationExpected: true,
          rentExpectation: { ...missing, evidence },
          processState: {
            processStatus,
            // The predecessor required the verify step here; the staff lane does not order work.
            currentStepId: "owner-decision",
            currentStepState: "blocked",
            waitingParty: "unresolved_source",
          },
        } as const;
        expect(
          projectIndependentExpectedGuidanceState({ ...input, contract: "staff_lane" }),
        ).toEqual({
          overallStatus: "ready",
          actionStepId: "owner-decision",
          actionFragment: "#renewal-manual-owner_outreach",
          markerMismatches: 0,
        });
        // The same source and markers under the predecessor rules still hold the row.
        const predecessor = projectIndependentExpectedGuidanceState(input);
        expect(["needs_verification", "blocked"]).toContain(predecessor.overallStatus);
        expect(predecessor.markerMismatches).toBe(1);
        expect(predecessor).toEqual(
          projectIndependentExpectedGuidanceState({ ...input, contract: "predecessor" }),
        );
      }
    }
  });
  it("S156: the staff-lane rules still verify the process marker vocabulary and presence", () => {
    const base = {
      contract: "staff_lane",
      dispositionExpected: "out_of_window",
      retentionExpected: "outside",
      processExpected: false,
      rentReconciliationExpected: false,
      rentExpectation: missing,
    } as const;
    const none = {
      processStatus: "none",
      currentStepId: "none",
      currentStepState: "none",
      waitingParty: "none",
    };
    // Outside the worklist with nothing recorded: reviewed as context, no action invented.
    expect(
      projectIndependentExpectedGuidanceState({ ...base, processState: none }),
    ).toEqual({
      overallStatus: "needs_review",
      actionStepId: null,
      actionFragment: null,
      markerMismatches: 0,
    });
    expect(
      projectIndependentExpectedGuidanceState({
        ...base,
        processState: { ...none, processStatus: "active" },
      }).markerMismatches,
    ).toBe(1);
    expect(
      projectIndependentExpectedGuidanceState({
        ...base,
        processExpected: true,
        processState: {
          processStatus: null,
          currentStepId: null,
          currentStepState: "invented",
          waitingParty: null,
        },
      }).markerMismatches,
    ).toBe(4);
    // A flagged lease fact is the one row-level cause of Needs verification.
    expect(
      projectIndependentExpectedGuidanceState({
        ...base,
        dispositionExpected: "review",
        retentionExpected: "needs_verification",
        processState: none,
      }),
    ).toEqual({
      overallStatus: "needs_verification",
      actionStepId: "verify-renewal",
      actionFragment: null,
      markerMismatches: 0,
    });
  });
});
