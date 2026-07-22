// DecisionMetricsCard — value-free decision metrics on the Approval Queue (S13 Wave 3 H1). Renders the
// counts projection from buildDecisionMetrics: accept / correct / dismiss rates + the reason-code
// distribution. Read-only, counts only — no field value, proposed value, reason text, or lease ever
// appears here (guaranteed by the projection's value-free key set, pinned by a sentinel test).

import {
  DECISION_REASON_CODES,
  DECISION_REASON_CODE_LABELS,
} from "@/lib/lease-renewal/reason-codes";
import type { DecisionMetrics } from "@/lib/lease-renewal/decision-metrics";

export function DecisionMetricsCard({ metrics }: Readonly<{ metrics: DecisionMetrics }>) {
  if (metrics.total_decisions === 0) {
    return (
      <section className="panel" aria-label="Decision metrics">
        <h2 className="section-subtitle">Decision metrics</h2>
        <p className="muted">
          No decisions recorded yet. Once the team resolves flags and approves
          write-backs, the accept / correct / dismiss rates show here.
        </p>
      </section>
    );
  }

  const dismissPct = Math.round(metrics.resolutions.dismiss_rate * 100);
  return (
    <section className="panel" aria-label="Decision metrics">
      <h2 className="section-subtitle">Decision metrics</h2>
      <p className="muted">
        {metrics.total_decisions} decision(s) recorded. Counts only: every value stays on
        the run page.
      </p>
      <ul className="ui-rows">
        <li className="ui-spread">
          <span>Flags resolved</span>
          <span>
            <strong>{metrics.resolutions.total}</strong> (accepted{" "}
            {metrics.resolutions.accepted}, corrected {metrics.resolutions.corrected},
            dismissed {metrics.resolutions.dismissed})
          </span>
        </li>
        <li className="ui-spread">
          <span>Dismissed as false positive</span>
          <span>
            <strong>{dismissPct}%</strong> of resolutions
          </span>
        </li>
        <li className="ui-spread">
          <span>Write-backs decided</span>
          <span>
            <strong>{metrics.approvals.total}</strong> (approved{" "}
            {metrics.approvals.approved}, returned {metrics.approvals.returned})
          </span>
        </li>
      </ul>

      <h3 className="section-subtitle">Reason codes</h3>
      <ul className="ui-rows">
        {DECISION_REASON_CODES.map((code) => (
          <li className="ui-spread" key={code}>
            <span>{DECISION_REASON_CODE_LABELS[code]}</span>
            <strong>{metrics.reason_codes[code]}</strong>
          </li>
        ))}
        <li className="ui-spread">
          <span className="muted">Not categorized</span>
          <strong>{metrics.uncategorized}</strong>
        </li>
      </ul>
    </section>
  );
}
