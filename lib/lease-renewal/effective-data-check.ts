import type { LeaseRenewalResolutionRecord } from "@/lib/firestore/types";
import type { DeskReconItem } from "@/lib/lease-renewal/desk-model";
import { parseCurrencyInput } from "@/lib/currency-input";
import type {
  ReconciledFieldOutcome,
  RenewalRunResult,
} from "@/lib/lease-renewal/pipeline";

export interface EffectiveDataCheckResolution {
  readonly kind: "pick_source" | "corrected_value" | "flag_incorrect";
  /** Null for a dismissal because no source value was selected. */
  readonly value: string | null;
  /** Null for a dismissal; `corrected_value` for an operator-entered value. */
  readonly source: string | null;
  readonly priorAgreement: Exclude<DeskReconItem["agreement"], "resolved" | "dismissed">;
}

export interface EffectiveDataCheckProjection {
  readonly items: DeskReconItem[];
  readonly resolutionsByField: ReadonlyMap<string, EffectiveDataCheckResolution>;
}

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNoValue(value: unknown): boolean {
  return value === undefined;
}

function versionedFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^rcf1_[a-f0-9]{64}$/.test(value);
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

/**
 * Validate the self-contained shape of a persisted decision before any surface may call it current.
 * Source currency still requires `currentEffectiveDataCheckResolution`, which also compares the
 * record with the exact rendered candidate snapshot.
 */
export function isCompleteLeaseRenewalResolutionRecord(
  record: LeaseRenewalResolutionRecord,
): boolean {
  if (
    !nonBlank(record.id) ||
    !nonBlank(record.source_trigger_key) ||
    !nonBlank(record.run_id) ||
    !nonBlank(record.field_key) ||
    !nonBlank(record.field_label) ||
    !versionedFingerprint(record.candidate_fingerprint) ||
    !nonBlank(record.reason) ||
    !nonBlank(record.resolved_by_uid) ||
    !validTimestamp(record.updated_at)
  ) {
    return false;
  }

  if (record.resolution_kind === "flag_incorrect") {
    return (
      record.status === "Dismissed" &&
      hasNoValue(record.chosen_source) &&
      hasNoValue(record.corrected_value) &&
      hasNoValue(record.proposed_writeback)
    );
  }

  const proposal = record.proposed_writeback;
  if (
    record.status !== "Resolved" ||
    !proposal ||
    proposal.field_key !== record.field_key ||
    !nonBlank(proposal.value) ||
    !nonBlank(proposal.source_of_value) ||
    proposal.status !== "Queued" ||
    proposal.production_allowed !== false
  ) {
    return false;
  }

  if (record.resolution_kind === "pick_source") {
    return (
      nonBlank(record.chosen_source) &&
      hasNoValue(record.corrected_value) &&
      proposal.source_of_value === record.chosen_source
    );
  }
  if (record.resolution_kind === "corrected_value") {
    if (
      !nonBlank(record.corrected_value) ||
      !hasNoValue(record.chosen_source) ||
      proposal.source_of_value !== "corrected_value" ||
      proposal.value !== record.corrected_value
    ) {
      return false;
    }
    if (record.field_key === "current_rent") {
      const parsed = parseCurrencyInput(record.corrected_value);
      return parsed.ok && parsed.value > 0;
    }
    return true;
  }
  return false;
}

function validQueuedProposal(
  record: LeaseRenewalResolutionRecord,
  item: DeskReconItem,
): { value: string; source: string } | null {
  const proposal = record.proposed_writeback;
  if (
    !proposal ||
    proposal.field_key !== item.fieldKey ||
    !nonBlank(proposal.value) ||
    !nonBlank(proposal.source_of_value) ||
    proposal.status !== "Queued" ||
    proposal.production_allowed !== false
  ) {
    return null;
  }
  return { value: proposal.value, source: proposal.source_of_value };
}

/**
 * Validate one persisted decision against the exact current data-check item. Invalid, legacy, or
 * drifted records deliberately project no resolution: current source truth reopens the item.
 */
