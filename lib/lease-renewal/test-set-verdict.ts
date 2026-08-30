// S63 dual operational verdict. Process behavior, number/evidence truth, and the read-only safety
// boundary are evaluated independently. Missing observations remain `not_evaluated`; one passing
// family can never mask a missing or failed family.

import type { TestSetBaseline } from "@/lib/firestore/test-set-baseline";
import {
  RENEWAL_PROCESS_DEFINITION,
  RENEWAL_PROCESS_VERSION,
} from "@/lib/lease-renewal/renewal-process";

export const S63_RENTCAST_RADIUS_MILES = 2;
export const S63_RENTCAST_REQUESTED_COUNT = 15;

export type CriterionStatus = "pass" | "fail" | "not_evaluated";

export interface CriterionOutcome {
  status: CriterionStatus;
  /** Required for every outcome so the report never asserts a bare result. */
  reason: string;
}

export interface TestSetVerdict {
  criteria: {
    process: CriterionOutcome;
    numberEvidence: CriterionOutcome;
    safety: CriterionOutcome;
  };
  /** `pass` only when all three independent families pass. */
  overall: "pass" | "fail" | "incomplete";
}

export interface TestSetVerdictInput {
  process: {
    processVersion: string | null;
    observedStepIds: readonly string[] | null;
    observedSubstepIds: readonly string[] | null;
    branchOrBlockerExplained: boolean | null;
    transitionEvidenceExplained: boolean | null;
  };
  numberEvidence: {
    knownDiscrepancyFields: readonly string[];
    raisedDiscrepancyFields: readonly string[];
    sourceFactsMatchOrRaised: boolean | null;
    contractualBaseRentVerified: boolean | null;
    recurringChargesSeparated: boolean | null;
    rentCastRadiusMiles: number | null;
    rentCastRequestedCount: number | null;
    providerOrderPreserved: boolean | null;
    hiddenSelectionApplied: boolean | null;
    providerEvidenceAttributed: boolean | null;
    humanDecisionRecordedSeparately: boolean | null;
    providerSetOfferedRent: boolean | null;
  };
  safety: {
    previewWithoutConfirmationObserved: boolean | null;
    appDraftCreateCount: number | null;
    appClientSendCount: number | null;
    rentvineWriteReceiptCount: number | null;
    sheetWriteReceiptCount: number | null;
    dotloopWriteReceiptCount: number | null;
  };
}

const EXPECTED_STEP_IDS = RENEWAL_PROCESS_DEFINITION.steps.map((step) => step.id);
const EXPECTED_SUBSTEP_IDS = RENEWAL_PROCESS_DEFINITION.steps.flatMap((step) =>
  step.substeps.map((substep) => substep.id),
);

function sameUniqueSet(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    new Set(actual).size === actual.length &&
    actual.length === expected.length &&
    expected.every((value) => actual.includes(value))
  );
}

function processOutcome(input: TestSetVerdictInput["process"]): CriterionOutcome {
  const missing: string[] = [];
  if (input.processVersion === null) missing.push("process version");
  if (input.observedStepIds === null) missing.push("six-step projection");
  if (input.observedSubstepIds === null) missing.push("substep projection");
  if (input.branchOrBlockerExplained === null) missing.push("branch or blocker");
  if (input.transitionEvidenceExplained === null) {
    missing.push("transition evidence");
  }
  if (missing.length > 0) {
    return {
      status: "not_evaluated",
      reason: `Not yet observed: ${missing.join(", ")}. Missing process evidence never reads as success.`,
    };
  }

  const failed: string[] = [];
  if (input.processVersion !== RENEWAL_PROCESS_VERSION) {
    failed.push("the process version is not renewal-v1");
  }
  if (!sameUniqueSet(input.observedStepIds ?? [], EXPECTED_STEP_IDS)) {
    failed.push(
      "the exact six-step projection is incomplete or contains an unknown step",
    );
  }
  if (!sameUniqueSet(input.observedSubstepIds ?? [], EXPECTED_SUBSTEP_IDS)) {
    failed.push(
      "the detailed substep projection is incomplete or contains an unknown substep",
    );
  }
  if (input.branchOrBlockerExplained !== true) {
    failed.push("the current branch or blocker is not explained");
  }
  if (input.transitionEvidenceExplained !== true) {
    failed.push("the evidence permitting or preventing transitions is not explained");
  }
  if (failed.length > 0) {
    return { status: "fail", reason: `Failed process checks: ${failed.join("; ")}.` };
  }
  return {
    status: "pass",
    reason: `The renewal-v1 projection exposes all ${EXPECTED_STEP_IDS.length} steps and ${EXPECTED_SUBSTEP_IDS.length} substeps with the current branch/blocker and transition evidence explained.`,
  };
}

