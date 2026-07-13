import { NextResponse } from "next/server";

import { requireCapability } from "@/lib/auth/session";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";

export async function GET(request: Request) {
  try {
    const user = await requireCapability("read");
    readAllowedQuery(request, []);
    return NextResponse.json(await createGmailHubService(user).connection());
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
