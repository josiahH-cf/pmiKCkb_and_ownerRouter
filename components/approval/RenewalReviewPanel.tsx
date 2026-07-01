import Link from "next/link";
import type { RenewalReviewBoard } from "@/lib/approval/renewal-review";

// Read-only renewal review sub-tab body (OQ-UI-1). Value-free triage of open reconciliation flags,
// grouped by run, that routes Dan to the built resolve surface. No approve/write affordance lives
// here — resolution happens on each run page via the resolve flow (Q-PREC-1).
export function RenewalReviewPanel({ board }: Readonly<{ board?: RenewalReviewBoard }>) {
  if (!board || board.runs.length === 0) {
    return (
      <section className="panel" aria-label="Renewal review">
        <p className="muted">No renewals are awaiting review right now.</p>
      </section>
    );
  }

  return (
    <div className="ui-stack renewal-review" aria-label="Renewal review">
      <p className="muted">
        {board.totalOpenFlags} open reconciliation flag
        {board.totalOpenFlags === 1 ? "" : "s"} across {board.totalRuns} renewal run
        {board.totalRuns === 1 ? "" : "s"}. Resolve each on its run page — the app never
        writes to the sheet without your approval.
      </p>

      {board.runs.map((run) => (
        <article className="panel ui-stack" key={run.runId}>
          <div className="ui-spread">
            <div>
              <h3 className="ui-card-title">{run.label}</h3>
              <p className="muted">
                {run.openFlags} open / {run.totalFlags} total
                {run.highSeverityOpen > 0 ? ` · ${run.highSeverityOpen} need Admin` : ""}
                {run.blockedOpen > 0 ? ` · ${run.blockedOpen} blocked` : ""}
              </p>
            </div>
            <Link className="secondary-button" href={run.href}>
              Review &amp; resolve →
            </Link>
          </div>

          <ul className="ui-rows">
            {run.flags.map((flag) => (
              <li className="ui-spread" key={flag.fieldKey}>
                <Link className="text-link" href={flag.href}>
                  <strong>{flag.fieldLabel}</strong>
                  <span className="muted"> — {flag.actionNeeded}</span>
                </Link>
                <span className="renewal-review-flag-tags">
                  <span className="queue-pill" data-value={flag.severity}>
                    {flag.severity}
                  </span>
                  {flag.resolved ? <span className="ui-tag">Resolved</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
