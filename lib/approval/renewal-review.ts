// Renewal review sub-tab (OQ-UI-1): a consolidated, VALUE-FREE triage of open renewal reconciliation
// flags, organized by run, surfaced inside the Approval Queue so Dan reviews renewals from the same
// place he approves. Pure + deterministic projection from the run views (`buildRenewalRunView`).
//
// Value-free by construction: the queue-adjacent board is safe to surface, so it carries ONLY the
// field label, severity, agreement, and the already-PII-free action text (connector design §6.1).
// The real candidate/suggested VALUES stay behind each run's `href` — the authenticated resolve
// surface at /lease-renewal/runs/{runId}. This module reads nothing and writes nothing; the actual
// resolution still happens via the built resolve flow (Q-PREC-1), not here.

import type { RenewalFlagView, RenewalRunView } from "@/lib/lease-renewal/run-view";
import type { Severity } from "@/lib/lease-renewal/severity";

export interface RenewalReviewFlag {
  fieldKey: string;
  fieldLabel: string;
  severity: Severity;
  agreement: string;
  /** PII-free action text (mirrors the queue item's action_needed) — never a raw value. */
  actionNeeded: string;
  resolved: boolean;
  /** True when an append-only write-back proposal has a value ready to approve (value-free boolean). */
  proposalReady: boolean;
  /** Deep link to the authenticated resolve surface where the real values live. */
  href: string;
}

export interface RenewalReviewRun {
  runId: string;
  label: string;
  href: string;
  /** Flags in severity order (High → Blocked → Medium → Low), as produced by the run view. */
  flags: RenewalReviewFlag[];
  totalFlags: number;
  openFlags: number;
  /** Unresolved High- or Blocked-severity flags — the ones to review first. */
  highSeverityOpen: number;
  /** Unresolved Blocked-severity flags (a held/failed automation). */
  blockedOpen: number;
}

export interface RenewalReviewBoard {
  runs: RenewalReviewRun[];
  totalRuns: number;
  totalFlags: number;
  totalOpenFlags: number;
}

/** Deep link to the authenticated per-run resolve/evidence surface. */
export function renewalRunHref(runId: string): string {
  return `/lease-renewal/runs/${runId}`;
}

function isResolved(flag: RenewalFlagView): boolean {
  return flag.resolution !== null && flag.resolution.status !== "Open";
}

function toReviewFlag(flag: RenewalFlagView, href: string): RenewalReviewFlag {
  // Deliberately omits `candidates`, `suggestedWinner`, and the proposal's value/rationale
  // (value-bearing) — they stay behind `href`. Only the value-FREE readiness boolean crosses over.
  return {
    fieldKey: flag.fieldKey,
    fieldLabel: flag.fieldLabel,
    severity: flag.severity,
    agreement: flag.agreement,
    actionNeeded: flag.actionNeeded,
    resolved: isResolved(flag),
    proposalReady: flag.writeback?.valueReady ?? false,
    href,
  };
}

function toReviewRun(view: RenewalRunView): RenewalReviewRun {
  const href = renewalRunHref(view.runId);
  // `groups` are already ordered by SEVERITY_ORDER; flatten preserving that order.
  const flags = view.groups.flatMap((group) =>
    group.flags.map((flag) => toReviewFlag(flag, href)),
  );
  const openFlags = flags.filter((flag) => !flag.resolved);

  return {
    runId: view.runId,
    label: view.label,
    href,
    flags,
    totalFlags: flags.length,
    openFlags: openFlags.length,
    highSeverityOpen: openFlags.filter(
      (flag) => flag.severity === "High" || flag.severity === "Blocked",
    ).length,
    blockedOpen: openFlags.filter((flag) => flag.severity === "Blocked").length,
  };
}

/**
 * Project run views into the value-free renewal review board, most-attention-first. Pure: no I/O,
 * deterministic ordering so the view and its tests are stable.
 */
export function buildRenewalReviewBoard(
  views: readonly RenewalRunView[],
): RenewalReviewBoard {
  const runs = views.map(toReviewRun);

  runs.sort(
    (a, b) =>
      b.highSeverityOpen - a.highSeverityOpen ||
      b.openFlags - a.openFlags ||
      a.label.localeCompare(b.label),
  );

  return {
    runs,
    totalRuns: runs.length,
    totalFlags: runs.reduce((count, run) => count + run.totalFlags, 0),
    totalOpenFlags: runs.reduce((count, run) => count + run.openFlags, 0),
  };
}
