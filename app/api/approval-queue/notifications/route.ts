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

    const notifications = await listApprovalQueueNotifications(user, {
      itemId: optionalParam(searchParams, "item_id"),
      limit,
      recipientOnly: searchParams.get("mine_only") === "true",
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
