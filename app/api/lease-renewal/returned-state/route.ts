import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { RecordReturnedStateSchema } from "@/lib/firestore/lease-document-returned-states";
import {
  recordReturnedStateChange,
  resolveReturnedState,
} from "@/lib/lease-documents/returned-state-service";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

// S236 (ARCH-S236-1): staff-attested returned-document records for one lease's current packet. It
// writes only the app's own record and its activity entry; the actor and time come from the server
// session, never the body. No Dotloop call happens here and nothing infers a signature.

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
    const { view } = await resolveReturnedState(actor, parsedLeaseId.data);
    return NextResponse.json({ view });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("record_returned_state"),
      "renewals",
    );
    const input = await parseJsonBody(request, RecordReturnedStateSchema);
    return NextResponse.json(await recordReturnedStateChange(actor, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
