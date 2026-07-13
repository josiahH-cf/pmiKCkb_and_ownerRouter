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
import type { WritebackApprovalState } from "@/lib/lease-renewal/writeback-approval";
import type { DecisionReasonCode } from "@/lib/lease-renewal/reason-codes";
import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalActivityRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";
import { buildRunPropertyKeyIndex } from "@/lib/lease-renewal/property-repository";

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
  reasonCode?: DecisionReasonCode;
  resolvedByUid?: string;
}

/**
 * One append-only approval decision, projected for the run-page audit trail. Value-bearing (decider +
 * reason) — allowed only on the authenticated run page (design §6.1), never on the value-free board.
 */
export interface RenewalWritebackApprovalActivityView {
  action: LeaseRenewalWritebackApprovalActivityRecord["action"];
  decidedByUid: string;
  reason: string;
  createdAt: string;
}

/**
 * Approval overlay for a resolved flag's QUEUED write-back proposal (Phase-2 control plane). Present
 * only when a human resolution has queued a proposal to write; null otherwise. Value-free with respect
 * to the PROPOSED value: it carries the approval state, decider, and reason — never the proposed value
 * (that stays in `writeback`).
 */
export interface RenewalWritebackApprovalView {
  /** A human-resolved proposal is queued to write (resolution.proposed_writeback.status "Queued"). */
  queued: true;
  /** Effective state; "Awaiting Approval" when queued but not yet (freshly) decided, or stale. */
  state: WritebackApprovalState;
  decidedByUid?: string;
  reason?: string;
  /** An approval exists but its snapshot no longer matches the queued value — re-approval needed. */
  stale: boolean;
  /**
   * Full append-only decision history for this flag, oldest→newest (newest last). Present only when a
   * decision has been recorded; run-page-only (value-bearing), never projected onto the board.
   */
  activity?: RenewalWritebackApprovalActivityView[];
}

export interface RenewalFlagView {
  sourceTriggerKey: string;
  fieldKey: string;
  fieldLabel: string;
  severity: Severity;
  agreement: string;
  actionNeeded: string;
  directLink: string;
  /** In-boundary canonical key, present only when this trigger maps to exactly one property. */
  propertyKey?: string;
  suggestedWinner: { source: string; value: string } | null;
  blockedReason?: string;
  candidates: RenewalCandidateView[];
  resolution: ResolutionView | null;
  /** Append-only write-back proposal (Q-WRITEBACK-METHOD) — value-bearing; null when not proposable. */
  writeback: WritebackProposal | null;
  /** Approval state of the QUEUED proposal (Phase-2 control plane); null when nothing is queued. */
  writebackApproval: RenewalWritebackApprovalView | null;
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
    reasonCode: record.reason_code,
    resolvedByUid: record.resolved_by_uid,
  };
}

/**
 * Compute the approval overlay for a resolved flag's queued proposal. Null unless a human resolution
 * has queued a proposal to write. A prior approval whose snapshot no longer matches the current queued
 * value is reported as stale + "Awaiting Approval" (needs re-approval), never as authorizing the new
 * value. Value-free: never surfaces the proposed value itself.
 */
function toWritebackApprovalView(
  resolution: LeaseRenewalResolutionRecord | undefined,
  approval: LeaseRenewalWritebackApprovalRecord | undefined,
  activityRecords: readonly LeaseRenewalWritebackApprovalActivityRecord[] = [],
): RenewalWritebackApprovalView | null {
  const proposal = resolution?.proposed_writeback;
  if (!proposal || proposal.status !== "Queued") return null;

  // Full ordered decision history (newest last). Present regardless of staleness so the trail never
  // hides a revoked/superseded decision; empty until a decision is recorded.
  const activity: RenewalWritebackApprovalActivityView[] = activityRecords.map(
    (record) => ({
      action: record.action,
      decidedByUid: record.actor_uid,
      reason: record.reason,
      createdAt: record.created_at,
    }),
  );
  const withActivity = <T extends RenewalWritebackApprovalView>(view: T): T =>
    activity.length > 0 ? { ...view, activity } : view;

  if (!approval) {
    return withActivity({ queued: true, state: "Awaiting Approval", stale: false });
  }
  const stale =
    approval.proposed_value !== proposal.value ||
    approval.source_of_value !== proposal.source_of_value;
  const state: WritebackApprovalState = stale ? "Awaiting Approval" : approval.state;
  return withActivity({
    queued: true,
    state,
    decidedByUid: approval.decided_by_uid,
    reason: approval.reason,
    stale,
  });
}

function toFlagView(
  outcome: ReconciledFieldOutcome,
  resolutionsByKey: Map<string, LeaseRenewalResolutionRecord>,
  approvalsByKey: Map<string, LeaseRenewalWritebackApprovalRecord>,
  activityByKey: ReadonlyMap<string, LeaseRenewalWritebackApprovalActivityRecord[]>,
  propertyKeyByTrigger: ReadonlyMap<string, string | null>,
): RenewalFlagView | null {
  const queueItem = outcome.queueMapping?.queueItem;
  if (!queueItem) return null;
  const reconciliation = outcome.reconciliation;
  const resolution = resolutionsByKey.get(queueItem.source_trigger_key);
  return {
    sourceTriggerKey: queueItem.source_trigger_key,
    fieldKey: outcome.fieldKey,
    fieldLabel: outcome.fieldLabel,
    severity: reconciliation.severity,
    agreement: reconciliation.agreement,
    actionNeeded: queueItem.action_needed,
    directLink: queueItem.direct_link,
    ...(propertyKeyByTrigger.get(queueItem.source_trigger_key)
      ? { propertyKey: propertyKeyByTrigger.get(queueItem.source_trigger_key)! }
      : {}),
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
    resolution: toResolutionView(resolution),
    writeback: buildWritebackProposal(reconciliation, { fieldLabel: outcome.fieldLabel }),
    writebackApproval: toWritebackApprovalView(
      resolution,
      approvalsByKey.get(queueItem.source_trigger_key),
      activityByKey.get(queueItem.source_trigger_key) ?? [],
    ),
  };
}

/**
 * Build the review view from a run, its persisted resolutions, and write-back approvals (pure). The
 * optional `activityByKey` (grouped by source_trigger_key) layers the append-only approval decision
 * history onto each queued flag's overlay for the RUN PAGE only — the value-free board/queue callers
 * omit it, so the decision reasons never reach a queue-adjacent surface.
 */
export function buildRenewalRunView(
  run: RenewalRunResult,
  resolutions: LeaseRenewalResolutionRecord[],
  label: string,
  approvals: LeaseRenewalWritebackApprovalRecord[] = [],
  activityByKey: ReadonlyMap<
    string,
    LeaseRenewalWritebackApprovalActivityRecord[]
  > = new Map(),
): RenewalRunView {
  const resolutionsByKey = new Map(
    resolutions.map((record) => [record.source_trigger_key, record]),
  );
  const approvalsByKey = new Map(
    approvals.map((record) => [record.source_trigger_key, record]),
  );
  const propertyKeyByTrigger = buildRunPropertyKeyIndex(run);

  const groups: RenewalSeverityGroup[] = [];
  for (const severity of SEVERITY_ORDER) {
    const flags = run.bySeverity[severity]
      .map((outcome) =>
        toFlagView(
          outcome,
          resolutionsByKey,
          approvalsByKey,
          activityByKey,
          propertyKeyByTrigger,
        ),
      )
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
