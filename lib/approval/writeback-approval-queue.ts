// Cross-run "ready-to-write" write-back queue (value-free). A different lens than the renewal review
// sub-tab: instead of grouping flags by run, this consolidates every QUEUED write-back proposal across
// all runs and groups it by APPROVAL STATE — Awaiting approval / Approved (ready to write, NOT
// executed) / Returned — so an operator sees, in one place, what still needs a decision. Each row
// deep-links to its run page to act; this surface executes nothing and offers no action affordance.
//
// Value-free by construction: it reuses the SAME RenewalRunView[] the review board already assembles
// (no new Firestore reads) and copies ONLY value-free fields off each flag — the proposed value,
// decision reason, and decider stay behind the run-page deep link (connector design §6.1).

import { renewalRunHref } from "@/lib/approval/renewal-review";
import type { RenewalRunView } from "@/lib/lease-renewal/run-view";
import { SEVERITY_ORDER } from "@/lib/lease-renewal/pipeline";
import type { Severity } from "@/lib/lease-renewal/severity";
import type { WritebackApprovalState } from "@/lib/lease-renewal/writeback-approval";

/** One queued write-back proposal, value-free. Only these keys ever cross onto this surface. */
export interface WritebackApprovalQueueRow {
  fieldKey: string;
  fieldLabel: string;
  severity: Severity;
  runId: string;
  runLabel: string;
  state: WritebackApprovalState;
  /** Deep link to the authenticated run page where the real value + the approve/return control live. */
  href: string;
}

export interface WritebackApprovalQueueGroup {
  state: WritebackApprovalState;
  rows: WritebackApprovalQueueRow[];
}

export interface WritebackApprovalQueueCounts {
  awaitingApproval: number;
  approved: number;
  returned: number;
  total: number;
}

export interface WritebackApprovalQueue {
  /** Fixed order: Awaiting approval → Approved → Returned (empty groups kept for a stable layout). */
  groups: WritebackApprovalQueueGroup[];
  counts: WritebackApprovalQueueCounts;
}

// Stable presentation order for the state buckets.
const QUEUE_STATE_ORDER: readonly WritebackApprovalState[] = [
  "Awaiting Approval",
  "Approved",
  "Returned for Revision",
];

const SEVERITY_RANK = new Map(SEVERITY_ORDER.map((severity, index) => [severity, index]));

function severityRank(severity: Severity): number {
  return SEVERITY_RANK.get(severity) ?? SEVERITY_ORDER.length;
}

/**
 * Project run views into the value-free cross-run write-back queue (pure, deterministic). Each queued
 * proposal (a flag whose approval overlay is present) becomes one row; rows are bucketed by approval
 * state and, within a bucket, ordered most-attention-first (severity, then run label, then field).
 */
export function buildWritebackApprovalQueue(
  views: readonly RenewalRunView[],
): WritebackApprovalQueue {
  const rows: WritebackApprovalQueueRow[] = [];
  for (const view of views) {
    const href = renewalRunHref(view.runId);
    for (const group of view.groups) {
      for (const flag of group.flags) {
        const approval = flag.writebackApproval;
        if (!approval) continue;
        // Value-free copy only — never the proposed value, decision reason, decider, or activity.
        rows.push({
          fieldKey: flag.fieldKey,
          fieldLabel: flag.fieldLabel,
          severity: flag.severity,
          runId: view.runId,
          runLabel: view.label,
          state: approval.state,
          href,
        });
      }
    }
  }

  const groups: WritebackApprovalQueueGroup[] = QUEUE_STATE_ORDER.map((state) => ({
    state,
    rows: rows
      .filter((row) => row.state === state)
      .sort(
        (a, b) =>
          severityRank(a.severity) - severityRank(b.severity) ||
          a.runLabel.localeCompare(b.runLabel) ||
          a.fieldLabel.localeCompare(b.fieldLabel),
      ),
  }));

  const countFor = (state: WritebackApprovalState) =>
    rows.filter((row) => row.state === state).length;

  return {
    groups,
    counts: {
      awaitingApproval: countFor("Awaiting Approval"),
      approved: countFor("Approved"),
      returned: countFor("Returned for Revision"),
      total: rows.length,
    },
  };
}
