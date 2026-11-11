import { describe, expect, it } from "vitest";
import { outcomeFaults } from "../browser/one-path-november-9-outcome-check.mjs";
import { novemberNineMatrixVerdict } from "../browser/one-path-november-9-qualification-verdict.mjs";

const focused = {
  workAreas: 1,
  evidenceAreas: 1,
  looseControls: 0,
  evidenceOpen: false,
  effectsInEvidence: false,
  duplicateEditors: false,
  visibleCue: true,
  competingSend: false,
  inactive: false,
};

describe("N09-10 rendered outcome contract", () => {
  it("accepts distinct work and closed verification with a visible action", () => {
    expect(outcomeFaults(focused)).toEqual([]);
  });
  it.each([
    [{ workAreas: 0, evidenceAreas: 0, looseControls: 23 }, "unconsolidated"],
    [{ looseControls: 6 }, "unconsolidated"],
    [{ duplicateEditors: true }, "duplicate working rent editor"],
    [{ effectsInEvidence: true }, "effectful evidence"],
    [{ visibleCue: false }, "next action or fix is hidden"],
    [{ competingSend: true }, "send competes with reconciliation"],
    [{ evidenceOpen: true }, "evidence initially open"],
  ])("rejects a reachable Full section with %o", (defect, reason) => {
    expect(outcomeFaults({ ...focused, ...defect })).toContain(reason);
  });
});

