// Pure projection from a RenewalRunResult (+ persisted resolutions) into a serialization-safe view
// for the lease-renewal review page. No I/O. Stringifies values for display; PII display inside the
// authenticated app is allowed and audited (design §6.1).

import type {
  ReconciledFieldOutcome,
  RenewalRunResult,
} from "@/lib/lease-renewal/pipeline";
import { SEVERITY_ORDER } from "@/lib/lease-renewal/pipeline";
import type { Severity } from "@/lib/lease-renewal/severity";
import {
  buildWritebackProposal,
  type WritebackProposal,
} from "@/lib/lease-renewal/writeback-proposal";
import type { LeaseRenewalResolutionRecord } from "@/lib/firestore/types";

export interface RenewalCandidateView {
  source: string;
  sourceSystem: string;
  value: string;
  confidence?: string;
  locationRef?: string;
}

export interface ResolutionView {
  status: LeaseRenewalResolutionRecord["status"];
  kind?: LeaseRenewalResolutionRecord["resolution_kind"];
  chosenSource?: string;
  correctedValue?: string;
  reason?: string;
  resolvedByUid?: string;
}

export interface RenewalFlagView {
  sourceTriggerKey: string;
  fieldKey: string;
  fieldLabel: string;
  severity: Severity;
  agreement: string;
  actionNeeded: string;
  directLink: string;
  suggestedWinner: { source: string; value: string } | null;
  blockedReason?: string;
  candidates: RenewalCandidateView[];
  resolution: ResolutionView | null;
  /** Append-only write-back proposal (Q-WRITEBACK-METHOD) — value-bearing; null when not proposable. */
  writeback: WritebackProposal | null;
}

export interface RenewalSeverityGroup {
  severity: Severity;
  flags: RenewalFlagView[];
}

export interface RenewalManifestView {
  tabsRecognized: number;
  tabsUnrecognized: number;
  credentialTabsExcluded: number;
  credentialScrubHits: number;
  dividerRowsDropped: number;
  totalRecords: number;
}

export interface RenewalRunView {
  runId: string;
  label: string;
  manifest: RenewalManifestView;
  excludedTabs: { tab: string; reason: string }[];
  groups: RenewalSeverityGroup[];
  totalFlags: number;
  resolvedCount: number;
}

function displayValue(value: string | number | boolean | null): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

function toResolutionView(
  record: LeaseRenewalResolutionRecord | undefined,
): ResolutionView | null {
  if (!record) return null;
  return {
    status: record.status,
    kind: record.resolution_kind,
    chosenSource: record.chosen_source,
    correctedValue: record.corrected_value,
    reason: record.reason,
    resolvedByUid: record.resolved_by_uid,
  };
}

function toFlagView(
  outcome: ReconciledFieldOutcome,
  resolutionsByKey: Map<string, LeaseRenewalResolutionRecord>,
): RenewalFlagView | null {
  const queueItem = outcome.queueMapping?.queueItem;
  if (!queueItem) return null;
  const reconciliation = outcome.reconciliation;
  return {
    sourceTriggerKey: queueItem.source_trigger_key,
    fieldKey: outcome.fieldKey,
    fieldLabel: outcome.fieldLabel,
    severity: reconciliation.severity,
    agreement: reconciliation.agreement,
    actionNeeded: queueItem.action_needed,
    directLink: queueItem.direct_link,
    suggestedWinner: reconciliation.suggested_winner
      ? {
          source: reconciliation.suggested_winner.source,
          value: displayValue(reconciliation.suggested_winner.value),
        }
      : null,
    blockedReason: reconciliation.blocked_reason,
    candidates: reconciliation.candidates.map((candidate) => ({
      source: candidate.source,
      sourceSystem: candidate.source_system,
      value: displayValue(candidate.value),
      confidence: candidate.confidence,
      locationRef: candidate.location_ref,
    })),
    resolution: toResolutionView(resolutionsByKey.get(queueItem.source_trigger_key)),
    writeback: buildWritebackProposal(reconciliation, { fieldLabel: outcome.fieldLabel }),
  };
}

/** Build the review view from a run and its persisted resolutions (pure). */
export function buildRenewalRunView(
  run: RenewalRunResult,
  resolutions: LeaseRenewalResolutionRecord[],
  label: string,
): RenewalRunView {
  const resolutionsByKey = new Map(
    resolutions.map((record) => [record.source_trigger_key, record]),
  );

  const groups: RenewalSeverityGroup[] = [];
  for (const severity of SEVERITY_ORDER) {
    const flags = run.bySeverity[severity]
      .map((outcome) => toFlagView(outcome, resolutionsByKey))
      .filter((flag): flag is RenewalFlagView => flag !== null);
    if (flags.length > 0) groups.push({ severity, flags });
  }

  const totalFlags = groups.reduce((sum, group) => sum + group.flags.length, 0);
  const resolvedCount = run.flags.filter((outcome) => {
    const key = outcome.queueMapping?.queueItem.source_trigger_key;
    const record = key ? resolutionsByKey.get(key) : undefined;
    return record !== undefined && record.status !== "Open";
  }).length;

  return {
    runId: run.runId,
    label,
    manifest: {
      tabsRecognized: run.manifest.tabsRecognized,
      tabsUnrecognized: run.manifest.tabsUnrecognized,
      credentialTabsExcluded: run.manifest.credentialTabsExcluded,
      credentialScrubHits: run.manifest.credentialScrubHits,
      dividerRowsDropped: run.manifest.dividerRowsDropped,
      totalRecords: run.manifest.totalRecords,
    },
    excludedTabs: run.excludedTabs.map((excluded) => ({
      tab: excluded.tab,
      reason: excluded.reason,
    })),
    groups,
    totalFlags,
    resolvedCount,
  };
}
