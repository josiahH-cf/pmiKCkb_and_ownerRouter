// S17 B5 — Dan's review lane. A value-free, Admin-scoped, muteable DIGEST that rolls up the exceptions
// Dan cares about (high-risk overrides + self-corrections) into ONE signal per period, so he sees the
// exceptions without one ping per team edit. It is a pure projection over the EXISTING value-free
// decision metrics (F-LEARN-LOOP) — counts + lane only, NEVER a value, address, field, decider, or
// free-text reason (the AttentionSignal contract enforces the key set). Served only to an Admin viewer
// (the route gates it) and muteable via the same mute primitive.
//
// HARD STOP (B5): this must NEVER emit one notification per team edit. It returns exactly one digest
// signal (or null when there is nothing to review) — a per-edit ping is itself a falsification.

import { toAttentionSignal, type AttentionSignal } from "@/lib/attention/lanes";
import type { DecisionMetrics } from "@/lib/lease-renewal/decision-metrics";

/** The review surface: the value-free decision-metrics card lives on the Approval Queue. */
const DEFAULT_REVIEW_HREF = "/approval-queue";
const DEFAULT_PERIOD_LABEL = "this period";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Build the single Admin-only review digest from the value-free decision metrics, or null when there is
 * nothing to review (no high-risk overrides AND no self-corrections). Value-free by construction: the
 * detail is counts + category words only. The caller (route) is responsible for serving this ONLY to an
 * Admin viewer.
 */
export function buildTeamReviewDigest(
  metrics: DecisionMetrics,
  options: { periodLabel?: string; href?: string } = {},
): AttentionSignal | null {
  const highRiskOverrides = metrics.review.high_risk_overrides;
  const selfCorrections = metrics.review.self_corrections;
  if (highRiskOverrides === 0 && selfCorrections === 0) {
    return null;
  }

  const periodLabel = options.periodLabel ?? DEFAULT_PERIOD_LABEL;
  return toAttentionSignal({
    lane: "review",
    severity: highRiskOverrides > 0 ? "high" : "medium",
    label: "Team review",
    detail: `${plural(highRiskOverrides, "high-risk override")}, ${plural(
      selfCorrections,
      "self-correction",
    )} ${periodLabel}`,
    href: options.href ?? DEFAULT_REVIEW_HREF,
    signalKey: "team_review:digest",
  });
}
