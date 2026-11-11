// S271 ARCH-S271-1, ARCH-S271-3, ARCH-S271-7 and ARCH-S271-8: the versioned November 10 matrix
// and its verdicts. Browser, backend and adapter results bind to one source and build. Human,
// model and real source or effect evidence stay separate. A report missing evidence cannot qualify.

// .2: N10-04 also reads back the charge-only next step and the held source update (BEH-S264-6).
export const MATRIX_VERSION = "S271-2026-11-10.2";

// N10-06 is the Friday human read-through. It is recorded by humanReviewVerdict, never here.
export const ENGINEERING_CASES = [
  "N10-01",
  "N10-02",
  "N10-03",
  "N10-04",
  "N10-05",
  "N10-07",
  "N10-08",
  "N10-09",
  "N10-10",
];

export const THURSDAY_CASES = ["N10-01", "N10-02", "N10-03", "N10-04", "N10-05"];

// Each observed key is a required readback. The cross-surface cases in S271 are part of the
// journeys that name them, so their keys sit in those journeys.
export const REQUIRED_OBSERVATIONS = {
  "N10-01": [
    "baseAndPetSeparate",
    "correctionUsedOrRefused",
    "savedComparisonResumed",
    "ownerDraftResumed",
    "ownerCopyOnBase",
    "exactReadback",
    "noNewLookupOnOpen",
    "priorCycleRefusedAsCurrent",
  ],
  "N10-02": [
    "differentApprovedBaseRecorded",
    "amountOnlyCoverage",
    "previousRecommendationPreserved",
    "tenantPreparationUsesApprovedBase",
    "concurrentEditRefused",
    "uncertainSendReconciledFirst",
    "sameCycleRestorePreserved",
    "legacyBoundUsable",
    "legacyUnboundNeedsConfirmation",
    "latePriorCycleSaveRefused",
    "adoptionAgainstChangedProposalRefused",
  ],
  "N10-03": [
    "nextDayChoiceFromVerifiedEnd",
    "noStoredDurationManualEnd",
    "invalidRangeRefused",
    "returnToTenantOffer",
    "workingAndSourceDatesDistinct",
    "sourceDisagreementHeld",
    "resolvedEndConsistent",
    "scheduledRecheckRefused",
  ],
  "N10-04": [
    "adminMappingSavedAndReread",
    "twoDistinctLinesSameFamily",
    "permittedCaseFeeSelected",
    "endedAndUnknownDeclined",
    "exactSeparateTotals",
    "changedVersusUnchangedCopy",
    "incompleteSelectionStopped",
    "duplicateSourceRefused",
    "staleMappingRefusedAtClaim",
    "sameValueDriftRefused",
    "decisionsDoNotCoverChangedCharge",
    "chargeOnlyNextStepShown",
    "chargeOnlySourceUpdateHeld",
    "materialTransitionBranches",
  ],
  "N10-05": [
    "changedRbpFlyerRequired",
    "insuranceTransitionFlyerRequired",
    "optionalFormSafeOmission",
    "pendingLinksShown",
    "evidenceBoundExactReview",
    "draftSendScheduledProofRechecked",
    "sameUrlProofChangeRefused",
    "omittedResourceChangeIgnored",
    "wrongRecipientRefused",
    "legacyAuthorizationHeld",
    "uncertainAttemptReconciledWithoutSend",
  ],
  "N10-07": [
    "sevenOutcomesEvidenceClosed",
    "fiveFullSections",
    "variantBranches",
    "activeFieldFirst",
    "continuityThroughSwitchAndReturn",
    "staleOrFailedSaveKept",
    "bothThemesAndWidths",
    "supportedRoles",
  ],
  "N10-08": [
    "namedGroupsClosedOnEntry",
    "keyboardAndMouseDisclosure",
    "exactLinkOpensOwner",
    "focusReturnedToSummary",
    "exactReviewContentVisible",
    "zeroEffectEvidence",
    "negativeControlsRejected",
  ],
  "N10-09": [
    "verifiedProgramContactRecorded",
    "absentOrDuplicateVendorPending",
    "traineePrepared",
    "leadInspectedInternally",
    "noAutomaticCc",
    "noGrantedAccess",
    "noInferredProgramFact",
  ],
  "N10-10": [
    "applicableFamilies",
    "syntheticPdfInputs",
    "pendingMapDecisions",
    "protectedFieldsPreserved",
    "bothExactKeyRefusals",
    "manualHandoffAvailable",
    "signedEvidenceSeparate",
    "sharedChargeDiscrepancyHeld",
  ],
};

