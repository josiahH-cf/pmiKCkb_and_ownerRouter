import Link from "next/link";
import type {
  RenewalReviewBoard,
  RenewalReviewFlag,
} from "@/lib/approval/renewal-review";

// Read-only renewal review sub-tab body (OQ-UI-1). Value-free triage of open reconciliation flags,
// grouped by run, that routes Dan to the built resolve surface. No approve/write affordance lives
// here — resolution happens on each run page via the resolve flow (Q-PREC-1).
function ReviewFlagRow({ flag }: Readonly<{ flag: RenewalReviewFlag }>) {
  return (
    <li className="ui-spread">
      <Link className="text-link" href={flag.href}>
        <strong>{flag.fieldLabel}</strong>
        <span className="muted"> — {flag.actionNeeded}</span>
      </Link>
      <span className="renewal-review-flag-tags">
        <span className="queue-pill" data-value={flag.severity}>
          {flag.severity}
        </span>
        {flag.proposalReady ? <span className="ui-tag">Proposal ready</span> : null}
        {flag.resolved ? <span className="ui-tag">Resolved</span> : null}
      </span>
    </li>
  );
}

export function RenewalReviewPanel({ board }: Readonly<{ board?: RenewalReviewBoard }>) {
  if (!board || board.runs.length === 0) {
    return (
      <section className="panel" aria-label="Renewal review">
        <p className="muted">No renewals are awaiting review right now.</p>
      </section>
    );
  }

  const proposalsAwaitingApproval = board.runs.reduce(
    (count, run) => count + run.proposalsAwaitingApproval,
    0,
  );
  const proposalsApproved = board.runs.reduce(
    (count, run) => count + run.proposalsApproved,
    0,
  );

  return (
    <div className="ui-stack renewal-review" aria-label="Renewal review">
      <p className="muted">
        {board.totalOpenFlags} open reconciliation flag
        {board.totalOpenFlags === 1 ? "" : "s"} across {board.totalRuns} renewal run
        {board.totalRuns === 1 ? "" : "s"}. Resolve each on its run page — the app never
        writes to the sheet without your approval.
      </p>
      {proposalsAwaitingApproval > 0 || proposalsApproved > 0 ? (
        <p className="muted">
          {proposalsAwaitingApproval} write-back proposal
          {proposalsAwaitingApproval === 1 ? "" : "s"} awaiting your approval
          {proposalsApproved > 0
            ? ` · ${proposalsApproved} approved (ready to write, not executed)`
            : ""}
          .
        </p>
      ) : null}

      {board.runs.map((run) => {
        // Resolved flags are background, not work: they collapse to a counts-only section by
        // default (S13 B4) so the list asks only for what still needs a decision.
        const openFlags = run.flags.filter((flag) => !flag.resolved);
        const resolvedFlags = run.flags.filter((flag) => flag.resolved);

        return (
          <article className="panel ui-stack" key={run.runId}>
            <div className="ui-spread">
              <div>
                <h3 className="ui-card-title">{run.label}</h3>
                <p className="muted">
                  {run.openFlags} open / {run.totalFlags} total
                  {run.highSeverityOpen > 0
                    ? ` · ${run.highSeverityOpen} need Admin`
                    : ""}
                  {run.blockedOpen > 0 ? ` · ${run.blockedOpen} blocked` : ""}
                  {run.proposalsAwaitingApproval > 0
                    ? ` · ${run.proposalsAwaitingApproval} awaiting approval`
                    : ""}
                  {run.proposalsApproved > 0
                    ? ` · ${run.proposalsApproved} approved`
                    : ""}
                </p>
              </div>
              <Link className="secondary-button" href={run.href}>
                Review &amp; resolve →
              </Link>
            </div>

            {openFlags.length === 0 ? (
              <p className="muted">Nothing in this run needs a decision.</p>
            ) : (
              <ul className="ui-rows">
                {openFlags.map((flag) => (
                  <ReviewFlagRow flag={flag} key={flag.fieldKey} />
                ))}
              </ul>
            )}

            {resolvedFlags.length > 0 ? (
              <details className="ui-collapse">
                <summary>
                  <span className="ui-card-title">{resolvedFlags.length} resolved</span>
                  <span className="muted"> Already done. Open to view.</span>
                </summary>
                <ul className="ui-rows">
                  {resolvedFlags.map((flag) => (
                    <ReviewFlagRow flag={flag} key={flag.fieldKey} />
                  ))}
                </ul>
              </details>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
