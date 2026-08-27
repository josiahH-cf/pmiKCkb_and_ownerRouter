import { NextResponse } from "next/server";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";

const GmailManualRefreshSchema = z.object({ attemptKey: z.string().uuid() }).strict();

/** Read-only, workflow-bounded replacement for the retired continuous Gmail watch. */
export async function POST(request: Request) {
  try {
    const user = await requireCapability("edit");
    const input = await parseJsonBody(request, GmailManualRefreshSchema);
    return NextResponse.json(await createGmailHubService(user).refreshMailbox(input));
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
