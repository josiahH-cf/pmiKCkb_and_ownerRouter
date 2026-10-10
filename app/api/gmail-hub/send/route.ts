import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api/editable";
import { ConfirmedGmailSendSchema } from "@/lib/gmail-hub/contracts";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";
import { requireWorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-authorization";
/** S193: new work uses the canonical rich composer; prior attempts keep receipt-only reconciliation. */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, ConfirmedGmailSendSchema);
    await requireWorkflowCommunicationContext(input.context, "sendEmail");
    return NextResponse.json(
      {
        error:
          "Open this workflow in Communications and use its Send or Schedule action. Existing attempted replies retain their original reconciliation route.",
        href: "/gmail-hub",
        recoveryHref: "/api/gmail-hub/send/reconcile",
      },
      { status: 410, headers: { "cache-control": "private, no-store" } },
    );
  } catch (e) {
    return gmailHubErrorResponse(e);
  }
}
