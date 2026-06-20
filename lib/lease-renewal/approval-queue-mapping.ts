// Map a flag-raising FieldReconciliation onto the existing Approval Queue's fixed v1 fields
// (connector design §3.3, §3.5). The queue item carries ONLY fixed fields plus deep links — never
// a raw cell value. Conflicting values stay inside the authenticated app behind the deep links
// (§6.1 "real values in evidence stay inside the authenticated app"), so the queue artifact is
// safe to surface, notify, and log. Pure and deterministic; no I/O, no write.

import type {
  ProcessDefinitionSourceLink,
  QueueAudienceGroup,
  QueueRiskLevel,
} from "@/lib/firestore/types";
import type { FieldReconciliation } from "@/lib/lease-renewal/reconciliation";

export interface ApprovalQueueItemDraft {
  item_type: "SourceFactConflict";
  /** Stable key so duplicate flags for the same run+field merge into one open item (§3.5). */
  source_trigger_key: string;
  status: "Ready for Approval" | "Blocked";
  risk: QueueRiskLevel;
  audience_group: QueueAudienceGroup;
  process_run_ref: { id: string; label: string };
  /** Plain-English, PII-free action. References field + sources, never the conflicting values. */
  action_needed: string;
  affected_system_action: string;
  /** Deep link into the in-app evidence where the real values live. */
  direct_link: string;
}

export interface ReconciliationQueueMapping {
  queueItem: ApprovalQueueItemDraft;
  /** Source labels + deep links only — no values. */
  sourceLinks: ProcessDefinitionSourceLink[];
}

export interface QueueMappingContext {
  runId: string;
  /** Human-facing field label; falls back to the field key. */
  fieldLabel?: string;
}

const RECONCILE_ACTION = "google_sheets.renewal_checklist.reconcile";

function audienceFor(severity: QueueRiskLevel): QueueAudienceGroup {
  switch (severity) {
    case "High":
      return "Dan/Admin decisions";
    case "Blocked":
      return "Failed/Blocked automation";
    default:
      return "Team follow-up";
  }
}

function humanizeKey(fieldKey: string): string {
  return fieldKey.replace(/_/g, " ");
}

/**
 * Build an Approval-Queue item draft from a reconciliation that raised a flag, or return null for
 * benign (agree / single-source, no-flag) reconciliations.
 */
export function mapReconciliationToQueueItem(
  reconciliation: FieldReconciliation,
  context: QueueMappingContext,
): ReconciliationQueueMapping | null {
  if (!reconciliation.raise_flag) return null;

  const { runId } = context;
  const label = context.fieldLabel ?? humanizeKey(reconciliation.field_key);
  const sourceLabels = reconciliation.candidates.map(
    (candidate) => candidate.source_system,
  );
  const evidenceLink = `/workflow-runs/${runId}/reconciliation/${reconciliation.field_key}`;

  let actionNeeded: string;
  if (reconciliation.agreement === "missing") {
    actionNeeded = `Missing "${label}" on a gating field — provide a source or value (review required).`;
  } else if (reconciliation.blocked_reason) {
    actionNeeded = `Reconcile "${label}" across ${sourceLabels.length} sources (${sourceLabels.join(", ")}); ${reconciliation.blocked_reason} — needs a human decision.`;
  } else {
    const suggestion = reconciliation.suggested_winner
      ? `Suggested source: ${reconciliation.suggested_winner.source} (suggestion only — needs human approval).`
      : "No suggestion — needs a human decision.";
    actionNeeded = `Reconcile conflicting "${label}" across ${sourceLabels.length} sources (${sourceLabels.join(", ")}). ${suggestion}`;
  }

  const queueItem: ApprovalQueueItemDraft = {
    item_type: "SourceFactConflict",
    source_trigger_key: `lease_renewal:reconcile:${runId}:${reconciliation.field_key}`,
    status: reconciliation.severity === "Blocked" ? "Blocked" : "Ready for Approval",
    risk: reconciliation.severity,
    audience_group: audienceFor(reconciliation.severity),
    process_run_ref: { id: runId, label: `Lease renewal run ${runId}` },
    action_needed: actionNeeded,
    affected_system_action: RECONCILE_ACTION,
    direct_link: evidenceLink,
  };

  const sourceLinks: ProcessDefinitionSourceLink[] = reconciliation.candidates.map(
    (candidate) => ({
      label: candidate.source_system,
      url: candidate.location_ref ?? `${evidenceLink}#${candidate.source}`,
    }),
  );

  return { queueItem, sourceLinks };
}