export function currentEffectiveDataCheckResolution(
  item: DeskReconItem,
  records: readonly LeaseRenewalResolutionRecord[],
  expectedRunId: string,
): EffectiveDataCheckResolution | null {
  if (!nonBlank(item.sourceTriggerKey) || !nonBlank(item.candidateFingerprint))
    return null;
  const matches = records.filter(
    (record) => record.source_trigger_key === item.sourceTriggerKey,
  );
  if (matches.length !== 1) return null;
  const record = matches[0];
  if (
    !isCompleteLeaseRenewalResolutionRecord(record) ||
    record.run_id !== expectedRunId ||
    record.source_trigger_key !== item.sourceTriggerKey ||
    record.field_key !== item.fieldKey ||
    record.candidate_fingerprint !== item.candidateFingerprint ||
    record.field_label !== item.fieldLabel
  ) {
    return null;
  }

  const priorAgreement = item.agreement as Exclude<
    DeskReconItem["agreement"],
    "resolved" | "dismissed"
  >;
  if (record.resolution_kind === "flag_incorrect") {
    return record.status === "Dismissed" &&
      hasNoValue(record.chosen_source) &&
      hasNoValue(record.corrected_value) &&
      hasNoValue(record.proposed_writeback)
      ? { kind: "flag_incorrect", value: null, source: null, priorAgreement }
      : null;
  }

  if (record.status !== "Resolved") return null;
  const proposal = validQueuedProposal(record, item);
  if (!proposal) return null;

  if (record.resolution_kind === "pick_source") {
    if (!nonBlank(record.chosen_source) || !hasNoValue(record.corrected_value))
      return null;
    const picked = item.candidates.filter(
      (candidate) => candidate.source === record.chosen_source,
    );
    if (
      picked.length !== 1 ||
      proposal.source !== record.chosen_source ||
      proposal.value !== picked[0].value
    ) {
      return null;
    }
    return {
      kind: "pick_source",
      value: proposal.value,
      source: proposal.source,
      priorAgreement,
    };
  }

  if (record.resolution_kind === "corrected_value") {
    if (
      !nonBlank(record.corrected_value) ||
      !hasNoValue(record.chosen_source) ||
      proposal.source !== "corrected_value" ||
      proposal.value !== record.corrected_value
    ) {
      return null;
    }
    return {
      kind: "corrected_value",
      value: proposal.value,
      source: proposal.source,
      priorAgreement,
    };
  }

  return null;
}

function dataCheckItemForOutcome(outcome: ReconciledFieldOutcome): DeskReconItem | null {
  const sourceTriggerKey = outcome.queueMapping?.queueItem.source_trigger_key;
  if (!sourceTriggerKey) return null;
  return {
    fieldKey: outcome.fieldKey,
    fieldLabel: outcome.fieldLabel,
    sourceTriggerKey,
    candidateFingerprint: outcome.candidateFingerprint,
    agreement: outcome.reconciliation.agreement,
    candidates: outcome.reconciliation.candidates.map((candidate) => ({
      source: candidate.source,
      sourceSystem: candidate.source_system,
      value: candidate.value === null ? "" : String(candidate.value),
      confidence: candidate.confidence ?? "Needs Review",
    })),
  };
}

/**
 * Join one persisted decision to exactly one current run outcome. This is the shared gate for every
 * surface that calls a decision current; a vanished/duplicated trigger or source drift returns null.
 */
export function currentResolutionForRenewalRun(
  record: LeaseRenewalResolutionRecord,
  run: RenewalRunResult,
): EffectiveDataCheckResolution | null {
  const outcomes = run.flags.filter(
    (outcome) =>
      outcome.queueMapping?.queueItem.source_trigger_key === record.source_trigger_key,
  );
  if (outcomes.length !== 1) return null;
  const outcome = outcomes[0];
  if (!outcome) return null;
  // A trigger/fingerprint match cannot move a persisted decision to a different property. Property
  // identity is optional only when it is absent on both the current outcome and stored record.
  if ((record.property_key ?? null) !== (outcome.propertyKey ?? null)) return null;
  const item = dataCheckItemForOutcome(outcome);
  if (!item) return null;
  return currentEffectiveDataCheckResolution(item, [record], run.runId);
}

/**
 * Build the single effective data-check used by desk status, blockers, process evidence, and the
 * workspace. A current exact decision clears only its own conflict. Any source fingerprint drift,
 * legacy shape, duplicate record, or malformed decision restores the raw current-source state.
 */
export function projectEffectiveDataCheck(
  sourceItems: readonly DeskReconItem[],
  resolutions: readonly LeaseRenewalResolutionRecord[],
  expectedRunId = "live-review",
): EffectiveDataCheckProjection {
  const resolutionsByField = new Map<string, EffectiveDataCheckResolution>();
  const items = sourceItems.map((item) => {
    const resolution = currentEffectiveDataCheckResolution(
      item,
      resolutions,
      expectedRunId,
    );
    if (!resolution) return { ...item };
    resolutionsByField.set(item.fieldKey, resolution);
    return {
      ...item,
      agreement: resolution.kind === "flag_incorrect" ? "dismissed" : "resolved",
    } satisfies DeskReconItem;
  });
  return { items, resolutionsByField };
}
