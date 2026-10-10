import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { can } from "@/lib/auth/roles";
import { businessMonth } from "@/lib/lease-renewal/business-calendar";
import { MaintenanceHistoryReports } from "@/components/maintenance/MaintenanceHistoryReports";
function currentBusinessMonth() {
  return businessMonth(Date.now());
}
export default async function MaintenanceHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ report_id?: string }>;
}) {
  await requirePageSpaceAccess("maintenance");
  const actor = await requirePageCapability("read"),
    params = await searchParams;
  return (
    <AppShell user={actor}>
      <main className="content content--workspace">
        <Suspense fallback={<p role="status">Loading maintenance reports…</p>}>
          <MaintenanceHistoryReports
            actorUid={actor.uid}
            canEdit={can(actor.role, "edit")}
            initialMonth={currentBusinessMonth()}
            initialReportId={params?.report_id}
          />
        </Suspense>
        {!can(actor.role, "edit") ? (
          <RequestAccessLink surface="maintenance.history.edit" />
        ) : null}
      </main>
    </AppShell>
  );
}
