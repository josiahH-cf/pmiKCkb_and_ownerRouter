// StatusDot — a small connection/health indicator (connected / action / none). With a label it
// renders an inline dot+text; without one, a bare decorative dot. Server-safe.

export type ConnectionStatus = "connected" | "action" | "none";

export function StatusDot({
  status,
  label,
}: Readonly<{ status: ConnectionStatus; label?: string }>) {
  if (!label) {
    return <span aria-hidden="true" className="ui-status-dot" data-status={status} />;
  }

  return (
    <span className="ui-status-label">
      <span aria-hidden="true" className="ui-status-dot" data-status={status} />
      {label}
    </span>
  );
}
