import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  getApprovalQueueItem,
  listApprovalQueueActivity,
  transitionApprovalQueueItem,
} from "@/lib/firestore/approval-queue";
import { TransitionApprovalQueueItemInputSchema } from "@/lib/firestore/schemas";

interface RouteContext {
  params: Promise<{ itemId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { itemId } = await context.params;
    const item = await getApprovalQueueItem(user, itemId);
    const activity = await listApprovalQueueActivity(user, itemId);

    return NextResponse.json({ activity, item });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { itemId } = await context.params;
    const input = await parseJsonBody(request, TransitionApprovalQueueItemInputSchema);
    const item = await transitionApprovalQueueItem(user, itemId, input);
    const activity = await listApprovalQueueActivity(user, itemId);

    return NextResponse.json({ activity, item });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
