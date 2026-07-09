import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { GmailRuntimeClient, GmailRuntimeError } from "@/lib/gmail-runtime/client";
import { GmailDwdSetupError } from "@/lib/gmail-runtime/dwd-token";
import { isActionExecutable } from "@/lib/integrations/action-gate";
import { buildOwnerNoticeDraftRequest } from "@/lib/lease-renewal/notice-send-policy";
import { getRenewalLeaseWorkspace } from "@/lib/lease-renewal/sample-desk";

const GMAIL_RENEWAL_DRAFT_ACTION = "gmail.renewal_notice.draft_create";

const OwnerNoticeDraftInputSchema = z.object({
  leaseId: z.string().trim().min(1),
  ownerEmail: z.string().trim().email().optional(),
});

// POST /api/lease-renewal/owner-notice-draft — prepare the UNSENT owner renewal-notice draft.
//
// Builds the addressed draft server-side (verbatim DRAFT_BANNER via buildOwnerNoticeDraftRequest), then
// checks the runtime gate. Until gmail.renewal_notice.draft_create is production_allowed (owner-gated on
// the committed DWD grant), it returns a typed "needs Gmail access" refusal and makes NO Gmail call. When
// the gate is open it creates an unsent draft in the signed-in user's mailbox. Never sends. Edit-gated.
export async function POST(request: Request) {
  try {
    const user = await requireCapability("edit");
    const input = await parseJsonBody(request, OwnerNoticeDraftInputSchema);

    const workspace = getRenewalLeaseWorkspace(input.leaseId);
    if (!workspace) {
      return NextResponse.json({ error: "Lease not found." }, { status: 404 });
    }
    const draftRequest = buildOwnerNoticeDraftRequest({
      draft: workspace.ownerDraft,
      ownerEmail: input.ownerEmail,
    });

    if (!isActionExecutable(GMAIL_RENEWAL_DRAFT_ACTION)) {
      return NextResponse.json({
        enabled: false,
        status: "needs_gmail_access",
        reason:
          "Gmail access is not enabled yet. Review the prepared draft below and send it yourself.",
        request: draftRequest,
      });
    }

    const client = new GmailRuntimeClient({ subject: user.email });
    const { draftId } = await client.createDraft({
      to: draftRequest.to,
      subject: draftRequest.subject,
      body: draftRequest.body,
    });
    return NextResponse.json({
      enabled: true,
      status: "draft_created",
      draftId,
      request: draftRequest,
    });
  } catch (error) {
    if (error instanceof GmailRuntimeError || error instanceof GmailDwdSetupError) {
      // Gate-open Gmail failure: surface a clean typed error (which carries only an HTTP status, never a
      // token or the draft body) instead of letting it throw out of the route as an unhandled rejection.
      return NextResponse.json(
        { status: "gmail_error", error: "Could not create the Gmail draft." },
        { status: 502 },
      );
    }
    return apiErrorResponse(error);
  }
}
