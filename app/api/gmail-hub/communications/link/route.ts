import { NextResponse } from "next/server";

import { parseJsonBody } from "@/lib/api/editable";
import { LinkWorkflowCommunicationSchema } from "@/lib/gmail-hub/contracts";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";
import { requireWorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-authorization";

/** Targeted manual link: validates one opaque thread in the user's mailbox; never lists the inbox. */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, LinkWorkflowCommunicationSchema);
    const user = await requireWorkflowCommunicationContext(input.context, "edit");
    return NextResponse.json(await createGmailHubService(user).linkExistingThread(input));
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
