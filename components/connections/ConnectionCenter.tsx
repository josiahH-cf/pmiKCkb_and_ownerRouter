// The Connection Center — the app-managed place to connect the systems that power every process
// (RentVine, Sheets, RentCast, Drive, Dotloop, LeadSimple, Gmail, QuickBooks). Shared infrastructure,
// not tied to one process. Server component; live checks are read-only and cached (S13 D1), and no
// secret value ever reaches this surface. Non-Admins get the same status, read-only (decision 6).

import Link from "next/link";
import type { DotloopReadiness } from "@/lib/connections/dotloop-readiness";
import type { DotloopCallbackResult } from "@/lib/connections/dotloop-callback-result";
import type { DotloopPickerView } from "@/lib/connections/dotloop-resource-selection";

import type { ReactNode } from "react";

import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { Metric, ModeChip, PageHeader } from "@/components/ui";
import { ConnectorCard } from "@/components/connections/ConnectorCard";
import {
  DotloopConnectionPanel,
  type DotloopSelectionSummary,
} from "@/components/connections/DotloopConnectionPanel";
import type { ConnectionCenterView } from "@/lib/connections/connection-status";
import { groupConnectionItems } from "@/lib/navigation/admin-connections";
import { RetiredGmailSetup } from "@/components/connections/RetiredGmailSetup";

export function ConnectionCenter({
  view,
  canManage,
  verifiableIds = [],
  dotloopReadiness,
  dotloopPicker = null,
  dotloopSelection = null,
  dotloopCallbackResult = null,
  resourcePanel = null,
  needsSetup,
}: Readonly<{
  view: ConnectionCenterView;
  dotloopReadiness?: DotloopReadiness;
  /** S106: Admin-only cached resource list for the picker; null for other roles. */
  dotloopPicker?: DotloopPickerView | null;
  dotloopSelection?: DotloopSelectionSummary | null;
  /** S106: the code-free outcome the authorization callback returned to this screen. */
  dotloopCallbackResult?: DotloopCallbackResult | null;
  canManage: boolean;
  verifiableIds?: readonly string[];
  /** S120: the page-supplied shared renewal resource entries, mounted after the documents group. */
  resourcePanel?: ReactNode;
  /**
   * S147: connectors this user's Spaces use that are unconfigured or partly configured. This list
   * moved here from the Dashboard card; each row links to its connector card below.
   */
  needsSetup?: readonly { label: string; detail?: string; href: string }[];
}>) {
  const groups = groupConnectionItems(view.items);

  return (
    <div className="ui-stack">
      <RetiredGmailSetup />
      <PageHeader
        actions={
          <>
            <ModeChip>Read-only checks</ModeChip>
            {canManage ? (
              <Link href="/admin#admin-task-index">Open Admin task index</Link>
            ) : (
              <RequestAccessLink surface="connections.manage">
                Request connection-management access
              </RequestAccessLink>
            )}
          </>
        }
        title="Connections"
      />

      <p className="notice" role="note">
        Connection status does not grant action authority. Closed actions, runtime
        suspensions, exact confirmation, and provider readiness remain separate checks.
      </p>

      {dotloopReadiness ? (
        <DotloopConnectionPanel
          callbackResult={dotloopCallbackResult}
          canManage={canManage}
          picker={canManage ? dotloopPicker : null}
          readiness={dotloopReadiness}
          selection={dotloopSelection}
        />
      ) : null}

      <div className="ui-metric-grid">
        <Metric label="Connected" value={view.summary.connected} />
        <Metric label="Need attention" value={view.summary.action} />
        <Metric label="Not connected" value={view.summary.none} />
        <Metric label="Closed by governance" value={view.summary.closed} />
      </div>

      {needsSetup ? (
        <section aria-label="Needs setup" className="panel">
          <h2 className="section-subtitle">Needs setup</h2>
          {needsSetup.length === 0 ? (
            <p className="muted">Every connector is configured.</p>
          ) : (
            <ul className="connection-needs-setup">
              {needsSetup.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                  {item.detail ? <span className="muted"> · {item.detail}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {groups.map((group) => (
        <div className="ui-stack" key={group.id}>
          <section
            aria-labelledby={`${group.anchorId}-title`}
            className="connection-task-section task-anchor"
            id={group.anchorId}
            tabIndex={-1}
          >
            <div>
              <h2 className="section-subtitle" id={`${group.anchorId}-title`}>
                {group.label}
              </h2>
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
          {group.id === "documents-storage" ? resourcePanel : null}
        </div>
      ))}
    </div>
  );
}
