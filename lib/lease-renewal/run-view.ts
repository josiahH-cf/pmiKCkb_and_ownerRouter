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
import {
  writebackApprovalMatchesResolution,
  type WritebackApprovalState,
} from "@/lib/lease-renewal/writeback-approval";
import type { DecisionReasonCode } from "@/lib/lease-renewal/reason-codes";
import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalActivityRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";
import { buildRunPropertyKeyIndex } from "@/lib/lease-renewal/property-repository";
import { writebackAuthorizationTokenForResolution } from "@/lib/lease-renewal/writeback-authorization-token";
import { WRITEBACK_METHOD_APPEND_ONLY } from "@/lib/lease-renewal/writeback-proposal";
import { currentResolutionForRenewalRun } from "@/lib/lease-renewal/effective-data-check";
import { sourceDifferenceInformationLine } from "@/lib/lease-renewal/source-difference-rule";
import { leaseWorkspaceHrefOrNull } from "@/lib/lease-renewal/desk-view-continuation";

export interface RenewalCandidateView {
  source: string;
  sourceSystem: string;
  value: string;
  confidence?: string;
  locationRef?: string;
}

export interface ResolutionView {
  receiptId?: string;
  status: LeaseRenewalResolutionRecord["status"];
  kind?: LeaseRenewalResolutionRecord["resolution_kind"];
  chosenSource?: string;
  correctedValue?: string;
  reason?: string;
  reasonCode?: DecisionReasonCode;
  reasonRecorded?: boolean;
  resolvedByUid?: string;
  updatedAt?: string;
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
  /** Bodyless authorization receipt identity; absent while the proposal awaits a decision. */
  authorizationReceiptId?: string;
  decidedByUid?: string;
  reason?: string;
  reasonRecorded?: boolean;
  /** An approval exists but its snapshot no longer matches the queued value — re-approval needed. */
  stale: boolean;
  /** Exact queued resolution snapshot required by every approve/return request. */
  authorizationToken?: string;
  productionAllowed?: false;
  executed?: false;
  updatedAt?: string;
  /**
   * Full append-only decision history for this flag, oldest→newest (newest last). Present only when a
   * decision has been recorded; run-page-only (value-bearing), never projected onto the board.
   */
  activity?: RenewalWritebackApprovalActivityView[];
}

export interface RenewalFlagView {
  sourceTriggerKey: string;
  /** Versioned digest of the exact candidates rendered on this card. */
  candidateFingerprint: string;
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
  /**
   * S280 R-S280-3: the lease this item names ("101 Sample Pl"), on operating-Sheet runs. A label,
   * never a value; queue-adjacent surfaces may carry it.
   */
  leaseLabel?: string;
  /** S280: the joined RentVine lease id, when exactly known. */
  leaseId?: string;
}

/**
 * S280 R-S280-6: one RentVine and operating Sheet difference in the current rent or the lease dates,
 * which the one rule reads as information. It carries no severity and no decision control.
 */
export interface RenewalInformationView {
  /** The item identity (the trigger key a flag would carry); unique per run, lease row and field. */
  key: string;
  fieldKey: string;
  fieldLabel: string;
  leaseLabel: string;
  leaseId?: string;
  /** "101 Sample Pl: the operating Sheet shows $1,750.00 and RentVine shows $1,700.00. ..." */
  line: string;
  /** The lease's pending Sheet update (its rent and charges area), when the lease is known. */
  sheetUpdateHref?: string;
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
  /** S280 R-S280-6: information rows (present only when the run has any). Never counted as flags. */
  information?: RenewalInformationView[];
}

/** S280: the lease id inside an exact join id (`lease:123`), when it is one. */
export function leaseIdFromJoinIds(
  joinIds: readonly string[] | undefined,
): string | undefined {
  const ids = [
    ...new Set(
      (joinIds ?? []).flatMap((id) => {
        const match = /^lease:([1-9]\d*)$/.exec(id);
        return match ? [match[1]] : [];
      }),
    ),
  ];
  return ids.length === 1 ? ids[0] : undefined;
}

