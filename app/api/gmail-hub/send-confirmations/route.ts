import { NextResponse } from "next/server";

import { parseJsonBody } from "@/lib/api/editable";
import { WorkflowPrepareGmailMessageSchema } from "@/lib/gmail-hub/contracts";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";
import { requireWorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-authorization";

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, WorkflowPrepareGmailMessageSchema);
    const user = await requireWorkflowCommunicationContext(input.context, "sendEmail");
    return NextResponse.json(
      await createGmailHubService(user).prepareSendConfirmation(input),
    );
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