// The deliberate N09-10-style defects N10-08 must reject (S271 R-S271-4, S270 AC-S270-1).
export const NEGATIVE_CONTROLS = [
  "oldOpenStacks",
  "duplicateEditor",
  "hiddenFix",
  "effectfulEvidence",
  "sendCompetingWithReconciliation",
];

const SHA = /^[a-f0-9]{40}$/;

// AC-S271-1: a fail-first claim must name a baseline probe recorded as fail-first. A passing
// preservation probe relabeled as a new fail-first check is refused.
export function failFirstClaimsHold(result, baseline) {
  const claims = result.failFirst ?? [];
  if (!Array.isArray(claims)) return false;
  return claims.every((check) => {
    const probe = baseline?.results?.find(
      (entry) => entry.id === result.id && entry.check === check,
    );
    return Boolean(probe && /^fail-first\b/.test(String(probe.expectation ?? "")));
  });
}

function caseReadbackHolds(result) {
  const required = REQUIRED_OBSERVATIONS[result.id];
  const observed = result.observed;
  if (!required || !observed) return false;
  if (!required.every((key) => observed[key] === true)) return false;
  switch (result.id) {
    case "N10-04":
      return (
        Number.isInteger(observed.monthlyTotalCents) &&
        Number.isInteger(observed.oneTimeTotalCents) &&
        Number.isInteger(observed.mappingRevision) &&
        observed.mappingRevision > 0
      );
    case "N10-07":
      return observed.checkedOutcomes >= 7 && observed.fullSections === 5;
    case "N10-08":
      return (
        Array.isArray(observed.rejectedNegativeControls) &&
        NEGATIVE_CONTROLS.every((name) =>
          observed.rejectedNegativeControls.includes(name),
        )
      );
    case "N10-10":
      return observed.providerEffects === 0;
    default:
      return true;
  }
}

/**
 * The engineering verdict for one exact build. Thursday checkpoints pass `scope: "thursday"` and
 * cover N10-01 to N10-05 only; the cumulative candidate covers every engineering case.
 */
export function novemberTenMatrixVerdict({
  run,
  rehearsal,
  compiled,
  results,
  networkRefusals,
  baseline,
  scope = "cumulative",
}) {
  const source = rehearsal?.servedVersion ?? null;
  const exact =
    SHA.test(String(source)) &&
    !rehearsal.overlay &&
    !run?.harness_uncommitted &&
    run?.served_sha === source &&
    run?.harness_sha === source &&
    rehearsal.servedCommit === source &&
    Boolean(rehearsal.compiled) &&
    compiled?.source === source &&
    Boolean(compiled?.buildId);
  const expected = scope === "thursday" ? THURSDAY_CASES : ENGINEERING_CASES;
  const actual = (results ?? []).map(({ id }) => id).sort();
  const completeMatrix = JSON.stringify(actual) === JSON.stringify([...expected].sort());
  const mixedBuild = (results ?? []).some(
    (row) =>
      (row.source !== undefined && row.source !== source) ||
      (row.buildId !== undefined && row.buildId !== compiled?.buildId),
  );
  const unsupported = (results ?? []).some((row) => {
    // A model or engineering row never carries a human verdict (ARCH-S271-3).
    if ("human" in row || (row.observed && "human" in row.observed)) return true;
    if (row.verdict === "UNVERIFIED") return false;
    if (row.verdict !== "Yes") return true;
    if (!row.observed || Object.keys(row.observed).length === 0) return true;
    if (row.observed.missing) return true;
    if ((row.observed.attemptedLiveEffects ?? 0) !== 0) return true;
    if (!failFirstClaimsHold(row, baseline)) return true;
    return !caseReadbackHolds(row);
  });
  const rejected =
    !exact ||
    !completeMatrix ||
    mixedBuild ||
    (networkRefusals?.length ?? 0) > 0 ||
    unsupported;
  const verdict = rejected
    ? "No"
    : results.every((row) => row.verdict === "Yes")
      ? "Yes"
      : "UNVERIFIED";
  return {
    matrix: MATRIX_VERSION,
    scope,
    source,
    compiled: Boolean(rehearsal?.compiled),
    buildId: compiled?.buildId ?? null,
    networkRefusals: networkRefusals?.length ?? 0,
    exact,
    completeMatrix,
    mixedBuild,
    fixture: "November 5 mix",
    human: "NOT RUN",
    verdict,
    journeys: results,
  };
}

export const NO_OBSERVER = "NOT RUN — no human observer";

/**
 * AC-S271-3: the Friday read-through. Only an observer-bound record with per-scenario results can
 * say anything other than NOT RUN. A model check, an earlier meeting or a private readiness read
 * cannot populate it, and delivery is never assumed from it.
 */
