import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { can } from "@/lib/auth/roles";
import { requireCapabilityInSpace } from "@/lib/auth/session";
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
} from "@/lib/integrations/rentvine/lease-mapper";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { getLiveLeaseViews } from "@/lib/lease-renewal/live-lease-cache";

/**
 * S60 (AC-S60-10): resolve the AUTHORITATIVE current rent for the clamp from the shared live
 * RentVine read. Null when live RentVine is not configured or the lease is absent from the read —
 * which leaves the median visibly unclamped rather than clamped against a guessed rent.
 */
async function resolveAuthoritativeCurrentRent(leaseId: string): Promise<number | null> {
  const config = buildLiveRentVineConfig();
  if (!config.ok) return null;
  try {
    const views = await getLiveLeaseViews(config.rentvineClient, Date.now());
    const view = findLeaseViewById(views, leaseId);
    return view ? (leaseCurrentRent(view) ?? null) : null;
  } catch {
    return null;
  }
}

// Read the server-computed comp-derived rent suggestion for a lease plus its current approval state. The
// number is always recomputed server-side from the lease's own comp basis; it is never client-supplied.
export async function GET(request: Request) {
  try {
    const user = await requireCapabilityInSpace("read", "renewals");
    const leaseId = new URL(request.url).searchParams.get("lease_id")?.trim() ?? "";
    if (leaseId === "") {
      return NextResponse.json({ error: "A lease_id is required." }, { status: 400 });
    }
    const suggestion = await resolveLeaseRentSuggestion(
      user,
      leaseId,
      await resolveAuthoritativeCurrentRent(leaseId),
    );
    const approval = await getRentSuggestionApproval(user, leaseId);
    const activity = await listRentSuggestionApprovalActivity(user, leaseId);
    // The server is the source of truth for who may approve; the client renders the control from this.
    const canApprove = can(user.role, "manageAdmin");
    return NextResponse.json({ suggestion, approval, activity, canApprove });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

// Approve or return the comp-derived rent suggestion (S29 control plane). The route gates at "read"; the
// data layer enforces the Admin-only rule (manageAdmin — a non-Admin gets 403), the required reason, the
// server-side recompute, and the no-execute invariant. No system-of-record write and no send happen here:
// approving only records human authorization to place the number in the owner-notice DRAFT.
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("read", "renewals");
    const input = await parseJsonBody(request, DecideRentSuggestionApprovalInputSchema);
    const approval = await decideRentSuggestionApproval(
      user,
      input,
      await resolveAuthoritativeCurrentRent(input.lease_id),
    );
    const activity = await listRentSuggestionApprovalActivity(user, input.lease_id);
    return NextResponse.json({ approval, activity });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
