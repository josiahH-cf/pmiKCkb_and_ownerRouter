import Link from "next/link";

import { Card } from "@/components/ui";
import { formatPreapprovalAmount } from "@/lib/maintenance/property-preapproval";
import {
  MAINTENANCE_WAITING_ON_LABELS,
  type MaintenanceWaitingOnProjection,
} from "@/lib/maintenance/waiting-on";

export interface MaintenanceBlockerRow {
  readonly ticketId: string;
  readonly summary: string;
  readonly unitLabel: string | null;
  readonly assigneeLabel: string | null;
  readonly lastActivityIso: string;
  readonly projection: MaintenanceWaitingOnProjection;
}

/**
 * S108: the read-only blocker report. Every value is projected from records this app already holds;
 * the report writes nothing, reaches no provider, and offers no action of its own.
 *
 * The RentVine column shows the exact work-order number and links to the ticket, where the governed
 * work-order read opens that exact record. The app builds no RentVine dashboard URL: none is
 * documented, and this project never guesses one.
 */
export function MaintenanceBlockerReport({
  rows,
  unavailableNote,
}: Readonly<{ rows: readonly MaintenanceBlockerRow[]; unavailableNote?: string }>) {
  return (
    <Card
      ariaLabel="What each ticket is waiting on"
      title="What each ticket is waiting on"
    >
      {unavailableNote ? <p className="muted">{unavailableNote}</p> : null}
      {rows.length === 0 ? (
        <p className="muted">No open ticket is waiting on anything right now.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <caption className="sr-only">
              Open maintenance tickets with their blocker, estimate, preapproval,
              assignee, last activity, and RentVine work order.
            </caption>
            <thead>
              <tr>
                <th scope="col">Ticket</th>
                <th scope="col">Unit</th>
                <th scope="col">Waiting on</th>
                <th scope="col">Estimate</th>
                <th scope="col">Preapproval</th>
                <th scope="col">Assignee</th>
                <th scope="col">Last activity</th>
                <th scope="col">RentVine</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.ticketId}>
                  <th scope="row">
                    <Link
                      href={`/maintenance?ticket_id=${encodeURIComponent(row.ticketId)}`}
                    >
                      {row.summary}
                    </Link>
                  </th>
                  <td>{row.unitLabel ?? "Needs Verification"}</td>
                  <td>
                    {MAINTENANCE_WAITING_ON_LABELS[row.projection.waitingOn]}
                    <span className="muted"> · {row.projection.nextAction}</span>
                  </td>
                  <td>
                    {row.projection.estimateAmountCents === null
                      ? "Not recorded"
                      : formatPreapprovalAmount(row.projection.estimateAmountCents)}
                  </td>
                  <td>
                    {row.projection.preapprovalAmountCents === null
                      ? "None recorded"
                      : formatPreapprovalAmount(row.projection.preapprovalAmountCents)}
                  </td>
                  <td>{row.assigneeLabel ?? "Unassigned"}</td>
                  <td>{row.lastActivityIso.slice(0, 10)}</td>
                  <td>
                    {row.projection.providerWorkOrderId ? (
                      <Link
                        href={`/maintenance?ticket_id=${encodeURIComponent(row.ticketId)}`}
                      >
                        Work order {row.projection.providerWorkOrderId}
                      </Link>
                    ) : (
                      "No work order"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