export function humanReviewVerdict(record, { build } = {}) {
  if (!record || record.observer == null) {
    return { verdict: NO_OBSERVER, valid: !record || record.verdict === NO_OBSERVER };
  }
  const { observer, scenarios, verdict } = record;
  const problems = [];
  if (!observer.role) problems.push("observer role missing");
  if (observer.kind && observer.kind !== "human")
    problems.push("observer is not a person");
  if (!record.build || (build && record.build !== build))
    problems.push("review is not bound to the reviewed build");
  if (!Array.isArray(scenarios) || scenarios.length === 0)
    problems.push("no observed scenario recorded");
  for (const scenario of scenarios ?? []) {
    if (!scenario.caseType) problems.push("scenario case type missing");
    if (!["Yes", "No", "Partial", "Not observed"].includes(scenario.result))
      problems.push(
        `scenario result ${String(scenario.result)} is not an observed state`,
      );
    if (scenario.device && scenario.deviceObserved !== true)
      problems.push("device claimed without an actual observation");
    if (scenario.result === "No" && !scenario.issue)
      problems.push("a failed scenario needs its recorded issue");
  }
  if (record.deliveryAssumed) problems.push("delivery cannot be inferred from a review");
  const observed = (scenarios ?? []).filter(
    (scenario) => scenario.result !== "Not observed",
  );
  const derived =
    problems.length > 0
      ? "INVALID"
      : observed.length === 0
        ? NO_OBSERVER
        : observed.every((scenario) => scenario.result === "Yes")
          ? "Yes"
          : observed.some((scenario) => scenario.result === "No")
            ? "No"
            : "Partial";
  return {
    verdict: derived,
    valid: problems.length === 0 && (verdict === undefined || verdict === derived),
    problems,
  };
}

/**
 * AC-S271-7: a cumulative admission package. A missing intake, a core-only checkpoint, stale CI,
 * a mixed build or an unresolved operation is refused. Human NOT RUN and named source-pending
 * effects do not block independently proven engineering.
 */
export const BATCH_INTAKES = [139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149];

export function cumulativePackageVerdict({
  intakes,
  scope,
  qualifiedSource,
  ciSource,
  ciConclusion,
  buildSource,
  unresolvedOperations,
  engineeringVerdict,
}) {
  const problems = [];
  const missing = BATCH_INTAKES.filter((intake) => !(intakes ?? []).includes(intake));
  if (missing.length) problems.push(`missing intakes ${missing.join(", ")}`);
  if (scope !== "cumulative") problems.push("a core-only checkpoint cannot be admitted");
  if (!SHA.test(String(qualifiedSource))) problems.push("qualified source is not exact");
  if (ciSource !== qualifiedSource || ciConclusion !== "success")
    problems.push("exact-main CI is stale or not green");
  if (buildSource !== qualifiedSource) problems.push("mixed build");
  if ((unresolvedOperations ?? []).length) problems.push("an operation is unresolved");
  if (engineeringVerdict !== "Yes") problems.push("cumulative engineering is not Yes");
  return { admissible: problems.length === 0, problems };
}

/**
 * AC-S271-8: Friday triage. Each finding is classified separately, names its owner, destination
 * and affected effect, and binds to the build it was observed on.
 */
export const FINDING_CLASSES = {
  "in-scope-defect": { needs: ["reproduction", "owningCheck", "build"] },
  "source-answer": { needs: ["source", "authority", "destination"] },
  "unverified-suggestion": { needs: ["owner", "evidenceNeeded"] },
  "scope-change": { needs: ["decider", "affectedPath"] },
};

export function classifyFridayFinding(finding, { earlierEvidence = [] } = {}) {
  const rule = FINDING_CLASSES[finding?.kind];
  const problems = [];
  if (!rule) problems.push("unknown finding kind");
  for (const field of ["case", "expected", "observed", "affectedAction", "nextOwner"])
    if (!finding?.[field]) problems.push(`${field} missing`);
  for (const field of rule?.needs ?? [])
    if (!finding?.[field]) problems.push(`${field} missing`);
  if (finding?.kind === "source-answer" && !finding?.authority)
    problems.push("a source answer needs attributable authority");
  // A Friday observation on a different build never replaces earlier evidence.
  const replaces = earlierEvidence.some(
    (entry) => finding?.replaces === entry.id && entry.build !== finding?.build,
  );
  if (replaces) problems.push("a different build cannot replace earlier evidence");
  const disposition =
    problems.length > 0
      ? "invalid"
      : finding.kind === "in-scope-defect"
        ? "verify-on-build"
        : finding.kind === "source-answer"
          ? "route-to-owner"
          : "hold";
  return { kind: finding?.kind ?? null, disposition, problems };
}
