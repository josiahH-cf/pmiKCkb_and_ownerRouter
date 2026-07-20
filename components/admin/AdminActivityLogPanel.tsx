import type { AdminActivityEntry } from "@/lib/admin/activity-log";

// LR-02 (admin-audit): read-only "who changed whose access, and why" history on the Admin page. The
// page that renders this is Admin-gated; the records are append-only and server-written. Nothing here
// writes or sends.
export function AdminActivityLogPanel({
  entries,
  unavailableNote,
}: Readonly<{ entries: AdminActivityEntry[]; unavailableNote?: string }>) {
  return (
    <article className="panel" aria-label="Access changes">
      <h2>Access Changes</h2>
      <p className="muted">
        Recent role and space-access changes, newest first: what changed, who it affected,
        who made it, and the reason they gave. Read-only history; nothing is emailed.
      </p>
      {unavailableNote ? <p className="muted">{unavailableNote}</p> : null}
      {entries.length === 0 ? (
        <p className="muted">No access changes recorded yet.</p>
      ) : (
        <div className="workflow-record-list">
          {entries.map((entry) => (
            <article className="compact-record" key={entry.id}>
              <div className="workflow-record-heading">
                <div>
                  <strong>{entry.summary}</strong>
                  <p className="muted">
                    {formatChangedAt(entry.createdAt)} · {entry.targetEmail} · by{" "}
                    {entry.actorEmail}
                  </p>
                </div>
              </div>
              <p>Reason: {entry.reason}</p>
            </article>
          ))}
        </div>
      )}
    </article>
  );
}

// Deterministic, locale-independent "YYYY-MM-DD HH:MM" from an ISO instant (server-rendered, so it must
// not depend on the viewer's locale). Non-ISO values pass through unchanged.
function formatChangedAt(createdAt: string): string {
  return /^\d{4}-\d{2}-\d{2}T/.test(createdAt)
    ? `${createdAt.slice(0, 10)} ${createdAt.slice(11, 16)}`
    : createdAt;
}
