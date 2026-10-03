import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  SaveRenewalWorkingFieldSchema,
  getRenewalWorkingRecord,
  listRenewalWorkingActivity,
  saveRenewalWorkingField,
} from "@/lib/firestore/renewal-working-record";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

// S157/S156/S158: the lease-bound staff working record. It writes only the app's own record and
// append-only activity for one lease, one field per request; the actor comes from the server
// session, never the body. No RentVine, Sheet, Gmail or RentCast call, no cycle and no staff
// activity derives from it. A deliberate source update is a separate exact action.

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
    const [record, activity] = await Promise.all([
      getRenewalWorkingRecord(actor, leaseId),
      listRenewalWorkingActivity(actor, leaseId),
    ]);
    return NextResponse.json({ record, activity });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("save_working_record"),
      "renewals",
    );
    const input = await parseJsonBody(request, SaveRenewalWorkingFieldSchema);
    return NextResponse.json(await saveRenewalWorkingField(actor, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
