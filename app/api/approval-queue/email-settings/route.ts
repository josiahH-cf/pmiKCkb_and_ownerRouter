import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { listApprovalQueueEmailSettings } from "@/lib/firestore/approval-queue-notifications";

export async function GET() {
  try {
    const user = await requireCapability("manageAdmin");
    const settings = await listApprovalQueueEmailSettings(user);

    return NextResponse.json({ settings });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
