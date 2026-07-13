import { NextResponse } from "next/server";

import { parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { ApplyGmailLabelSchema } from "@/lib/gmail-hub/contracts";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  try {
    const user = await requireCapability("edit");
    const { threadId } = await context.params;
    const input = await parseJsonBody(request, ApplyGmailLabelSchema);
    return NextResponse.json(
      await createGmailHubService(user).applyThreadLabel(threadId, input.label),
    );
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
