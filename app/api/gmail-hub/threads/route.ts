import { NextResponse } from "next/server";

import { requireCapability } from "@/lib/auth/session";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";

export async function GET(request: Request) {
  try {
    const user = await requireCapability("read");
    const query = readAllowedQuery(request, ["pageToken", "q"]);
    const result = await createGmailHubService(user).listThreads({
      ...(query.get("pageToken") ? { pageToken: query.get("pageToken")! } : {}),
      ...(query.get("q") ? { q: query.get("q")! } : {}),
    });
    return NextResponse.json(result);
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
