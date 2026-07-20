import type { SupportReportRecord } from "@/lib/firestore/types";

// Admin review surface for the support queue (F-SUPP-1). Read-only list of recent "Report an issue"
// submissions, newest first, so reported problems reach a human instead of a write-only log. The page
// that renders this is Admin-gated; the reporter's description is shown here for triage.
export function SupportReportsPanel({
  reports,
  unavailableNote,
}: Readonly<{ reports: SupportReportRecord[]; unavailableNote?: string }>) {
  return (
    <article className="panel" aria-label="Reported issues">
      <h2>Reported Issues</h2>
      <p className="muted">
        Problems teammates reported with the &ldquo;Report an issue&rdquo; button. Each
        report is filed here for review; nothing is emailed.
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
