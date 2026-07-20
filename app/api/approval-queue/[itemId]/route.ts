import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  getApprovalQueueItem,
  listApprovalQueueActivity,
} from "@/lib/firestore/approval-queue";
import { TransitionApprovalQueueItemInputSchema } from "@/lib/firestore/schemas";
import { transitionApprovalQueueItemWithWorkflowSync } from "@/lib/firestore/workflow-approval-queue-sync";

interface RouteContext {
  params: Promise<{ itemId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapabilityInSpace("read", "renewals");
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
    // LR-02: a mutation endpoint is gated at the minimum mutating altitude (`edit`), not `read`. Every
    // action needs at least edit anyway (approve/deny need `approve`; assign/disable/close need
    // `manageAdmin`), so this loses no legitimate access while ensuring a read-only principal is rejected
    // at the boundary rather than relying solely on the per-action capability checks inside planTransition.
    const user = await requireCapabilityInSpace("edit", "renewals");
    const { itemId } = await context.params;
    const input = await parseJsonBody(request, TransitionApprovalQueueItemInputSchema);
    const item = await transitionApprovalQueueItemWithWorkflowSync(user, itemId, input);
    const activity = await listApprovalQueueActivity(user, itemId);

    return NextResponse.json({ activity, item });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
