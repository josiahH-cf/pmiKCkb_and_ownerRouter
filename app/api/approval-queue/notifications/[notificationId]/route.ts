import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { markApprovalQueueNotificationRead } from "@/lib/firestore/approval-queue-notifications";
import { UpdateApprovalQueueNotificationInputSchema } from "@/lib/firestore/schemas";

interface RouteContext {
  params: Promise<{ notificationId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCapabilityInSpace("read", "renewals");
    const { notificationId } = await context.params;
    await parseJsonBody(request, UpdateApprovalQueueNotificationInputSchema);
    const notification = await markApprovalQueueNotificationRead(user, notificationId);

    return NextResponse.json({ notification });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
