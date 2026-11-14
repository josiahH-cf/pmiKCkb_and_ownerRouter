// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  inspectOutcome,
  outcomeFaults,
} from "../browser/one-path-november-9-outcome-check.mjs";
import {
  novemberNineMatrixVerdict,
  S283_PREPARATION_LEASE_IDS,
} from "../browser/one-path-november-9-qualification-verdict.mjs";

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

// November 10 (S269): Guided names its send entries "Review owner message" and "Review tenant
// offer"; Full keeps "Review and send". The rendered check must still read each as a send that
// competes with reconciliation.
describe("N09-10 rendered send detection", () => {
  let rects;
  beforeEach(() => {
    // jsdom lays nothing out: give every element one box so the inspector reads it as shown.
    rects = vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}]);
  });
  afterEach(() => {
    rects.mockRestore();
    document.body.innerHTML = "";
  });
  const outcome = (state, extra) => {
    document.body.innerHTML = `
      <section data-renewal-outcome="offer-tenant" data-renewal-work-state="${state}">
        <h3>Offer the tenant</h3>
        <div data-renewal-work>
          <button data-renewal-work-primary>Check whether the message went out</button>
          ${extra}
        </div>
        <details data-renewal-verification><summary>Verify tenant offer</summary></details>
      </section>`;
    return inspectOutcome(document.querySelector("section"));
  };

  it("accepts reconciliation as the one action", () => {
    expect(outcomeFaults(outcome("reconcile", ""))).toEqual([]);
  });

  it.each([
    "Review tenant offer",
    "Review owner message",
    "Review and send",
    "Send this message",
    "Schedule",
  ])("rejects %s beside reconciliation", (label) => {
    expect(outcomeFaults(outcome("reconcile", `<button>${label}</button>`))).toContain(
      "send competes with reconciliation",
    );
  });

  it("leaves a send on an outcome that is not reconciling alone", () => {
    expect(outcome("current", "<button>Review tenant offer</button>").competingSend).toBe(
      false,
    );
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
      eligible: 4,
      capStops: 4,
      draftReadbacks: ["9107", "9108", "9109", "9106"].map((leaseId) => ({
        leaseId,
        revision: 1,
      })),
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

  const [firstLease, ...notRunLeaseIds] = S283_PREPARATION_LEASE_IDS;
  const capHalt = {
    targetLeaseIds: S283_PREPARATION_LEASE_IDS,
    request: {
      leaseId: firstLease,
      trigger: "staff",
      month: "2027-01",
      cycleDateIso: "2027-01-31",
    },
    response: {
      http: 200,
      leaseId: firstLease,
      cycleDateIso: "2027-01-31",
      status: "allowance_reached",
      billed: false,
    },
    notRunLeaseIds,
    postedBeforeContinue: [firstLease],
    lookupsBeforeContinue: 0,
    draftsBeforeContinue: 0,
    interruptedLeaseId: firstLease,
    continuedLeaseIds: S283_PREPARATION_LEASE_IDS,
  };
  const currentPreparation = {
    ...reports["N09-02"],
    month: "2027-01",
    eligible: 7,
    capStops: 1,
    capHalt,
    draftReadbacks: S283_PREPARATION_LEASE_IDS.map((leaseId) => ({
      leaseId,
      channel: "owner",
      revision: 1,
      cycleId: "11e8c155-0de2-4a5f-9469-00000000" + leaseId,
    })),
  };
  const preparationRows = (observed) =>
    rows.map((row) => (row.id === "N09-02" ? { ...row, observed } : row));

  it("records a matrix pass separately from the other gates and human verdict", () => {
    expect(novemberNineMatrixVerdict(input)).toMatchObject({
      source,
      verdict: "Yes",
      completeMatrix: true,
      exact: true,
      human: "NOT RUN",
    });
  });

  it("requires the S283 first capped POST, retained leases and all seven exact drafts when requested", () => {
    const currentInput = { ...input, requireS283Preparation: true };
    expect(
      novemberNineMatrixVerdict({
        ...currentInput,
        results: preparationRows(currentPreparation),
      }).verdict,
    ).toBe("Yes");
    expect(novemberNineMatrixVerdict(currentInput).verdict).toBe("No");
    expect(
      novemberNineMatrixVerdict({
        ...input,
        results: preparationRows(currentPreparation),
      }).verdict,
    ).toBe("Yes");
    expect(
      novemberNineMatrixVerdict({
        ...input,
        results: preparationRows({ ...reports["N09-02"], capHalt: undefined }),
      }).verdict,
    ).toBe("No");
  });

  it.each([
    ["cap evidence absent", { capHalt: undefined }],
    ["legacy count substituted", { capStops: 7 }],
    [
      "extra POST before Continue",
      { capHalt: { ...capHalt, postedBeforeContinue: [firstLease, notRunLeaseIds[0]] } },
    ],
    ["lookup at the cap", { capHalt: { ...capHalt, lookupsBeforeContinue: 1 } }],
    ["draft before Continue", { capHalt: { ...capHalt, draftsBeforeContinue: 1 } }],
    [
      "wrong cap response",
      { capHalt: { ...capHalt, response: { ...capHalt.response, billed: true } } },
    ],
    [
      "another cycle's cap response",
      {
        capHalt: {
          ...capHalt,
          response: { ...capHalt.response, cycleDateIso: "2027-02-28" },
        },
      },
    ],
    [
      "wrong not-run lease",
      {
        capHalt: { ...capHalt, notRunLeaseIds: [firstLease, ...notRunLeaseIds.slice(1)] },
      },
    ],
    [
      "Continue skipped a target",
      { capHalt: { ...capHalt, continuedLeaseIds: notRunLeaseIds } },
    ],
    [
      "distinct drafts for the wrong population",
      {
        draftReadbacks: [
          { ...currentPreparation.draftReadbacks[0], leaseId: "9138" },
          ...currentPreparation.draftReadbacks.slice(1),
        ],
      },
    ],
    [
      "duplicate draft",
      {
        draftReadbacks: [
          currentPreparation.draftReadbacks[1],
          ...currentPreparation.draftReadbacks.slice(1),
        ],
      },
    ],
    [
      "missing draft revision",
      {
        draftReadbacks: [
          { ...currentPreparation.draftReadbacks[0], revision: 0 },
          ...currentPreparation.draftReadbacks.slice(1),
        ],
      },
    ],
    [
      "draft for the wrong channel",
      {
        draftReadbacks: [
          { ...currentPreparation.draftReadbacks[0], channel: "tenant" },
          ...currentPreparation.draftReadbacks.slice(1),
        ],
      },
    ],
    [
      "duplicate cycle across two drafts",
      {
        draftReadbacks: [
          {
            ...currentPreparation.draftReadbacks[0],
            cycleId: currentPreparation.draftReadbacks[1].cycleId,
          },
          ...currentPreparation.draftReadbacks.slice(1),
        ],
      },
    ],
  ])("refuses the current preparation report with %s", (_label, bad) => {
    expect(
      novemberNineMatrixVerdict({
        ...input,
        requireS283Preparation: true,
        results: preparationRows({ ...currentPreparation, ...bad }),
      }).verdict,
    ).toBe("No");
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
