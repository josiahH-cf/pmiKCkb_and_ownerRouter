import { AppShell } from "@/components/layout/AppShell";
import { MaintenanceCapture } from "@/components/maintenance/MaintenanceCapture";
import { requirePageCapability } from "@/lib/auth/page-guards";

export default async function MaintenancePage() {
  // Capture is editor work (it produces a work-order draft); read-only users don't see it.
  const user = await requirePageCapability("edit");

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Maintenance Work Order Intake</h1>
        <p className="muted">
          Capture a maintenance issue — type or record the problem and the unit — and get
          a work-order draft for review. Nothing is sent or written; the RentVine work
          order is created only after a human approves.
        </p>
        <MaintenanceCapture reporterUid={user.uid} />
      </section>
    </AppShell>
  );
}
