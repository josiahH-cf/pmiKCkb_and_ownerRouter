import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { readApprovalQueueNotificationHealth } from "@/lib/firestore/approval-queue-notifications";

export async function GET() {
  try {
    const user = await requireCapabilityInSpace("manageAdmin", "renewals");
    const health = await readApprovalQueueNotificationHealth({ actor: user });

    return NextResponse.json({ health });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
