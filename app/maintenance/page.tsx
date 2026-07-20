import { AppShell } from "@/components/layout/AppShell";
import { MaintenanceCapture } from "@/components/maintenance/MaintenanceCapture";
import { MaintenanceExecutionReadiness } from "@/components/maintenance/MaintenanceExecutionReadiness";
import { MaintenanceQueue } from "@/components/maintenance/MaintenanceQueue";
import { UnverifiedIntakeReview } from "@/components/maintenance/UnverifiedIntakeReview";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { listUnverifiedIntake } from "@/lib/firestore/maintenance-intake-review";
import {
  type MaintenanceTicketRecord,
  listMaintenanceTestActionReceipts,
  listMaintenanceTickets,
} from "@/lib/firestore/maintenance-tickets";
import type { AssignableUser } from "@/lib/maintenance/assignee-model";
import { listAssignableUsers } from "@/lib/maintenance/assignees";
import type { UnverifiedIntakeRecord } from "@/lib/maintenance/intake-model";
import { getMaintenancePhotoActionView } from "@/lib/maintenance/photo-action";
import type { MaintenanceTestActionReceipt } from "@/lib/maintenance/test-workflow";

interface MaintenancePageProps {
  searchParams?: Promise<{ ticket_id?: string }>;
}

export default async function MaintenancePage({ searchParams }: MaintenancePageProps) {
  const focusedTicketId = (await searchParams)?.ticket_id?.trim() || undefined;
  await requirePageSpaceAccess("maintenance");
  // Capture is editor work (it produces a work-order draft); read-only users don't see it.
  const user = await requirePageCapability("edit");

  // The persisted ticket queue (console overhaul Slice E) + the public-intake triage queue (2d).
  // Read-only + non-fatal: a Firestore hiccup degrades each to a clear note rather than 500-ing the desk.
  let tickets: MaintenanceTicketRecord[] = [];
  let testReceipts: MaintenanceTestActionReceipt[] = [];
  let unavailableNote: string | undefined;
  try {
    tickets = await listMaintenanceTickets(user);
    testReceipts = await listMaintenanceTestActionReceipts(user);
  } catch {
    unavailableNote =
      "The ticket queue isn't available right now. Try reloading in a minute; if it keeps happening, let your administrator know.";
  }

  let intake: UnverifiedIntakeRecord[] = [];
  let intakeUnavailableNote: string | undefined;
  try {
    intake = await listUnverifiedIntake(user);
  } catch {
    intakeUnavailableNote =
      "The new-request queue isn't available right now. Try reloading in a minute; if it keeps happening, let your administrator know.";
  }

  // The assignable-user roster for the per-ticket picker (edit-gated; demo-aware). Non-fatal: if the
  // roster is unavailable the queue simply offers "Unassigned" only, rather than 500-ing the desk.
  let assignees: AssignableUser[] = [];
  try {
    assignees = await listAssignableUsers();
  } catch {
    assignees = [];
  }

  return (
    <AppShell user={user}>
      <section className="content ui-stack">
        <h1 className="section-title">Maintenance Work Order Intake</h1>
        <p className="muted">
          Capture a maintenance issue (type or record the problem and the unit), build a
          work-order draft, then create a tracked Live ticket. The production Test
          workspace below uses reserved invented aliases and supports the same in-app
          lifecycle plus internal simulation receipts. Every Live external write remains
          an explicit, target-labeled, human-confirmed action through its configured
          provider gate.
        </p>
        <MaintenanceCapture
          reporterUid={user.uid}
          photoAction={getMaintenancePhotoActionView()}
        />
        <UnverifiedIntakeReview
          initialIntake={intake}
          unavailableNote={intakeUnavailableNote}
        />
        <MaintenanceQueue
          initialTickets={tickets}
          unavailableNote={unavailableNote}
          assignees={assignees}
          currentUid={user.uid}
          initialTestReceipts={testReceipts}
          focusedTicketId={focusedTicketId}
        />
        <MaintenanceExecutionReadiness />
      </section>
    </AppShell>
  );
}
