import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { listApprovalQueueNotifications } from "@/lib/firestore/approval-queue-notifications";

export async function GET(request: Request) {
  try {
    const user = await requireCapabilityInSpace("read", "renewals");
    const searchParams = new URL(request.url).searchParams;
    const limitParam = optionalParam(searchParams, "limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      throw new EditableLayerError("Invalid notification limit.", 400);
    }

    // LR-02: recipient-only is the reader default. This Admin-monitoring endpoint offers the broad
    // cross-recipient view unless the caller narrows to `mine_only`; the reader still gates that opt-in on
    // the Admin capability, so a non-Admin caller only ever sees their own notifications here.
    const notifications = await listApprovalQueueNotifications(user, {
      itemId: optionalParam(searchParams, "item_id"),
      limit,
      adminAll: searchParams.get("mine_only") !== "true",
      unreadOnly: searchParams.get("unread_only") === "true",
    });

    return NextResponse.json({ notifications });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function optionalParam(searchParams: URLSearchParams, name: string) {
  const value = searchParams.get(name)?.trim();
  return value ? value : undefined;
}
