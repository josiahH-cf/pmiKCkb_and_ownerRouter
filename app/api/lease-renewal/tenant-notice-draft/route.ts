import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { GmailRuntimeClient, GmailRuntimeError } from "@/lib/gmail-runtime/client";
import { GmailDwdSetupError } from "@/lib/gmail-runtime/dwd-token";
import { isActionExecutable } from "@/lib/integrations/action-gate";
import { buildTenantNoticeDraftRequest } from "@/lib/lease-renewal/notice-send-policy";
import { getRenewalLeaseWorkspace } from "@/lib/lease-renewal/sample-desk";

const GMAIL_RENEWAL_DRAFT_ACTION = "gmail.renewal_notice.draft_create";

const TenantNoticeDraftInputSchema = z.object({
  leaseId: z.string().trim().min(1),
  tenantEmail: z.string().trim().email().optional(),
});

// POST /api/lease-renewal/tenant-notice-draft — prepare the UNSENT tenant renewal-offer draft. A
// structural twin of the owner route: it builds the addressed draft server-side (verbatim DRAFT_BANNER
// via buildTenantNoticeDraftRequest, whose request is production_allowed:false / send_allowed:false),
// then checks the SAME pre-approved compose-only gate (gmail.renewal_notice.draft_create — the seed
// entry already scopes "owner email or tenant offer email", so this reuses it and adds no new entry).
// Gate closed → typed "needs Gmail access" refusal with the draft, no Gmail call. Gate open → an unsent
// draft in the signed-in user's mailbox. Never sends. Edit-gated, renewals-scoped.
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("edit", "renewals");
    const input = await parseJsonBody(request, TenantNoticeDraftInputSchema);

    const workspace = getRenewalLeaseWorkspace(input.leaseId);
    if (!workspace) {
      return NextResponse.json({ error: "Lease not found." }, { status: 404 });
    }
    if (!workspace.tenantDraft) {
      return NextResponse.json(
        { error: "Tenant offer is not ready yet. Record the owner's decision first." },
        { status: 409 },
      );
    }
    const draftRequest = buildTenantNoticeDraftRequest({
      draft: workspace.tenantDraft,
      tenantEmail: input.tenantEmail,
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