function numberEvidenceOutcome(
  input: TestSetVerdictInput["numberEvidence"],
): CriterionOutcome {
  const checks: ReadonlyArray<readonly [string, boolean | number | null]> = [
    ["source facts matched or were raised", input.sourceFactsMatchOrRaised],
    ["contractual base rent verified", input.contractualBaseRentVerified],
    ["recurring charges separated", input.recurringChargesSeparated],
    ["RentCast radius observed", input.rentCastRadiusMiles],
    ["RentCast requested count observed", input.rentCastRequestedCount],
    ["provider order preserved", input.providerOrderPreserved],
    ["hidden selection state observed", input.hiddenSelectionApplied],
    ["provider evidence attributed", input.providerEvidenceAttributed],
    ["human decision separated", input.humanDecisionRecordedSeparately],
    ["offer mutation state observed", input.providerSetOfferedRent],
  ];
  const missing = checks.filter(([, value]) => value === null).map(([name]) => name);
  if (missing.length > 0) {
    return {
      status: "not_evaluated",
      reason: `Not yet observed: ${missing.join(", ")}. Missing number/evidence input never reads as success.`,
    };
  }

  const unraised = input.knownDiscrepancyFields.filter(
    (field) => !input.raisedDiscrepancyFields.includes(field),
  );
  if (unraised.length > 0) {
    return {
      status: "fail",
      reason: `Source disagreement was not raised: ${unraised.join(", ")}.`,
    };
  }

  const failed: string[] = [];
  if (input.sourceFactsMatchOrRaised !== true) {
    failed.push("source facts neither matched nor carried an exact raised discrepancy");
  }
  if (input.contractualBaseRentVerified !== true) {
    failed.push("contractual base rent was not verified");
  }
  if (input.recurringChargesSeparated !== true) {
    failed.push("recurring charges were not kept separate");
  }
  if (input.rentCastRadiusMiles !== S63_RENTCAST_RADIUS_MILES) {
    failed.push(
      `RentCast did not use the approved ${S63_RENTCAST_RADIUS_MILES}-mile radius`,
    );
  }
  if (input.rentCastRequestedCount !== S63_RENTCAST_REQUESTED_COUNT) {
    failed.push(
      `RentCast did not request the approved ${S63_RENTCAST_REQUESTED_COUNT} comparables`,
    );
  }
  if (input.providerOrderPreserved !== true) {
    failed.push("provider order was not preserved");
  }
  if (input.hiddenSelectionApplied !== false) {
    failed.push("a hidden selection or freshness filter was applied");
  }
  if (input.providerEvidenceAttributed !== true) {
    failed.push("provider reference evidence was not attributed");
  }
  if (input.humanDecisionRecordedSeparately !== true) {
    failed.push("the human decision was not recorded separately");
  }
  if (input.providerSetOfferedRent !== false) {
    failed.push("provider evidence populated or changed offered rent");
  }
  if (failed.length > 0) {
    return {
      status: "fail",
      reason: `Failed number/evidence checks: ${failed.join("; ")}.`,
    };
  }

  return {
    status: "pass",
    reason:
      "Contractual base rent and recurring charges remain separate; the two-mile/15-request reference query preserves provider order and attribution; the human decision remains separate from provider evidence.",
  };
}

function effectCount(value: number | null): boolean {
  return value !== null && Number.isInteger(value) && value >= 0;
}

function safetyOutcome(input: TestSetVerdictInput["safety"]): CriterionOutcome {
  const counts = [
    input.appDraftCreateCount,
    input.appClientSendCount,
    input.rentvineWriteReceiptCount,
    input.sheetWriteReceiptCount,
    input.dotloopWriteReceiptCount,
  ];
  if (
    input.previewWithoutConfirmationObserved === null ||
    counts.some((count) => !effectCount(count))
  ) {
    return {
      status: "not_evaluated",
      reason:
        "Preview/refusal or effect-count evidence is missing. The report cannot infer a zero from an absent observation.",
    };
  }
  if (
    input.previewWithoutConfirmationObserved !== true ||
    counts.some((count) => count !== 0)
  ) {
    return {
      status: "fail",
      reason:
        "The proof did not remain preview-only, or an app draft/send or RentVine/Sheet/Dotloop write receipt was observed.",
    };
  }
  return {
    status: "pass",
    reason:
      "Preview/refusal behavior was observed without confirmation; app draft/send and RentVine/Sheet/Dotloop write-receipt counts were explicitly observed as zero.",
  };
}

export function evaluateTestSetVerdict(input: TestSetVerdictInput): TestSetVerdict {
  const process = processOutcome(input.process);
  const numberEvidence = numberEvidenceOutcome(input.numberEvidence);
  const safety = safetyOutcome(input.safety);
  const all = [process, numberEvidence, safety];
  return {
    criteria: { process, numberEvidence, safety },
    overall: all.every((criterion) => criterion.status === "pass")
      ? "pass"
      : all.some((criterion) => criterion.status === "fail")
        ? "fail"
        : "incomplete",
  };
}

