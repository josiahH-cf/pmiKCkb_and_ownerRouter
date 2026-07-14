import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { hasSpaceAccess, requireCapability } from "@/lib/auth/session";
import {
  listApprovalQueueNotifications,
  markApprovalQueueNotificationRead,
} from "@/lib/firestore/approval-queue-notifications";
import {
  listMaintenanceTicketNotifications,
  markMaintenanceTicketNotificationRead,
} from "@/lib/firestore/maintenance-ticket-notifications";
import {
  listGmailWorkflowNotifications,
  markGmailWorkflowNotificationRead,
} from "@/lib/gmail-hub/notifications";

// POST mark-all-read (S17 B6). Flips every UNREAD EVENT notification for the caller (approvals +
// maintenance) to read, honoring the same self-scoped, space-scoped reads as the feed. The STANDING
// setup families (connections / coverage) and the review digest carry no read_at, so they are untouched —
// they are dismissed by fixing the underlying state, not by marking a row read. Read-gated: marking your
// own notifications read is not an edit.
export async function POST() {
  try {
    const user = await requireCapability("read");
    const canReadRenewals = hasSpaceAccess(user, "renewals");
    const canReadMaintenance = hasSpaceAccess(user, "maintenance");

    let marked = 0;

    if (canReadRenewals) {
      const unread = await listApprovalQueueNotifications(user, {
        recipientOnly: true,
        unreadOnly: true,
      });
      await Promise.all(
        unread.map((notification) =>
          markApprovalQueueNotificationRead(user, notification.id),
        ),
      );
      marked += unread.length;
    }

    if (canReadMaintenance) {
      const unread = await listMaintenanceTicketNotifications(user, { unreadOnly: true });
      await Promise.all(
        unread.map((notification) =>
          markMaintenanceTicketNotificationRead(user, notification.id),
        ),
      );
      marked += unread.length;
    }

    if (canReadRenewals || canReadMaintenance) {
      const unread = await listGmailWorkflowNotifications(user, { unreadOnly: true });
      await Promise.all(
        unread.map((notification) =>
          markGmailWorkflowNotificationRead(user, notification.id),
        ),
      );
      marked += unread.length;
    }

    return NextResponse.json({ ok: true, marked });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
