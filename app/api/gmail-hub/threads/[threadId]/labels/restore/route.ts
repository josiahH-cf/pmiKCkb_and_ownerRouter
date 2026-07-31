import { NextResponse } from "next/server";

import { parseJsonBody } from "@/lib/api/editable";
import { ApplyGmailLabelSchema } from "@/lib/gmail-hub/contracts";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";
import { requireWorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-authorization";

/**
 * Correction path for `gmail.label.apply`: restore the governed label set the thread held before a
 * settled apply. It is the same Action Registry key and the same governed one-thread mutation, so
 * it needs no separate gate, but it carries its own immutable identity and therefore its own single
 * attempt.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await context.params;
    const input = await parseJsonBody(request, ApplyGmailLabelSchema);
    const user = await requireWorkflowCommunicationContext(input.context, "edit");
    return NextResponse.json(
      await createGmailHubService(user).restoreThreadLabel(threadId, input),
    );
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
