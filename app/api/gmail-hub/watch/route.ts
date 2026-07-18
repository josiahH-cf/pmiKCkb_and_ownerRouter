import { NextResponse } from "next/server";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";
import { readGmailPushConfig } from "@/lib/gmail-hub/pubsub";

const GmailWatchConfirmationSchema = z
  .object({
    mailboxEmail: z.string().trim().email().max(320),
    topicName: z.string().trim().min(1).max(1_000),
    observedWatchExpirationMs: z.number().int().nonnegative().nullable(),
    attemptKey: z.string().uuid(),
    confirmed: z.literal(true),
  })
  .strict();

export async function GET() {
  try {
    const user = await requireCapability("edit");
    const config = readGmailPushConfig();
    return NextResponse.json(
      await createGmailHubService(user).watchPreview(config.topicName),
    );
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("edit");
    const input = await parseJsonBody(request, GmailWatchConfirmationSchema);
    const config = readGmailPushConfig();
    if (
      input.mailboxEmail.toLowerCase() !== user.email.toLowerCase() ||
      input.topicName !== config.topicName
    ) {
      return NextResponse.json(
        { error: "Gmail watch confirmation does not match the exact server preview." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      await createGmailHubService(user).watchMailbox({
        topicName: config.topicName,
        attemptKey: input.attemptKey,
        observedExpirationMs: input.observedWatchExpirationMs,
      }),
    );
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
