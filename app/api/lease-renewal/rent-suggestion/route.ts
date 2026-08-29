import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { can } from "@/lib/auth/roles";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  assertRenewalRoleAuthority,
  renewalRoleCapability,
} from "@/lib/lease-renewal/role-action-governance";
import {
  DecideRentSuggestionApprovalInputSchema,
  decideRentSuggestionApproval,
  getRentSuggestionApproval,
  listRentSuggestionApprovalActivity,
  resolveLeaseRentSuggestion,
} from "@/lib/firestore/lease-renewal-rent-suggestion-approvals";
import {
  findLeaseViewById,
  leaseCurrentRent,
  leasePortfolioId,
} from "@/lib/integrations/rentvine/lease-mapper";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { getLiveLeaseViews } from "@/lib/lease-renewal/live-lease-cache";

/**
 * S60 (AC-S60-10) + S62: resolve the AUTHORITATIVE current rent (for the clamp) and the portfolio
 * id (for owner-policy rules) from the shared live RentVine read. Nulls when live RentVine is not
 * configured or the lease is absent — the recompute stays visibly unclamped and rule-free rather
 * than working from a guess.
 */
async function resolveLeaseLiveFacts(
  leaseId: string,
): Promise<{ currentRent: number | null; portfolioId: string | null }> {
  const config = buildLiveRentVineConfig();
  if (!config.ok) return { currentRent: null, portfolioId: null };
  try {
    const views = await getLiveLeaseViews(config.rentvineClient, Date.now());
    const view = findLeaseViewById(views, leaseId);
    if (!view) return { currentRent: null, portfolioId: null };
    return {
      currentRent: leaseCurrentRent(view) ?? null,
      portfolioId: leasePortfolioId(view) ?? null,
    };
  } catch {
    return { currentRent: null, portfolioId: null };
  }
}

// Read the server-computed comp-derived rent suggestion for a lease plus its current approval state. The
// number is always recomputed server-side from the lease's own comp basis; it is never client-supplied.
export async function GET(request: Request) {
  try {
    const user = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const leaseId = new URL(request.url).searchParams.get("lease_id")?.trim() ?? "";
    if (leaseId === "") {
      return NextResponse.json({ error: "A lease_id is required." }, { status: 400 });
    }
    const facts = await resolveLeaseLiveFacts(leaseId);
    const suggestion = await resolveLeaseRentSuggestion(
      user,
      leaseId,
      facts.currentRent,
      facts.portfolioId,
    );
    const approval = await getRentSuggestionApproval(user, leaseId);
    const activity = await listRentSuggestionApprovalActivity(user, leaseId);
    // The server is the source of truth for who may approve; the client renders the control from this.
    const canApprove = can(
      user.role,
      renewalRoleCapability("approve_pricing_suggestion"),
    );
    return NextResponse.json({ suggestion, approval, activity, canApprove });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

// Approve or return the comp-derived rent suggestion (S29 control plane). The route gates at "read"; the
// route and data layer both enforce the Admin-only rule, the required reason, the
// server-side recompute, and the no-execute invariant. No system-of-record write and no send happen here:
// approving only records human authorization to place the number in the owner-notice DRAFT.
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    assertRenewalRoleAuthority("approve_pricing_suggestion", user.role);
    const input = await parseJsonBody(request, DecideRentSuggestionApprovalInputSchema);
    const facts = await resolveLeaseLiveFacts(input.lease_id);
    const approval = await decideRentSuggestionApproval(
      user,
      input,
      facts.currentRent,
      facts.portfolioId,
    );
    const activity = await listRentSuggestionApprovalActivity(user, input.lease_id);
    return NextResponse.json({ approval, activity });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
