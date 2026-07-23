import type { SupportReportRecord } from "@/lib/firestore/types";

// Admin review surface for the support queue (F-SUPP-1). Read-only list of recent "Report an issue"
// submissions, newest first, so reported problems reach a human instead of a write-only log. The page
// that renders this is Admin-gated; the reporter's description is shown here for triage.
export function SupportReportsPanel({
  reports,
  unavailableNote,
  newCount,
  followUpDueCount,
}: Readonly<{
  reports: SupportReportRecord[];
  unavailableNote?: string;
  /** Value-free counts from the shared gatherSupportAttention (same numbers the notifications hub shows). */
  newCount?: number;
  followUpDueCount?: number;
}>) {
  return (
    <article className="panel" aria-label="Feedback">
      <div className="notifications-lane-head">
        <h2>Feedback</h2>
        {newCount !== undefined || followUpDueCount !== undefined ? (
          <span className="console-deck-count" data-testid="support-followup-badge">
            {followUpDueCount ?? 0}
          </span>
        ) : null}
      </div>
      {newCount !== undefined || followUpDueCount !== undefined ? (
        <p className="muted">
          <strong data-testid="support-new-count">{newCount ?? 0}</strong> new
          {" · "}
          <strong data-testid="support-followup-count">
            {followUpDueCount ?? 0}
          </strong>{" "}
          past the follow-up window
        </p>
      ) : null}
      <p className="muted">
        Feedback teammates shared with the &ldquo;Feedback&rdquo; button: ideas,
        questions, or problems. Each note is filed here for review, and one metadata-only
        internal notice goes to the configured staff destination (the note itself stays
        here).
      </p>
      {unavailableNote ? <p className="muted">{unavailableNote}</p> : null}
      {reports.length === 0 ? (
        <p className="muted">No reports yet.</p>
      ) : (
        <div className="workflow-record-list">
          {reports.map((report) => (
            <article className="compact-record" key={report.id}>
              <div className="workflow-record-heading">
                <div>
                  <strong>{report.route}</strong>
                  <p className="muted">
                    {formatReportedAt(report.created_at)} · {report.reporter_role}
                    {report.origin === "error_boundary"
                      ? " · from an app error"
                      : ""} · {report.status}
                  </p>
                </div>
              </div>
              {report.description ? (
                <p>{report.description}</p>
              ) : (
                <p className="muted">No description was provided.</p>
              )}
              {report.error_digest ? (
                <p className="muted">Error reference: {report.error_digest}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </article>
  );
}

// Deterministic, locale-independent "YYYY-MM-DD HH:MM" from an ISO instant (server-rendered, so it
// must not depend on the viewer's locale). Non-ISO values (e.g. the seed sentinel) pass through.
function formatReportedAt(createdAt: string): string {
  return /^\d{4}-\d{2}-\d{2}T/.test(createdAt)
    ? `${createdAt.slice(0, 10)} ${createdAt.slice(11, 16)}`
    : createdAt;
}
