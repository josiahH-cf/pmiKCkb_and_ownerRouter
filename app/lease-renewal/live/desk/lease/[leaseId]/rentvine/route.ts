import { NextResponse } from "next/server";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/api/editable";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { loadRenewalAssistantSource } from "@/lib/lease-renewal/assistant-source";
import {
  buildRentvineDestination,
  expectedRentvineHost,
} from "@/lib/lease-renewal/desk-destinations";
export async function GET(
  _request: Request,
  context: { params: Promise<{ leaseId: string }> },
) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const { leaseId } = await context.params;
    if (!/^[1-9][0-9]*$/.test(leaseId))
      return new Response("This lease has no verified RentVine shortcut.", {
        status: 400,
      });
    const read = await loadRenewalAssistantSource(actor, new Date());
    const row =
      read.outcome.status === "ok"
        ? read.outcome.view.items.find((item) => item.id === leaseId)
        : null;
    const destination = buildRentvineDestination({
      leaseId,
      sourceUrl: row?.sourceDestinations?.rentvine?.href,
      expectedHost: expectedRentvineHost(process.env.RENTVINE_API_BASE_URL),
    });
    if (!destination)
      return new Response(
        "The current source does not verify this RentVine shortcut. Return to the lease workspace and check its source.",
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    return NextResponse.redirect(destination.href, {
      status: 302,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
