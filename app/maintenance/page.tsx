import { AppShell } from "@/components/layout/AppShell";
import { MaintenanceCapture } from "@/components/maintenance/MaintenanceCapture";
import { MaintenanceQueue } from "@/components/maintenance/MaintenanceQueue";
import { UnverifiedIntakeReview } from "@/components/maintenance/UnverifiedIntakeReview";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { listUnverifiedIntake } from "@/lib/firestore/maintenance-intake-review";
import {
  type MaintenanceTicketRecord,
  listMaintenanceTickets,
} from "@/lib/firestore/maintenance-tickets";
import type { UnverifiedIntakeRecord } from "@/lib/maintenance/intake-model";

export default async function MaintenancePage() {
  // Capture is editor work (it produces a work-order draft); read-only users don't see it.
  const user = await requirePageCapability("edit");

  // The persisted ticket queue (console overhaul Slice E) + the public-intake triage queue (2d).
  // Read-only + non-fatal: a Firestore hiccup degrades each to a clear note rather than 500-ing the desk.
  let tickets: MaintenanceTicketRecord[] = [];
  let unavailableNote: string | undefined;
  try {
    tickets = await listMaintenanceTickets(user);
  } catch {
    unavailableNote =
      "The ticket queue is unavailable in this session. Refresh Google credentials (npm run auth:session) or check the Firestore setup, then reload.";
  }

  let intake: UnverifiedIntakeRecord[] = [];
  let intakeUnavailableNote: string | undefined;
  try {
    intake = await listUnverifiedIntake(user);
  } catch {
    intakeUnavailableNote =
      "The unverified-intake queue is unavailable in this session. Refresh Google credentials (npm run auth:session) or check the Firestore setup, then reload.";
  }

  return (
    <AppShell user={user}>
      <section className="content ui-stack">
        <h1 className="section-title">Maintenance Work Order Intake</h1>
        <p className="muted">
          Capture a maintenance issue (type or record the problem and the unit), build a
          work-order draft, then create a tracked ticket. Nothing is sent or written to a
          system of record; the RentVine work order is created only after a human
          approves.
        </p>
        <MaintenanceCapture reporterUid={user.uid} />
        <UnverifiedIntakeReview
          initialIntake={intake}
          unavailableNote={intakeUnavailableNote}
        />
        <MaintenanceQueue initialTickets={tickets} unavailableNote={unavailableNote} />
      </section>
    </AppShell>
  );
}
