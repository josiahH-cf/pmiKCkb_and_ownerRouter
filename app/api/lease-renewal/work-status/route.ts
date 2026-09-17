import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  SaveRenewalWorkStatusSchema,
  getRenewalWorkStatus,
  listRenewalWorkStatusActivity,
  saveRenewalWorkStatus,
} from "@/lib/firestore/renewal-work-status";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

// S119: the staff work status annotation. It writes only the app's own record and append-only
// activity for one lease; the actor comes from the server session, never the body. No RentVine,
// Sheet, Gmail or provider effect, no cycle change and no automatic classification derives from it.

export async function GET(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const parsedLeaseId = z
      .string()
      .regex(/^[1-9]\d*$/)
      .safeParse(new URL(request.url).searchParams.get("leaseId"));
    if (!parsedLeaseId.success)
      throw new EditableLayerError("leaseId must be a RentVine lease id.", 400);
    const leaseId = parsedLeaseId.data;
    const [record, history] = await Promise.all([
      getRenewalWorkStatus(actor, leaseId),
      listRenewalWorkStatusActivity(actor, leaseId),
    ]);
    return NextResponse.json({ record, history });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("save_work_status"),
      "renewals",
    );
    const input = await parseJsonBody(request, SaveRenewalWorkStatusSchema);
    return NextResponse.json(await saveRenewalWorkStatus(actor, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
