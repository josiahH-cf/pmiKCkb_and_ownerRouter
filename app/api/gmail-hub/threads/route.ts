import { NextResponse } from "next/server";

import { WorkflowThreadContextQuerySchema } from "@/lib/gmail-hub/contracts";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";
import { linkMatchesContext } from "@/lib/gmail-hub/workflow-context";
import { requireWorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-authorization";

export async function GET(request: Request) {
  try {
    const query = readAllowedQuery(request, ["context"]);
    const workflowContext = WorkflowThreadContextQuerySchema.parse(query.get("context"));
    const user = await requireWorkflowCommunicationContext(workflowContext, "read");
    const communications = (
      await createGmailHubService(user).listCommunications()
    ).filter((link) => linkMatchesContext(link, workflowContext));
    return NextResponse.json({ communications });
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
