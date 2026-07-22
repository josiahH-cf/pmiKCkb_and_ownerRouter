import Link from "next/link";

import type { LeaseRenewalDecisionProjection } from "@/lib/lease-renewal/decision-projection";
import { buildPropertyHistoryHref } from "@/lib/lease-renewal/property-history-link";

export function LeaseDecisionProjectionPanel({
  decisions,
  emptyMessage,
  title,
}: Readonly<{
  decisions: readonly LeaseRenewalDecisionProjection[];
  emptyMessage: string;
  title: string;
}>) {
  return (
    <section aria-label={title} className="panel ui-stack">
      <div>
        <h2 className="section-subtitle">{title}</h2>
        <p className="muted">
          Bodyless app decision and authorization state. Proposed/source values remain on
          the owning renewal record; authorization stays app-only; provider execution is a
          separate, later step.
        </p>
      </div>

      {decisions.length === 0 ? (
        <p className="muted">{emptyMessage}</p>
      ) : (
        <ul className="compact-list" data-testid="lease-decision-projections">
          {decisions.map((decision) => (
            <li key={decision.sourceTriggerKey}>
              <p>
                <strong>
                  {decision.dataMode} · {decision.fieldLabel}
                </strong>
              </p>
              <dl className="review-grid">
                <div>
                  <dt>Decision</dt>
                  <dd>{decision.decisionState}</dd>
                </div>
                <div>
                  <dt>Decision reason</dt>
                  <dd>{decision.decisionReasonRecorded ? "Recorded" : "Missing"}</dd>
                </div>
                <div>
                  <dt>Decision receipt</dt>
                  <dd>
                    <code>{decision.decisionReceiptId}</code>
                  </dd>
                </div>
                <div>
                  <dt>Proposal</dt>
                  <dd>{decision.proposalState}</dd>
                </div>
                <div>
                  <dt>Authorization</dt>
                  <dd>{decision.authorizationState}</dd>
                </div>
                <div>
                  <dt>Authorization receipt</dt>
                  <dd>
                    {decision.authorizationReceiptId ? (
                      <code>{decision.authorizationReceiptId}</code>
                    ) : (
                      "Not recorded"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Execution</dt>
                  <dd>{decision.executionState.replace("_", " ")}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{decision.decisionUpdatedAt}</dd>
                </div>
              </dl>
              <p className="ui-inline-actions">
                <Link className="secondary-button" href={decision.owningHref}>
                  Open owning renewal record
                </Link>
                {decision.propertyKey ? (
                  <Link
                    className="secondary-button"
                    href={
                      buildPropertyHistoryHref(decision.propertyKey, decision.owningHref)!
                    }
                  >
                    Open property history
                  </Link>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