/** Source disagreements derivable from the immutable baseline itself. */
export function deriveBaselineDiscrepancies(baseline: TestSetBaseline): string[] {
  const fields: string[] = [];
  const sheetRent = parseSheetCurrency(baseline.sheetRow.current_rent);
  const providerRent = baseline.rentvineFacts.currentRent;
  if (
    sheetRent !== null &&
    typeof providerRent === "number" &&
    Math.abs(providerRent - sheetRent) > 0.005
  ) {
    fields.push("current_rent");
  }
  return fields;
}

export function parseSheetCurrency(raw: string | undefined): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function latestPayload(
  entries: ReadonlyArray<{ kind: string; payload: Record<string, unknown> }>,
  kind: string,
): Record<string, unknown> | null {
  return [...entries].reverse().find((entry) => entry.kind === kind)?.payload ?? null;
}

function booleanValue(
  payload: Record<string, unknown> | null,
  key: string,
): boolean | null {
  const value = payload?.[key];
  return typeof value === "boolean" ? value : null;
}

function numberValue(
  payload: Record<string, unknown> | null,
  key: string,
): number | null {
  const value = payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(
  payload: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function stringArray(
  payload: Record<string, unknown> | null,
  key: string,
): readonly string[] | null {
  const value = payload?.[key];
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : null;
}

/** Build the dual verdict input only from a frozen baseline plus append-only observations. */
export function verdictInputFromRecords(input: {
  baseline: TestSetBaseline | null;
  entries: ReadonlyArray<{ kind: string; payload: Record<string, unknown> }>;
}): TestSetVerdictInput {
  const eligibleEntries = input.baseline
    ? input.entries.filter((entry) => entry.payload.baselineHash === input.baseline?.hash)
    : [];
  const process = latestPayload(eligibleEntries, "process_observation");
  const numberEvidence = latestPayload(eligibleEntries, "number_evidence_observation");
  const safety = latestPayload(eligibleEntries, "safety_observation");
  const raisedFields = eligibleEntries
    .filter((entry) => entry.kind === "discrepancy_raised")
    .map((entry) => entry.payload.field)
    .filter((field): field is string => typeof field === "string");
  const hasBaseline = input.baseline !== null;

  return {
    process: {
      processVersion: hasBaseline ? stringValue(process, "processVersion") : null,
      observedStepIds: hasBaseline ? stringArray(process, "observedStepIds") : null,
      observedSubstepIds: hasBaseline ? stringArray(process, "observedSubstepIds") : null,
      branchOrBlockerExplained: hasBaseline
        ? booleanValue(process, "branchOrBlockerExplained")
        : null,
      transitionEvidenceExplained: hasBaseline
        ? booleanValue(process, "transitionEvidenceExplained")
        : null,
    },
    numberEvidence: {
      knownDiscrepancyFields: input.baseline
        ? deriveBaselineDiscrepancies(input.baseline)
        : [],
      raisedDiscrepancyFields: raisedFields,
      sourceFactsMatchOrRaised: hasBaseline
        ? booleanValue(numberEvidence, "sourceFactsMatchOrRaised")
        : null,
      contractualBaseRentVerified: hasBaseline
        ? booleanValue(numberEvidence, "contractualBaseRentVerified")
        : null,
      recurringChargesSeparated: hasBaseline
        ? booleanValue(numberEvidence, "recurringChargesSeparated")
        : null,
      rentCastRadiusMiles: hasBaseline
        ? numberValue(numberEvidence, "rentCastRadiusMiles")
        : null,
      rentCastRequestedCount: hasBaseline
        ? numberValue(numberEvidence, "rentCastRequestedCount")
        : null,
      providerOrderPreserved: hasBaseline
        ? booleanValue(numberEvidence, "providerOrderPreserved")
        : null,
      hiddenSelectionApplied: hasBaseline
        ? booleanValue(numberEvidence, "hiddenSelectionApplied")
        : null,
      providerEvidenceAttributed: hasBaseline
        ? booleanValue(numberEvidence, "providerEvidenceAttributed")
        : null,
      humanDecisionRecordedSeparately: hasBaseline
        ? booleanValue(numberEvidence, "humanDecisionRecordedSeparately")
        : null,
      providerSetOfferedRent: hasBaseline
        ? booleanValue(numberEvidence, "providerSetOfferedRent")
        : null,
    },
    safety: {
      previewWithoutConfirmationObserved: booleanValue(
        safety,
        "previewWithoutConfirmationObserved",
      ),
      appDraftCreateCount: numberValue(safety, "appDraftCreateCount"),
      appClientSendCount: numberValue(safety, "appClientSendCount"),
      rentvineWriteReceiptCount: numberValue(safety, "rentvineWriteReceiptCount"),
      sheetWriteReceiptCount: numberValue(safety, "sheetWriteReceiptCount"),
      dotloopWriteReceiptCount: numberValue(safety, "dotloopWriteReceiptCount"),
    },
  };
}
