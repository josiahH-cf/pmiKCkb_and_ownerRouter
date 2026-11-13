import { NextResponse } from "next/server";

import { requireCapability } from "@/lib/auth/session";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";
import { readCommunicationLabels } from "@/lib/gmail-hub/sequence-store";
import { workflowCommunicationHref } from "@/lib/gmail-hub/workflow-context";

/** Bodyless, self-mailbox list of links already authorized by their renewal/maintenance scope. */
export async function GET(request: Request) {
  try {
    const user = await requireCapability("read");
    readAllowedQuery(request, []);
    const links = await createGmailHubService(user).listCommunications();
    // S275 R-S275-6: the lease label each listed renewal communication stores. The list is already
    // limited to this user's links in Spaces they can open, so the label follows that access.
    const labels = await readCommunicationLabels(
      links.flatMap((link) => (link.sequence_id ? [link.sequence_id] : [])),
    ).catch(() => new Map<string, string>());
    return NextResponse.json({
      communications: links.map((link) => ({
        id: link.id,
        lane: link.lane,
        purpose: link.purpose,
        status: link.status,
        href: workflowCommunicationHref(link),
        ...(link.sequence_id && labels.get(link.sequence_id)
          ? { label: labels.get(link.sequence_id) }
          : {}),
        createdAtMs: link.created_at_ms,
        ...(link.attention_at_ms ? { attentionAtMs: link.attention_at_ms } : {}),
        ...(link.waiting_on ? { waitingOn: link.waiting_on } : {}),
        ...(link.last_contact_at_ms ? { lastContactAtMs: link.last_contact_at_ms } : {}),
        ...(link.last_contact_source
          ? { lastContactSource: link.last_contact_source }
          : {}),
        // The hub says when the linked thread could not be read, as the linked detail does.
        ...(link.contact_observation_state
          ? { contactObservationState: link.contact_observation_state }
          : {}),
        ...(link.contact_observation_reason
          ? { contactObservationReason: link.contact_observation_reason }
          : {}),
      })),
    });
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
