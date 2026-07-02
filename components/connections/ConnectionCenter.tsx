// The Connection Center — the app-managed place to connect the systems that power every process
// (RentVine, Sheets, Drive, Dotloop, LeadSimple, Gmail sender, QuickBooks). Shared infrastructure,
// not tied to one process. Server component; live checks are read-only and cached (S13 D1), and no
// secret value ever reaches this surface. Non-Admins get the same status, read-only (decision 6).

import { Metric, ModeChip, PageHeader } from "@/components/ui";
import { ConnectorCard } from "@/components/connections/ConnectorCard";
import type { ConnectionCenterView } from "@/lib/connections/connection-status";

export function ConnectionCenter({
  view,
  canManage,
  verifiableIds = [],
}: Readonly<{
  view: ConnectionCenterView;
  canManage: boolean;
  verifiableIds?: readonly string[];
}>) {
  return (
    <div className="ui-stack">
      <PageHeader
        actions={<ModeChip>Read-only checks</ModeChip>}
        subtitle="Connect the systems the app reads from. The app stores the credentials and checks each connection."
        title="Connections"
      />

      <div className="ui-metric-grid">
        <Metric label="Connected" value={view.summary.connected} />
        <Metric label="Need attention" value={view.summary.action} />
        <Metric label="Not connected" value={view.summary.none} />
      </div>

      <div className="grid two">
        {view.items.map((item) => (
          <ConnectorCard
            canManage={canManage}
            item={item}
            key={item.def.id}
            verifiable={verifiableIds.includes(item.def.id)}
          />
        ))}
      </div>
    </div>
  );
}
