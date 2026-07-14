import { NextResponse } from "next/server";

import { parseJsonBody } from "@/lib/api/editable";
import { ReconcileGmailSendSchema } from "@/lib/gmail-hub/contracts";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";
import { requireWorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-authorization";

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, ReconcileGmailSendSchema);
    const user = await requireWorkflowCommunicationContext(input.context, "sendEmail");
    return NextResponse.json(
      await createGmailHubService(user).reconcileSend(
        input.confirmationToken,
        input.context,
      ),
    );
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
