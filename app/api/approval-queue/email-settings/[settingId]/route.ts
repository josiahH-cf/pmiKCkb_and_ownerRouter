import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { updateApprovalQueueEmailSetting } from "@/lib/firestore/approval-queue-notifications";
import { UpdateApprovalQueueEmailSettingInputSchema } from "@/lib/firestore/schemas";

interface RouteContext {
  params: Promise<{ settingId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCapabilityInSpace("manageAdmin", "renewals");
    const { settingId } = await context.params;
    const input = await parseJsonBody(
      request,
      UpdateApprovalQueueEmailSettingInputSchema,
    );
    const setting = await updateApprovalQueueEmailSetting(user, settingId, input);

    return NextResponse.json({ setting });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
