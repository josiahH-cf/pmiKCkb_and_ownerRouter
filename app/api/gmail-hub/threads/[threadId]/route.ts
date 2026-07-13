import { NextResponse } from "next/server";

import { requireCapability } from "@/lib/auth/session";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";

interface RouteContext {
  params: Promise<{ threadId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    readAllowedQuery(request, []);
    const { threadId } = await context.params;
    return NextResponse.json(await createGmailHubService(user).getThread(threadId));
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
