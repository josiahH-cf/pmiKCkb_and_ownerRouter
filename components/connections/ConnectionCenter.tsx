// The Connection Center — the app-managed place to connect the systems that power every process
// (RentVine, Sheets, RentCast, Drive, Dotloop, LeadSimple, Gmail, QuickBooks). Shared infrastructure,
// not tied to one process. Server component; live checks are read-only and cached (S13 D1), and no
// secret value ever reaches this surface. Non-Admins get the same status, read-only (decision 6).

import Link from "next/link";

import { Metric, ModeChip, PageHeader } from "@/components/ui";
import { ConnectorCard } from "@/components/connections/ConnectorCard";
import type { ConnectionCenterView } from "@/lib/connections/connection-status";
import { groupConnectionItems } from "@/lib/navigation/admin-connections";

export function ConnectionCenter({
  view,
  canManage,
  verifiableIds = [],
}: Readonly<{
  view: ConnectionCenterView;
  canManage: boolean;
  verifiableIds?: readonly string[];
}>) {
  const groups = groupConnectionItems(view.items);

  return (
    <div className="ui-stack">
      <PageHeader
        actions={
          <>
            <ModeChip>Read-only checks</ModeChip>
            {canManage ? (
              <Link href="/admin#admin-task-index">Open Admin task index</Link>
            ) : null}
          </>
        }
        subtitle="Review source-backed setup and read-only verification by task. Connection status does not grant action authority."
        title="Connections"
      />

      <p className="notice" role="note">
        Connection status does not grant action authority. Closed actions, runtime
        suspensions, exact confirmation, and provider readiness remain separate checks.
      </p>

      <div className="ui-metric-grid">
        <Metric label="Connected" value={view.summary.connected} />
        <Metric label="Need attention" value={view.summary.action} />
        <Metric label="Not connected" value={view.summary.none} />
        <Metric label="Closed by governance" value={view.summary.closed} />
      </div>

      {groups.map((group) => (
        <section
          aria-labelledby={`${group.anchorId}-title`}
          className="connection-task-section task-anchor"
          id={group.anchorId}
          key={group.id}
          tabIndex={-1}
        >
          <div>
            <h2 className="section-subtitle" id={`${group.anchorId}-title`}>
              {group.label}
            </h2>
            <p className="muted">{group.description}</p>
          </div>
          <div className="grid two">
            {group.items.map((item) => (
              <ConnectorCard
                canManage={canManage}
                item={item}
                key={item.def.id}
                verifiable={verifiableIds.includes(item.def.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