describe("S260 exact matrix verdict", () => {
  const source = "a".repeat(40);
  const adapter = {
    adapter: "1".repeat(64),
    worker: "2".repeat(64),
    nextConfig: "3".repeat(64),
    isolatedNextConfig: "4".repeat(64),
    sourcePreview: "5".repeat(64),
  };
  const disposition = { stage: "Recorded stage", next: "Recorded next step" };
  const help = {
    adminHelp: true,
    stableGuide: true,
    printControlsHidden: true,
    narrowAdminHelp: true,
    linkedScreenAndControl: true,
    helpSource: source,
    helpSourceManifest: "b".repeat(64),
    helpVersion: "V3.0",
    matchedScenes: 27,
    checkedControls: 831,
    missingRequiredControls: 0,
    rejectedDrift: "Work status",
    canonicalRun: "canonical",
    driftRun: "drift",
  };
  const reports = {
    "N09-01": {
      oneTable: true,
      narrowTable: true,
      savedViewRetained: true,
      sharedExactReturn: true,
      scheduled: disposition,
      waiting: disposition,
      unconfirmed: disposition,
      crossCase: "N09-07",
      exactReturn: "?group=waiting",
      linkedWorkStage: "Offer to tenant",
      currentStep: "offer-tenant",
    },
    "N09-02": {
      legacyRefused: true,
      interruptedResponseRecovered: true,
      deliberateContinuation: true,
      changedCycleRefused: true,
      reuseAtAllowance: true,
      eligible: 1,
      capStops: 1,
      draftReadbacks: [{ leaseId: "1", revision: 1 }],
    },
    "N09-03": {
      exactEditorReturn: true,
      newerRentPreserved: true,
      concurrentClearPreserved: true,
      explicitRefillUsedSavedEvidence: true,
      staleSaveRefused: true,
      noEvidenceStayedEmpty: true,
      sourceDiscrepancyWorkingFix: true,
      savedRevision: 1,
    },
    "N09-04": {
      savedNote: true,
      collapsedHistory: true,
      earlierCycleAnnotation: true,
      derivedStagePreserved: true,
      fullToggle: true,
      legacyTarget: true,
      verifiedProviderHandoffAndReturn: true,
      stickyOutcomes: 7,
      conditionalPaths: ["housing assistance", "month-to-month"],
    },
    "N09-05": {
      covered: true,
      singleOwner: true,
      leaseOverridePreservedPortfolio: true,
      unrelatedLeasePreserved: true,
      expiredCoverageHeld: true,
      conflictingRentHeld: true,
      approvalPreserved: true,
      staleStatus: 409,
      portfolioRevisions: [1, 2, 3],
      restoredAgreementAmount: 1751,
    },
    "N09-06": {
      firstUse: true,
      savedBlank: true,
      filledReadback: true,
      isolatedSenders: true,
      priorWordingHeld: true,
      exactResponsibleSenderBytes: true,
      explicitTakeoverRevision: 3,
      crossCase: "N09-07",
    },
    "N09-07": {
      scheduledCancellationWithoutSend: true,
      concurrentConfirmAndWorker: true,
      ambiguousHeldAndReconciled: true,
      twoViewReconciliation: true,
      twoViewWaiting: true,
      twoViewReplyDecision: true,
      verifiedHumanReplyPaused: true,
      automaticReplyPreservedSchedule: true,
      unavailableReadHeld: true,
      bouncePaused: true,
      expiredResumeRefused: true,
      separatelyRecordedTenantDecision: true,
      exactResponsibleSenderBytes: true,
      initialSends: 1,
      followUpSends: 1,
      exactReceipts: 2,
      freshResumeRevision: 2,
    },
    "N09-08": {
      recordedTenantDecision: true,
      independentDocumentsAndCompletion: true,
      completedDeskDisposition: true,
      nonRenewalHandoff: true,
      unboundPreviewRefused: true,
      exactDocumentEvaluationReadback: true,
      unavailableSourceRetainedIndependentWork: true,
      governedRentVinePreview: "b".repeat(64),
    },
    "N09-09-Editor": { ...help, protectedSpaceRequest: "denied" },
    "N09-09-Approver": { ...help, protectedSpaceRequest: "denied" },
    "N09-09-Admin": { ...help, protectedSpaceRequest: "read" },
    "N09-10": {
      delayedSaveReadback: true,
      refusedSavePreservedAndRetried: true,
      reconciliationTakesPriority: true,
      readOnlyEvidenceAndExactRefusals: true,
      actualReplyDecisionSeparation: true,
      waitingAndDecisionInBothViews: true,
      checkedOutcomes: 28,
      renderedNegativeControlsRejected: 5,
      crossCase: "N09-07",
    },
  };
  const rows = Object.entries(reports).map(([id, observed]) => ({
    id,
    role: id.split("-")[2] ?? "Editor",
    verdict: "Yes",
    observed,
  }));
  const input = {
    run: { served_sha: source, harness_sha: source },
    rehearsal: {
      servedVersion: source,
      servedCommit: source,
      compiled: true,
      compiledMail: adapter,
    },
    compiled: { source, buildId: "exact-build", compiledMail: adapter },
    results: rows,
    networkRefusals: [],
    tenantSendProof: false,
    servedHelp: { version: "V3.0", scenes: 27, controls: 831 },
  };

  it("records a matrix pass separately from the other gates and human verdict", () => {
    expect(novemberNineMatrixVerdict(input)).toMatchObject({
      source,
      verdict: "Yes",
      completeMatrix: true,
      exact: true,
      human: "NOT RUN",
    });
  });

  it.each([
    { run: { ...input.run, harness_sha: "b".repeat(40) } },
    { compiled: { ...input.compiled, source: "b".repeat(40) } },
    { compiled: { source } },
    { results: rows.slice(1) },
    { results: [...rows.slice(1), rows[1]] },
    { results: [{ ...rows[0], observed: {} }, ...rows.slice(1)] },
    { results: [{ ...rows[0], observed: { readback: true } }, ...rows.slice(1)] },
    { results: [{ ...rows[0], human: "Yes" }, ...rows.slice(1)] },
    {
      results: rows.map((row) =>
        row.id === "N09-09-Admin"
          ? { ...row, observed: { ...row.observed, helpSource: "b".repeat(40) } }
          : row,
      ),
    },
    { results: [{ ...rows[0], observed: { missing: "readback" } }, ...rows.slice(1)] },
    { networkRefusals: [{}] },
    // The Help pins follow the served commit's own inventory and never a missing or other one.
    { servedHelp: null },
    { servedHelp: { version: "V3.0", scenes: 28, controls: 831 } },
    { servedHelp: { version: "V3.0", scenes: 27, controls: 832 } },
    { servedHelp: { version: "V3.1", scenes: 27, controls: 831 } },
    { servedHelp: { version: "V3.0", scenes: 0, controls: 0 } },
  ])("refuses a stale, mixed, missing, duplicate or unsupported report %o", (bad) => {
    expect(novemberNineMatrixVerdict({ ...input, ...bad }).verdict).toBe("No");
  });

  it("requires the compiled synthetic adapter and worker hashes to match the served fixture", () => {
    const rehearsal = input.rehearsal;
    expect(
      novemberNineMatrixVerdict({
        ...input,
        compiled: { source, buildId: "exact-build" },
      }).verdict,
    ).toBe("No");
    expect(
      novemberNineMatrixVerdict({
        ...input,
        rehearsal,
        compiled: {
          ...input.compiled,
          compiledMail: { ...adapter, worker: "5".repeat(64) },
        },
      }).verdict,
    ).toBe("No");
    expect(
      novemberNineMatrixVerdict({
        ...input,
        rehearsal,
        compiled: { ...input.compiled, compiledMail: adapter },
      }).verdict,
    ).toBe("Yes");
  });

  it("follows a later Help release by its own served version, scenes and controls", () => {
    const bumped = { helpVersion: "V3.1", matchedScenes: 30, checkedControls: 900 };
    const results = rows.map((row) =>
      row.id.startsWith("N09-09-")
        ? { ...row, observed: { ...row.observed, ...bumped } }
        : row,
    );
    expect(
      novemberNineMatrixVerdict({
        ...input,
        results,
        servedHelp: { version: "V3.1", scenes: 30, controls: 900 },
      }).verdict,
    ).toBe("Yes");
    expect(novemberNineMatrixVerdict({ ...input, results }).verdict).toBe("No");
  });

  it("keeps a complete exact matrix unverified when a required observation is held", () => {
    const results = [{ ...rows[0], verdict: "UNVERIFIED" }, ...rows.slice(1)];
    expect(novemberNineMatrixVerdict({ ...input, results }).verdict).toBe("UNVERIFIED");
  });
});
