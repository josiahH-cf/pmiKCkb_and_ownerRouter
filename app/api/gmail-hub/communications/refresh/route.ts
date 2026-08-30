import { NextResponse } from "next/server";

import { parseJsonBody } from "@/lib/api/editable";
import { RefreshWorkflowCommunicationSchema } from "@/lib/gmail-hub/contracts";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";
import { requireWorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-authorization";

/** Re-read exactly one already-linked workflow thread; no inbox listing or provider mutation. */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, RefreshWorkflowCommunicationSchema);
    const user = await requireWorkflowCommunicationContext(input.context, "read");
    return NextResponse.json(
      await createGmailHubService(user).refreshLinkedThread(input),
    );
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
