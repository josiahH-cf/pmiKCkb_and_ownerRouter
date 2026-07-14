import { NextResponse } from "next/server";

import { requireCapability } from "@/lib/auth/session";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";
import { workflowEntityHref } from "@/lib/gmail-hub/workflow-context";

/** Bodyless, self-mailbox list of links already authorized by their renewal/maintenance scope. */
export async function GET(request: Request) {
  try {
    const user = await requireCapability("read");
    readAllowedQuery(request, []);
    const links = await createGmailHubService(user).listCommunications();
    return NextResponse.json({
      communications: links.map((link) => ({
        id: link.id,
        lane: link.lane,
        purpose: link.purpose,
        status: link.status,
        href: workflowEntityHref(link),
        createdAtMs: link.created_at_ms,
        ...(link.attention_at_ms ? { attentionAtMs: link.attention_at_ms } : {}),
      })),
    });
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
