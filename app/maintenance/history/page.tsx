import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import {
  listMaintenanceTickets,
  listMaintenanceTicketActivity,
} from "@/lib/firestore/maintenance-tickets";
import { MAINTENANCE_RETIREMENT_MESSAGE } from "@/lib/maintenance/retirement";
import { businessMonth } from "@/lib/lease-renewal/business-calendar";
import { MaintenanceHistoryReports } from "@/components/maintenance/MaintenanceHistoryReports";
function currentBusinessMonth() {
  return businessMonth(Date.now());
}
export default async function MaintenanceHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ report_id?: string; ticket_id?: string }>;
}) {
  await requirePageSpaceAccess("maintenance");
  const actor = await requirePageCapability("read"),
    params = await searchParams;
  const tickets = await listMaintenanceTickets(actor).catch(() => null);
  const selected = tickets?.find((ticket) => ticket.id === params?.ticket_id);
  const activity = selected
    ? await listMaintenanceTicketActivity(actor, selected.id).catch(() => null)
    : [];
  return (
    <AppShell user={actor}>
      <main className="content content--workspace">
        <h1 className="section-title">Read-only maintenance history</h1>
        <p>{MAINTENANCE_RETIREMENT_MESSAGE}</p>
        {tickets === null ? (
          <p role="status">
            Retained tickets are unavailable. Reload to retry; no record was changed.
          </p>
        ) : (
          <ul>
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <a
                  href={`/maintenance/history?ticket_id=${encodeURIComponent(ticket.id)}`}
                >
                  {ticket.summary}
                </a>{" "}
                · {ticket.unit?.label ?? "Location not recorded"} · recorded status:{" "}
                {ticket.status}
              </li>
            ))}
          </ul>
        )}
        {selected ? (
          <section aria-label="Retained ticket activity">
            <h2>{selected.summary}</h2>
            {activity === null ? (
              <p role="status">Recorded activity is unavailable. Reload to retry.</p>
            ) : (
              <ol>
                {activity.map((entry) => (
                  <li key={entry.id}>
                    {entry.created_at} · {entry.text ?? entry.action}
                  </li>
                ))}
              </ol>
            )}
            <p>
              <a
                href={`/api/maintenance/tickets/${encodeURIComponent(selected.id)}/history`}
              >
                Read the complete retained ticket timeline
              </a>
            </p>
          </section>
        ) : null}
        <Suspense fallback={<p role="status">Loading maintenance reports…</p>}>
          <MaintenanceHistoryReports
            actorUid={actor.uid}
            canEdit={false}
            initialMonth={currentBusinessMonth()}
            initialReportId={params?.report_id}
          />
        </Suspense>
      </main>
    </AppShell>
  );
}
