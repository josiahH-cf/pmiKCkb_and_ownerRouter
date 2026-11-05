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
  /**
   * S248: rendered rows that state their renewal message evidence could not be read. They were
   * compared under the staff record alone; any such row keeps the run from matching.
   */
  options: { readonly evidenceUnavailableRows?: number } = {},
): ReconciliationAssuranceEvidence {
  validateCounts(observation.counts);
  const evidenceUnavailableRows = options.evidenceUnavailableRows ?? 0;
  if (!Number.isSafeInteger(evidenceUnavailableRows) || evidenceUnavailableRows < 0)
    throw new Error("Invalid reconciliation count for evidenceUnavailableRows.");

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
  if (mismatch) return { ...observation, state: "mismatch" };
  return {
    ...observation,
    state: evidenceUnavailableRows > 0 ? "inconclusive_evidence_unavailable" : "matched",
  };
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
