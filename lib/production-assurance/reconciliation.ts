import type {
  ReconciliationAssuranceEvidence,
  ReconciliationCounts,
  SourceDriftState,
  SourceReadState,
} from "./types";

export interface ReconciliationObservation {
  readonly rentvine: SourceReadState;
  readonly sheet: SourceReadState;
  readonly application: SourceReadState;
  readonly sourceDrift: SourceDriftState;
  readonly counts: ReconciliationCounts;
}

const COUNT_KEYS = [
  "sourceRecords",
  "projectedRecords",
  "renderedRecords",
  "missingInApplication",
  "unexpectedInApplication",
  "duplicateApplicationKeys",
  "fieldMismatches",
  "invalidDestinations",
] as const satisfies readonly (keyof ReconciliationCounts)[];

const MISMATCH_KEYS = [
  "missingInApplication",
  "unexpectedInApplication",
  "duplicateApplicationKeys",
  "fieldMismatches",
  "invalidDestinations",
] as const satisfies readonly (keyof ReconciliationCounts)[];

export function evaluateReconciliation(
  observation: ReconciliationObservation,
): ReconciliationAssuranceEvidence {
  validateCounts(observation.counts);

  if (observation.sourceDrift === "changed") {
    return { ...observation, state: "inconclusive_source_changed" };
  }
  if (
    observation.sourceDrift === "unknown" ||
    observation.rentvine !== "complete" ||
    observation.sheet !== "complete" ||
    observation.application !== "complete"
  ) {
    return { ...observation, state: "inconclusive_source_unavailable" };
  }

  const mismatch =
    observation.counts.sourceRecords !== observation.counts.projectedRecords ||
    observation.counts.projectedRecords !== observation.counts.renderedRecords ||
    MISMATCH_KEYS.some((key) => observation.counts[key] > 0);
  return { ...observation, state: mismatch ? "mismatch" : "matched" };
}

export function emptyReconciliationCounts(): ReconciliationCounts {
  return {
    sourceRecords: 0,
    projectedRecords: 0,
    renderedRecords: 0,
    missingInApplication: 0,
    unexpectedInApplication: 0,
    duplicateApplicationKeys: 0,
    fieldMismatches: 0,
    invalidDestinations: 0,
  };
}

function validateCounts(counts: ReconciliationCounts): void {
  for (const key of COUNT_KEYS) {
    if (!Number.isSafeInteger(counts[key]) || counts[key] < 0) {
      throw new Error(`Invalid reconciliation count for ${key}.`);
    }
  }
}
