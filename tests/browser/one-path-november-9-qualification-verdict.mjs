const CASES = [
  "N09-01",
  "N09-02",
  "N09-03",
  "N09-04",
  "N09-05",
  "N09-06",
  "N09-07",
  "N09-08",
  "N09-09-Admin",
  "N09-09-Approver",
  "N09-09-Editor",
  "N09-10",
];

const required = {
  "N09-01": ["oneTable", "narrowTable", "savedViewRetained", "sharedExactReturn"],
  "N09-02": [
    "legacyRefused",
    "interruptedResponseRecovered",
    "deliberateContinuation",
    "changedCycleRefused",
    "reuseAtAllowance",
  ],
  "N09-03": [
    "exactEditorReturn",
    "newerRentPreserved",
    "concurrentClearPreserved",
    "explicitRefillUsedSavedEvidence",
    "staleSaveRefused",
    "noEvidenceStayedEmpty",
    "sourceDiscrepancyWorkingFix",
  ],
  "N09-04": [
    "savedNote",
    "collapsedHistory",
    "earlierCycleAnnotation",
    "derivedStagePreserved",
    "fullToggle",
    "legacyTarget",
    "verifiedProviderHandoffAndReturn",
  ],
  "N09-05": [
    "covered",
    "singleOwner",
    "leaseOverridePreservedPortfolio",
    "unrelatedLeasePreserved",
    "expiredCoverageHeld",
    "conflictingRentHeld",
    "approvalPreserved",
  ],
  "N09-06": [
    "firstUse",
    "savedBlank",
    "filledReadback",
    "isolatedSenders",
    "priorWordingHeld",
    "exactResponsibleSenderBytes",
  ],
  "N09-07": [
    "scheduledCancellationWithoutSend",
    "concurrentConfirmAndWorker",
    "ambiguousHeldAndReconciled",
    "twoViewReconciliation",
    "twoViewWaiting",
    "twoViewReplyDecision",
    "verifiedHumanReplyPaused",
    "automaticReplyPreservedSchedule",
    "unavailableReadHeld",
    "bouncePaused",
    "expiredResumeRefused",
    "separatelyRecordedTenantDecision",
    "exactResponsibleSenderBytes",
  ],
  "N09-08": [
    "recordedTenantDecision",
    "independentDocumentsAndCompletion",
    "completedDeskDisposition",
    "nonRenewalHandoff",
    "unboundPreviewRefused",
    "exactDocumentEvaluationReadback",
    "unavailableSourceRetainedIndependentWork",
  ],
  "N09-09": [
    "adminHelp",
    "stableGuide",
    "printControlsHidden",
    "narrowAdminHelp",
    "linkedScreenAndControl",
  ],
  "N09-10": [
    "delayedSaveReadback",
    "refusedSavePreservedAndRetried",
    "reconciliationTakesPriority",
    "readOnlyEvidenceAndExactRefusals",
    "actualReplyDecisionSeparation",
    "waitingAndDecisionInBothViews",
  ],
};

function hasDeskDisposition(entry) {
  return Boolean(entry?.stage && entry?.next);
}

