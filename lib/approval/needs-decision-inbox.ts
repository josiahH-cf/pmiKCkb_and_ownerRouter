// Unified "Needs your decision" inbox (S13 B1). The Approval Queue's default view: one
// attention-ordered, VALUE-FREE list that merges the three feeds the page already gathers — open
// renewal reconciliation flags, write-back proposals awaiting approval, and live approval-queue items
// that need a decision now. It fixes the "queue says nothing while Renewals has work" gap: those feeds
// were only reachable on separate tabs, so the default landing looked empty.
//
// Pure + deterministic: it PROJECTS over data the caller already has (no new Firestore reads) and, like
// the renewal review board and the write-back queue, copies ONLY value-free fields. The real values,
// reasons, and deciders stay behind each row's `href` (connector design §6.1). A safe queue-item
// row may also carry one value-free capability boolean for the existing app-plane approve action;
// renewal flags and write-backs remain deep-link-only.

import {
  isQueueItemTerminal,
  queueActionAvailability,
  type ApprovalQueueActor,
} from "@/lib/approval/queue";
import type { RenewalReviewBoard } from "@/lib/approval/renewal-review";
import type { WritebackApprovalQueue } from "@/lib/approval/writeback-approval-queue";
import type { ApprovalQueueItemRecord, QueueItemStatus } from "@/lib/firestore/types";
import { SEVERITY_ORDER } from "@/lib/lease-renewal/pipeline";
import type { Severity } from "@/lib/lease-renewal/severity";

export type NeedsDecisionKind = "writeback" | "renewal_flag" | "queue_item";

/** One value-free row on the unified inbox. Only these keys ever cross onto this surface. */
export interface NeedsDecisionRow {
  kind: NeedsDecisionKind;
  /** Stable React/list key, unique per row. */
  key: string;
  /** Field label or the already-PII-free action text — never a raw value. */
  label: string;
  /** PII-free context (the run, or what awaits) shown after the label. */
  detail: string;
  severity: Severity;
  /** Deep link to the authenticated surface where the real value + the decision control live. */
  href: string;
  /**
   * Set on `queue_item` rows ONLY (the queue item id), never a proposed value, reason, decider, or
   * assignee. Lets the Console deck offer an in-place Approve via the existing item PATCH (A4).
   */
  itemId?: string;
  /**
   * Set on `queue_item` rows ONLY. This value-free capability is true only for Low/Medium items that
   * the current actor may approve now and that are not assigned to that actor.
   */
  canApproveInline?: boolean;
}

export interface NeedsDecisionCounts {
  total: number;
  renewalFlags: number;
  writebacksAwaiting: number;
  queueItems: number;
}

export interface NeedsDecisionInbox {
  rows: NeedsDecisionRow[];
  counts: NeedsDecisionCounts;
}

// A queue item still needs an approver's decision when it is neither terminal (Approved/Completed/
// Cancelled/Disabled/Closed — the canonical set in lib/approval/queue.ts), nor Snoozed (deferred), nor
// Returned (back with the submitter). This keeps Ready for Approval, Blocked, AND Failed: a failed
// automation is actionable (it can be returned, snoozed, or disabled) and the queue's own default
// ranking already surfaces it right after Ready and Blocked.
function queueItemNeedsDecision(status: QueueItemStatus): boolean {
  return !isQueueItemTerminal(status) && status !== "Snoozed" && status !== "Returned";
}

const SEVERITY_RANK = new Map(SEVERITY_ORDER.map((severity, index) => [severity, index]));
function severityRank(severity: Severity): number {
  return SEVERITY_RANK.get(severity) ?? SEVERITY_ORDER.length;
}

// When the same field appears as both an open flag and a queued write-back, the write-back (the more
// specific, decision-ready item) wins. A PERSISTED reconcile queue item shares its target too (see
// queueItemTargetKey), so one underlying decision is always one row and one count (C4).
const KIND_RANK: Record<NeedsDecisionKind, number> = {
  writeback: 0,
  renewal_flag: 1,
  queue_item: 2,
};

