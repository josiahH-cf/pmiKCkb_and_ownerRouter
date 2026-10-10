import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { createCommunicationSequenceService } from "@/lib/gmail-hub/sequence-dependencies";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";
export async function GET(request: Request) {
  try {
    const actor = await requireCapability("read");
    const q = readAllowedQuery(request, ["id", "thread", "sender"]);
    const id = z.string().uuid().parse(q.get("id")),
      thread = z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,200}$/)
        .parse(q.get("thread"));
    const sender = q.has("sender")
      ? z.string().email().max(254).parse(q.get("sender"))
      : undefined;
    const result = await createCommunicationSequenceService().thread(
      actor,
      id,
      thread,
      sender,
    );
    return NextResponse.json(
      { thread: result },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
