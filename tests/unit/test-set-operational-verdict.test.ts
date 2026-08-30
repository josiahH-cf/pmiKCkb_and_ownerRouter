import { describe, expect, it } from "vitest";

import type { TestSetBaseline } from "@/lib/firestore/test-set-baseline";
import { TEST_SET_EVIDENCE_KINDS } from "@/lib/firestore/test-set-evidence";
import {
  evaluateTestSetVerdict,
  S63_RENTCAST_RADIUS_MILES,
  S63_RENTCAST_REQUESTED_COUNT,
  verdictInputFromRecords,
  type TestSetVerdictInput,
} from "@/lib/lease-renewal/test-set-verdict";
import {
  RENEWAL_PROCESS_DEFINITION,
  RENEWAL_PROCESS_VERSION,
} from "@/lib/lease-renewal/renewal-process";

const STEP_IDS = RENEWAL_PROCESS_DEFINITION.steps.map((step) => step.id);
const SUBSTEP_IDS = RENEWAL_PROCESS_DEFINITION.steps.flatMap((step) =>
  step.substeps.map((substep) => substep.id),
);

function passingInput(): TestSetVerdictInput {
  return {
    process: {
      processVersion: RENEWAL_PROCESS_VERSION,
      observedStepIds: STEP_IDS,
      observedSubstepIds: SUBSTEP_IDS,
      branchOrBlockerExplained: true,
      transitionEvidenceExplained: true,
    },
    numberEvidence: {
      knownDiscrepancyFields: [],
      raisedDiscrepancyFields: [],
      sourceFactsMatchOrRaised: true,
      contractualBaseRentVerified: true,
      recurringChargesSeparated: true,
      rentCastRadiusMiles: 2,
      rentCastRequestedCount: 15,
      providerOrderPreserved: true,
      hiddenSelectionApplied: false,
      providerEvidenceAttributed: true,
      humanDecisionRecordedSeparately: true,
      providerSetOfferedRent: false,
    },
    safety: {
      previewWithoutConfirmationObserved: true,
      appDraftCreateCount: 0,
      appClientSendCount: 0,
      rentvineWriteReceiptCount: 0,
      sheetWriteReceiptCount: 0,
      dotloopWriteReceiptCount: 0,
    },
  };
}

function fixtureBaseline(): TestSetBaseline {
  return {
    leaseId: "fixture-lease-a",
    sheetRowNumber: 101,
    rentvineFacts: {
      leaseId: "fixture-lease-a",
      leaseEnd: "2030-01-31",
      currentRent: 1000,
      tenantCount: 1,
      addressLabel: "fixture address",
      portfolioId: null,
    },
    sheetRow: { current_rent: "$1,100.00" },
    hash: "a".repeat(64),
    capturedAt: "2030-01-01T00:00:00.000Z",
    capturedByUid: "fixture-managed-operator",
  };
}

describe("S63 dual operational verdict", () => {
  it("passes process, numbers/evidence, and read-only safety independently", () => {
    expect(S63_RENTCAST_RADIUS_MILES).toBe(2);
    expect(S63_RENTCAST_REQUESTED_COUNT).toBe(15);
    const verdict = evaluateTestSetVerdict(passingInput());
    expect(verdict.criteria).toMatchObject({
      process: { status: "pass" },
      numberEvidence: { status: "pass" },
      safety: { status: "pass" },
    });
    expect(verdict.overall).toBe("pass");
  });

  it("does not let a passing family hide a missing or failed family", () => {
    const missingProcess = passingInput();
    missingProcess.process.observedSubstepIds = null;
    const incomplete = evaluateTestSetVerdict(missingProcess);
    expect(incomplete.criteria.process.status).toBe("not_evaluated");
    expect(incomplete.criteria.numberEvidence.status).toBe("pass");
    expect(incomplete.criteria.safety.status).toBe("pass");
    expect(incomplete.overall).toBe("incomplete");

    const wrongPolicy = passingInput();
    wrongPolicy.numberEvidence.rentCastRadiusMiles = 3;
    wrongPolicy.numberEvidence.rentCastRequestedCount = 10;
    const failed = evaluateTestSetVerdict(wrongPolicy);
    expect(failed.criteria.numberEvidence.status).toBe("fail");
    expect(failed.overall).toBe("fail");
  });

  it("fails missing six-step/substep coverage, hidden selection, offer mutation, or any effect count", () => {
    const missingStep = passingInput();
    missingStep.process.observedStepIds = STEP_IDS.slice(1);
    expect(evaluateTestSetVerdict(missingStep).criteria.process.status).toBe("fail");

    const hiddenSelection = passingInput();
    hiddenSelection.numberEvidence.hiddenSelectionApplied = true;
    hiddenSelection.numberEvidence.providerSetOfferedRent = true;
    expect(evaluateTestSetVerdict(hiddenSelection).criteria.numberEvidence.status).toBe(
      "fail",
    );

    const effect = passingInput();
    effect.safety.appDraftCreateCount = 1;
    expect(evaluateTestSetVerdict(effect).criteria.safety.status).toBe("fail");
  });

  it("derives the three families only from explicit append-only observation entries", () => {
    expect(TEST_SET_EVIDENCE_KINDS).toEqual(
      expect.arrayContaining([
        "process_observation",
        "number_evidence_observation",
        "safety_observation",
      ]),
    );
    const baseline = fixtureBaseline();
    const input = verdictInputFromRecords({
      baseline,
      entries: [
        {
          kind: "discrepancy_raised",
          payload: { field: "current_rent", baselineHash: baseline.hash },
        },
        {
          kind: "process_observation",
          payload: { ...passingInput().process, baselineHash: baseline.hash },
        },
        {
          kind: "number_evidence_observation",
          payload: {
            ...passingInput().numberEvidence,
            baselineHash: baseline.hash,
          },
        },
        {
          kind: "safety_observation",
          payload: { ...passingInput().safety, baselineHash: baseline.hash },
        },
      ],
    });
    const verdict = evaluateTestSetVerdict(input);
    expect(verdict.criteria.process.status).toBe("pass");
    expect(verdict.criteria.numberEvidence.status).toBe("pass");
    expect(verdict.criteria.safety.status).toBe("pass");
  });

  it("keeps absent observations and unraised source conflicts explicit", () => {
    const baseline = fixtureBaseline();
    const absent = evaluateTestSetVerdict(
      verdictInputFromRecords({ baseline, entries: [] }),
    );
    expect(absent.criteria.process.status).toBe("not_evaluated");
    expect(absent.criteria.numberEvidence.status).toBe("not_evaluated");
    expect(absent.criteria.safety.status).toBe("not_evaluated");
    expect(absent.overall).toBe("incomplete");

    const unraised = passingInput();
    unraised.numberEvidence.knownDiscrepancyFields = ["current_rent"];
    unraised.numberEvidence.raisedDiscrepancyFields = [];
    expect(evaluateTestSetVerdict(unraised).criteria.numberEvidence.status).toBe("fail");
  });
});
