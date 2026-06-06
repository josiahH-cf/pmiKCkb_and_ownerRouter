import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { BulkApprovalQueueInputSchema } from "@/lib/firestore/schemas";
import { bulkTransitionApprovalQueueItemsWithWorkflowSync } from "@/lib/firestore/workflow-approval-queue-sync";

export async function POST(request: Request) {
  try {
    const user = await requireCapability("read");
    const input = await parseJsonBody(request, BulkApprovalQueueInputSchema);
    const result = await bulkTransitionApprovalQueueItemsWithWorkflowSync(user, input);

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
