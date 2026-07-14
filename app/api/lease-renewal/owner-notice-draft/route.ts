import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { buildOwnerNoticeDraftRequest } from "@/lib/lease-renewal/notice-send-policy";
import { getRenewalLeaseWorkspace } from "@/lib/lease-renewal/sample-desk";

const OwnerNoticeDraftInputSchema = z
  .object({ leaseId: z.string().trim().min(1) })
  .strict();

// The visible lease desk is sample/simulation data. Return an unaddressed preview only and never
// construct Gmail. A real authorized workflow run plus verified recipient source is required first.
export async function POST(request: Request) {
  try {
    await requireCapabilityInSpace("edit", "renewals");
    const input = await parseJsonBody(request, OwnerNoticeDraftInputSchema);
    const workspace = getRenewalLeaseWorkspace(input.leaseId);
    if (!workspace) {
      return NextResponse.json({ error: "Lease not found." }, { status: 404 });
    }
    const draftRequest = buildOwnerNoticeDraftRequest({ draft: workspace.ownerDraft });
    return NextResponse.json({
      enabled: false,
      execution_allowed: false,
      status: "preview_only",
      reason:
        "Sample renewal data is preview-only. Do not send; connect a real authorized renewal run and verified owner recipient first.",
      request: draftRequest,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
