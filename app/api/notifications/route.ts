import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { hasSpaceAccess, requireCapability } from "@/lib/auth/session";
import { listApprovalQueueNotifications } from "@/lib/firestore/approval-queue-notifications";
import { EditableLayerError } from "@/lib/firestore/errors";
import { listMaintenanceTicketNotifications } from "@/lib/firestore/maintenance-ticket-notifications";
import { getNotificationPreferences } from "@/lib/firestore/notification-preferences";
import { buildNotificationFeed } from "@/lib/notifications/feed";

// GET the signed-in user's unified in-app notification feed (approvals + maintenance) plus the family
// views. Read-gated and self-scoped: each per-source reader returns only the caller's own records.
export async function GET(request: Request) {
  try {
    const user = await requireCapability("read");
    const searchParams = new URL(request.url).searchParams;
    const unreadOnly = searchParams.get("unread_only") === "true";
    const limitParam = searchParams.get("limit")?.trim();
    const limit = limitParam ? Number(limitParam) : undefined;

    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      throw new EditableLayerError("Invalid notification limit.", 400);
    }

    const canReadRenewals = hasSpaceAccess(user, "renewals");
    const canReadMaintenance = hasSpaceAccess(user, "maintenance");
    const [preferences, approval, maintenance] = await Promise.all([
      getNotificationPreferences(user),
      canReadRenewals
        ? listApprovalQueueNotifications(user, { recipientOnly: true, unreadOnly })
        : Promise.resolve([]),
      canReadMaintenance
        ? listMaintenanceTicketNotifications(user, { unreadOnly })
        : Promise.resolve([]),
    ]);

    const feed = buildNotificationFeed({
      approval,
      maintenance,
      mutedFamilies: preferences.muted_families,
      limit,
    });

    return NextResponse.json({
      ...feed,
      families: feed.families.filter(
        (family) =>
          (family.key !== "approval_queue" || canReadRenewals) &&
          (family.key !== "maintenance_tickets" || canReadMaintenance),
      ),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
