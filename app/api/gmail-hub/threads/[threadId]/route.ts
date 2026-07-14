import { NextResponse } from "next/server";

import { WorkflowThreadContextQuerySchema } from "@/lib/gmail-hub/contracts";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";
import { requireWorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-authorization";

interface RouteContext {
  params: Promise<{ threadId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const query = readAllowedQuery(request, ["context"]);
    const workflowContext = WorkflowThreadContextQuerySchema.parse(query.get("context"));
    const user = await requireWorkflowCommunicationContext(workflowContext, "read");
    const { threadId } = await context.params;
    return NextResponse.json(
      await createGmailHubService(user).getThread(threadId, workflowContext),
    );
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
