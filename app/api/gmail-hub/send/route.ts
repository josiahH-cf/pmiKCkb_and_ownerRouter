import { NextResponse } from "next/server";

import { parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { ConfirmedGmailSendSchema } from "@/lib/gmail-hub/contracts";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";

export async function POST(request: Request) {
  try {
    const user = await requireCapability("sendEmail");
    const input = await parseJsonBody(request, ConfirmedGmailSendSchema);
    return NextResponse.json(await createGmailHubService(user).sendConfirmed(input));
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
