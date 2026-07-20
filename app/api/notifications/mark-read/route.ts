import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { AuthError, hasSpaceAccess, requireCapability } from "@/lib/auth/session";
import { markApprovalQueueNotificationRead } from "@/lib/firestore/approval-queue-notifications";
import { markMaintenanceTicketNotificationRead } from "@/lib/firestore/maintenance-ticket-notifications";
import { markGmailWorkflowNotificationRead } from "@/lib/gmail-hub/notifications";
import { MarkNotificationReadInputSchema } from "@/lib/firestore/schemas";

// POST a source-dispatched mark-read. A single static route (no dynamic segment): the body names the
// source, and each per-source writer enforces recipient-only ownership. Read-gated.
export async function POST(request: Request) {
  try {
    const user = await requireCapability("read");
    const input = await parseJsonBody(request, MarkNotificationReadInputSchema);

    if (input.source === "approval_queue") {
      // F-NOTIF-3: approval-queue notifications are personal (addressed to a specific recipient), so a
      // recipient can always mark their OWN one read regardless of space scope. The writer enforces
      // recipient ownership (recipient_uid === actor.uid), which is the correct and sufficient guard;
      // a space-scope pre-check here would dead-end a legitimate assignee/approver who lacks the scope.
      await markApprovalQueueNotificationRead(user, input.id);
    } else if (input.source === "maintenance_ticket") {
      if (!hasSpaceAccess(user, "maintenance")) {
        throw new AuthError("This user is not authorized for the requested space.", 403);
      }
      await markMaintenanceTicketNotificationRead(user, input.id);
    } else {
      await markGmailWorkflowNotificationRead(user, input.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
