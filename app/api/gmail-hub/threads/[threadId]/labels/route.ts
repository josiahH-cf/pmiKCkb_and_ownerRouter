import { NextResponse } from "next/server";

import { parseJsonBody } from "@/lib/api/editable";
import { ApplyGmailLabelSchema } from "@/lib/gmail-hub/contracts";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";
import { requireWorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-authorization";

export async function POST(
  request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await context.params;
    const input = await parseJsonBody(request, ApplyGmailLabelSchema);
    const user = await requireWorkflowCommunicationContext(input.context, "edit");
    return NextResponse.json(
      await createGmailHubService(user).applyThreadLabel(threadId, input),
    );
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
