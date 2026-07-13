import { NextResponse } from "next/server";
import { z } from "zod";

import { parseOptionalJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";
import { readGmailPushConfig } from "@/lib/gmail-hub/pubsub";

export async function POST(request: Request) {
  try {
    const user = await requireCapability("edit");
    await parseOptionalJsonBody(request, z.object({}).strict());
    const config = readGmailPushConfig();
    return NextResponse.json(
      await createGmailHubService(user).watchMailbox(config.topicName),
    );
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
