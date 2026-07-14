import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { buildTenantNoticeDraftRequest } from "@/lib/lease-renewal/notice-send-policy";
import { getRenewalLeaseWorkspace } from "@/lib/lease-renewal/sample-desk";

const TenantNoticeDraftInputSchema = z
  .object({ leaseId: z.string().trim().min(1) })
  .strict();

// Sample/simulation renewal data is not eligible for Gmail mutation. Email also cannot satisfy the
// separate portal/SMS outreach or tenant-agreement gates.
export async function POST(request: Request) {
  try {
    await requireCapabilityInSpace("edit", "renewals");
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
    const draftRequest = buildTenantNoticeDraftRequest({ draft: workspace.tenantDraft });
    return NextResponse.json({
      enabled: false,
      execution_allowed: false,
      status: "preview_only",
      reason:
        "Sample renewal data is preview-only. Do not send; connect a real authorized renewal run, confirmed owner direction, and verified tenant recipient first.",
      request: draftRequest,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