// Reconciliation queue items are stamped source_trigger_key = "lease_renewal:reconcile:{runId}:
// {fieldKey}" (approval-queue-mapping). Deduping them by that key against the flag/write-back rows
// (whose target is "{runId}:{fieldKey}") keeps the merged number honest: the same field conflict
// never counts twice just because a queue item was persisted for it (S13 C4).
const RECONCILE_TRIGGER_PREFIX = "lease_renewal:reconcile:";

function queueItemTargetKey(item: ApprovalQueueItemRecord): string {
  if (item.source_trigger_key?.startsWith(RECONCILE_TRIGGER_PREFIX)) {
    return item.source_trigger_key.slice(RECONCILE_TRIGGER_PREFIX.length);
  }
  return `queue_item:${item.id}`;
}

/**
 * Merge the three value-free feeds into one attention-ordered inbox (pure, deterministic). Rows are
 * de-duplicated by their underlying target (run + field, or item id) — most-specific kind wins — then
 * ordered severity-first (High → Blocked → Medium → Low), then by kind, then by label.
 */
export function buildNeedsDecisionInbox(
  queueItems: readonly ApprovalQueueItemRecord[],
  renewalBoard: RenewalReviewBoard | undefined,
  writebackQueue: WritebackApprovalQueue | undefined,
  actor: ApprovalQueueActor,
): NeedsDecisionInbox {
  const byTarget = new Map<string, { row: NeedsDecisionRow; targetKey: string }>();

  const consider = (targetKey: string, row: NeedsDecisionRow) => {
    const existing = byTarget.get(targetKey);
    if (!existing || KIND_RANK[row.kind] < KIND_RANK[existing.row.kind]) {
      byTarget.set(targetKey, { row, targetKey });
    }
  };

  // 1. Write-back proposals awaiting an Admin decision (most specific).
  const awaiting = writebackQueue?.groups.find((g) => g.state === "Awaiting Approval");
  for (const row of awaiting?.rows ?? []) {
    consider(`${row.runId}:${row.fieldKey}`, {
      kind: "writeback",
      key: `writeback:${row.runId}:${row.fieldKey}`,
      label: row.fieldLabel,
      detail: `${row.runLabel} · awaiting write-back approval`,
      severity: row.severity,
      href: row.href,
    });
  }

  // 2. Open (unresolved) renewal reconciliation flags.
  for (const run of renewalBoard?.runs ?? []) {
    for (const flag of run.flags) {
      if (flag.resolved) continue;
      consider(`${run.runId}:${flag.fieldKey}`, {
        kind: "renewal_flag",
        key: `renewal_flag:${run.runId}:${flag.fieldKey}`,
        label: flag.fieldLabel,
        detail: run.label,
        severity: flag.severity,
        href: flag.href,
      });
    }
  }

  // 3. Live approval-queue items that need a decision now (reconcile items dedupe by target — C4).
  for (const item of queueItems) {
    if (!queueItemNeedsDecision(item.status)) continue;
    const safeRisk = item.risk === "Low" || item.risk === "Medium";
    const canApproveInline =
      safeRisk &&
      item.status === "Ready for Approval" &&
      item.assignee_uid !== actor.uid &&
      queueActionAvailability(actor, item).approve;
    consider(queueItemTargetKey(item), {
      kind: "queue_item",
      key: `queue_item:${item.id}`,
      itemId: item.id,
      canApproveInline,
      label: item.action_needed,
      detail: item.process_run_ref.label,
      severity: item.risk,
      href: item.direct_link || `/approval-queue?item_id=${item.id}`,
    });
  }

  const rows = [...byTarget.values()].map((entry) => entry.row);
  rows.sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      a.label.localeCompare(b.label),
  );

  const countKind = (kind: NeedsDecisionKind) =>
    rows.filter((row) => row.kind === kind).length;

  return {
    rows,
    counts: {
      total: rows.length,
      renewalFlags: countKind("renewal_flag"),
      writebacksAwaiting: countKind("writeback"),
      queueItems: countKind("queue_item"),
    },
  };
}