function hasCaseReadback({ id, role, observed }, source, compiledMail, servedHelp) {
  const help = id.startsWith("N09-09-");
  if (!required[help ? "N09-09" : id]?.every((key) => observed[key] === true)) {
    return false;
  }
  if (help) {
    // November 10: the served commit's own Help version, scene count and control count (read
    // from its worktree), so a later Help release is checked against its own inventory.
    return (
      role === id.slice("N09-09-".length) &&
      observed.protectedSpaceRequest === (role === "Admin" ? "read" : "denied") &&
      observed.helpSource === source &&
      /^[a-f0-9]{64}$/.test(observed.helpSourceManifest) &&
      /^V[1-9]\d*\.\d+$/.test(String(servedHelp?.version)) &&
      observed.helpVersion === servedHelp.version &&
      servedHelp.scenes > 0 &&
      servedHelp.controls > 0 &&
      observed.matchedScenes === servedHelp.scenes &&
      observed.checkedControls === servedHelp.controls &&
      observed.missingRequiredControls === 0 &&
      observed.rejectedDrift === "Work status" &&
      Boolean(observed.canonicalRun && observed.driftRun)
    );
  }
  switch (id) {
    case "N09-01":
      return (
        ["scheduled", "waiting", "unconfirmed"].every((key) =>
          hasDeskDisposition(observed[key]),
        ) &&
        observed.crossCase === "N09-07" &&
        Boolean(observed.exactReturn && observed.linkedWorkStage && observed.currentStep)
      );
    case "N09-02":
      return (
        observed.eligible > 0 &&
        observed.capStops === observed.eligible &&
        observed.draftReadbacks?.length === observed.eligible &&
        new Set(observed.draftReadbacks.map(({ leaseId }) => leaseId)).size ===
          observed.eligible
      );
    case "N09-03":
      return observed.savedRevision > 0;
    case "N09-04":
      return observed.stickyOutcomes === 7 && observed.conditionalPaths?.length === 2;
    case "N09-05":
      return (
        observed.staleStatus === 409 &&
        observed.portfolioRevisions?.length === 3 &&
        observed.restoredAgreementAmount > 0
      );
    case "N09-06":
      return observed.explicitTakeoverRevision > 0 && observed.crossCase === "N09-07";
    case "N09-07":
      return (
        compiledMail !== null &&
        observed.initialSends === 1 &&
        observed.followUpSends === 1 &&
        observed.exactReceipts === 2 &&
        observed.freshResumeRevision > 0
      );
    case "N09-08":
      return (
        compiledMail !== null && /^[a-f0-9]{64}$/.test(observed.governedRentVinePreview)
      );
    case "N09-10":
      return (
        observed.checkedOutcomes >= 28 &&
        observed.renderedNegativeControlsRejected === 5 &&
        observed.crossCase === "N09-07"
      );
    default:
      return false;
  }
}

export function novemberNineMatrixVerdict({
  run,
  rehearsal,
  compiled,
  results,
  networkRefusals,
  tenantSendProof,
  servedHelp = null,
}) {
  const source = rehearsal.servedVersion;
  const compiledMail = rehearsal.compiledMail ?? null;
  const adapterBound =
    JSON.stringify(compiledMail) === JSON.stringify(compiled?.compiledMail ?? null) &&
    (compiledMail === null ||
      ["adapter", "worker", "sourcePreview", "nextConfig", "isolatedNextConfig"].every(
        (key) => /^[a-f0-9]{64}$/.test(compiledMail[key] ?? ""),
      ));
  const exact =
    !rehearsal.overlay &&
    !run.harness_uncommitted &&
    run.served_sha === source &&
    run.harness_sha === source &&
    rehearsal.servedCommit === source &&
    adapterBound &&
    (rehearsal.compiled
      ? compiled?.source === source && Boolean(compiled.buildId)
      : tenantSendProof && compiledMail === null);
  const expected = tenantSendProof ? ["N09-07"] : CASES;
  const actual = results.map(({ id }) => id).sort();
  const completeMatrix = JSON.stringify(actual) === JSON.stringify(expected);
  const unsupported = results.some((row) => {
    const { verdict, observed } = row;
    if ("human" in row || (observed && "human" in observed)) return true;
    if (verdict === "UNVERIFIED") return false;
    return (
      verdict !== "Yes" ||
      !observed ||
      !Object.keys(observed).length ||
      Boolean(observed.missing) ||
      (!tenantSendProof && !hasCaseReadback(row, source, compiledMail, servedHelp))
    );
  });
  const rejected = !exact || !completeMatrix || networkRefusals.length > 0 || unsupported;
  // This is the matrix verdict. The independent Help, verification and delivery gates
  // have their own evidence and cannot become green from browser observations alone.
  const verdict = rejected
    ? "No"
    : results.every((row) => row.verdict === "Yes")
      ? "Yes"
      : "UNVERIFIED";
  return {
    source,
    compiled: rehearsal.compiled,
    buildId: compiled?.buildId ?? null,
    compiledMail,
    networkRefusals: networkRefusals.length,
    exact,
    completeMatrix,
    fixture: "November 5 mix",
    human: "NOT RUN",
    verdict,
    journeys: results,
  };
}