function informationViews(run: RenewalRunResult): RenewalInformationView[] {
  return run.outcomes.flatMap((outcome) => {
    if (!outcome.information || !outcome.informationKey) return [];
    const leaseLabel =
      outcome.leaseLabel ?? `Sheet row ${outcome.recordRef.sourceRowIndex + 1}`;
    const leaseId = leaseIdFromJoinIds(outcome.matchedCandidateJoinIds);
    const workspace = leaseId ? leaseWorkspaceHrefOrNull(leaseId) : null;
    return [
      {
        key: outcome.informationKey,
        fieldKey: outcome.fieldKey,
        fieldLabel: outcome.fieldLabel,
        leaseLabel,
        ...(leaseId ? { leaseId } : {}),
        line: sourceDifferenceInformationLine(leaseLabel, outcome.information),
        ...(workspace
          ? { sheetUpdateHref: `${workspace}#renewal-rent-and-charges` }
          : {}),
      },
    ];
  });
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
    receiptId: record.id,
    status: record.status,
    kind: record.resolution_kind,
    chosenSource: record.chosen_source,
    correctedValue: record.corrected_value,
    reason: record.reason,
    reasonCode: record.reason_code,
    reasonRecorded: Boolean(record.reason?.trim()),
    resolvedByUid: record.resolved_by_uid,
    updatedAt: record.updated_at,
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
  const authorizationToken = writebackAuthorizationTokenForResolution(resolution);

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
    return withActivity({
      queued: true,
      state: "Awaiting Approval",
      stale: false,
      reasonRecorded: false,
      productionAllowed: false,
      executed: false,
      ...(authorizationToken ? { authorizationToken } : {}),
    });
  }
  const stale = !resolution || !writebackApprovalMatchesResolution(resolution, approval);
  const state: WritebackApprovalState = stale ? "Awaiting Approval" : approval.state;
  return withActivity({
    queued: true,
    state,
    authorizationReceiptId: approval.id,
    decidedByUid: approval.decided_by_uid,
    reason: approval.reason,
    reasonRecorded: Boolean(approval.reason.trim()),
    stale,
    ...(authorizationToken ? { authorizationToken } : {}),
    productionAllowed: false,
    executed: false,
    updatedAt: approval.updated_at,
  });
}

function queuedWritebackProposal(
  resolution: LeaseRenewalResolutionRecord,
): WritebackProposal | null {
  const proposal = resolution.proposed_writeback;
  if (proposal?.status !== "Queued") return null;
  const proposedColumnHeader = `KB Proposed — ${resolution.field_label}`;
  return {
    fieldKey: resolution.field_key,
    fieldLabel: resolution.field_label,
    method: WRITEBACK_METHOD_APPEND_ONLY,
    proposedColumnHeader,
    proposedValue: proposal.value,
    sourceSystem: proposal.source_of_value,
    rationale: `Exact queued value from the saved human resolution for ${resolution.field_label}.`,
    status: "Proposed",
    requiresApproval: true,
    autoApplyAllowed: false,
    suggestionOnly: false,
    valueReady: true,
  };
}

function toFlagView(
  outcome: ReconciledFieldOutcome,
  resolutionsByKey: Map<string, LeaseRenewalResolutionRecord>,
  approvalsByKey: Map<string, LeaseRenewalWritebackApprovalRecord>,
  activityByKey: ReadonlyMap<string, LeaseRenewalWritebackApprovalActivityRecord[]>,
  propertyKeyByTrigger: ReadonlyMap<string, string | null>,
  run: RenewalRunResult,
): RenewalFlagView | null {
  const queueItem = outcome.queueMapping?.queueItem;
  if (!queueItem) return null;
  const reconciliation = outcome.reconciliation;
  const candidateResolution = resolutionsByKey.get(queueItem.source_trigger_key);
  const resolution =
    candidateResolution && currentResolutionForRenewalRun(candidateResolution, run)
      ? candidateResolution
      : undefined;
  return {
    sourceTriggerKey: queueItem.source_trigger_key,
    candidateFingerprint: outcome.candidateFingerprint,
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
    writeback: resolution
      ? queuedWritebackProposal(resolution)
      : buildWritebackProposal(reconciliation, { fieldLabel: outcome.fieldLabel }),
    writebackApproval: toWritebackApprovalView(
      resolution,
      approvalsByKey.get(queueItem.source_trigger_key),
      activityByKey.get(queueItem.source_trigger_key) ?? [],
    ),
    // S280 R-S280-3: the lease this item names, on operating-Sheet runs.
    ...(outcome.leaseLabel ? { leaseLabel: outcome.leaseLabel } : {}),
    ...(outcome.leaseLabel && leaseIdFromJoinIds(outcome.matchedCandidateJoinIds)
      ? { leaseId: leaseIdFromJoinIds(outcome.matchedCandidateJoinIds)! }
      : {}),
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
          run,
        ),
      )
      .filter((flag): flag is RenewalFlagView => flag !== null);
    if (flags.length > 0) groups.push({ severity, flags });
  }

  const totalFlags = groups.reduce((sum, group) => sum + group.flags.length, 0);
  const resolvedCount = run.flags.filter((outcome) => {
    const key = outcome.queueMapping?.queueItem.source_trigger_key;
    const record = key ? resolutionsByKey.get(key) : undefined;
    return Boolean(record && currentResolutionForRenewalRun(record, run));
  }).length;
  // S280 R-S280-6: information rows, never counted as flags.
  const information = informationViews(run);

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
    ...(information.length ? { information } : {}),
  };
}
