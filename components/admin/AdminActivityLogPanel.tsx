import type { AdminActivityEntry } from "@/lib/admin/activity-log";

// LR-02 + S51: read-only Admin history. The page that renders this is Admin-gated; the records are
// append-only and server-written. Nothing here writes, sends, or changes a runtime suspension.
export function AdminActivityLogPanel({
  entries,
  unavailableNote,
}: Readonly<{ entries: AdminActivityEntry[]; unavailableNote?: string }>) {
  return (
    <article className="panel" aria-label="Admin activity">
      <h2>Admin Activity</h2>
      <p className="muted">
        Recent access and Production action-stop changes, newest first. This is read-only
        history; nothing is changed or emailed here.
      </p>
      {unavailableNote ? (
        <p className="muted">{unavailableNote}</p>
      ) : entries.length === 0 ? (
        <p className="muted">No Admin changes recorded yet.</p>
      ) : (
        <div className="workflow-record-list">
          {entries.map((entry) => (
            <article className="compact-record" key={entry.id}>
              <div className="workflow-record-heading">
                <div>
                  <strong>{entry.summary}</strong>
                  <p className="muted">
                    {formatChangedAt(entry.createdAt)}
                    {entry.kind === "runtime_suspension"
                      ? ` · by ${entry.actorEmail}`
                      : ` · ${entry.targetEmail} · by ${entry.actorEmail}`}
                  </p>
                </div>
              </div>
              {entry.kind === "runtime_suspension" ? (
                <p>
                  Action key: <code>{entry.actionKey}</code>
                </p>
              ) : null}
              <p>Reason: {entry.reason}</p>
              {entry.kind === "runtime_suspension" && entry.incidentRef ? (
                <p>
                  Incident reference: <code>{entry.incidentRef}</code>
                </p>
              ) : null}
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
