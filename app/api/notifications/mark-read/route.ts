import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { markApprovalQueueNotificationRead } from "@/lib/firestore/approval-queue-notifications";
import { markMaintenanceTicketNotificationRead } from "@/lib/firestore/maintenance-ticket-notifications";
import { MarkNotificationReadInputSchema } from "@/lib/firestore/schemas";

// POST a source-dispatched mark-read. A single static route (no dynamic segment): the body names the
// source, and each per-source writer enforces recipient-only ownership. Read-gated.
export async function POST(request: Request) {
  try {
    const user = await requireCapability("read");
    const input = await parseJsonBody(request, MarkNotificationReadInputSchema);

    if (input.source === "approval_queue") {
      await markApprovalQueueNotificationRead(user, input.id);
    } else {
      await markMaintenanceTicketNotificationRead(user, input.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
