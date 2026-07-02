// The Connection Center — the app-managed place to connect the systems that power every process
// (RentVine, Sheets, Drive, Dotloop, LeadSimple, QuickBooks). Shared infrastructure, not tied to one
// process. Server component; status is read-only (no live call yet) and shows no secret values.

import { Metric, ModeChip, PageHeader } from "@/components/ui";
import { ConnectorCard } from "@/components/connections/ConnectorCard";
import type { ConnectionCenterView } from "@/lib/connections/connection-status";

export function ConnectionCenter({ view }: Readonly<{ view: ConnectionCenterView }>) {
  return (
    <div className="ui-stack">
      <PageHeader
        actions={<ModeChip>Read-only preview</ModeChip>}
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
          <ConnectorCard item={item} key={item.def.id} />
        ))}
      </div>
    </div>
  );
}
