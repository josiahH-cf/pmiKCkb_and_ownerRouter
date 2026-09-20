import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  UpdateMoveOutTimingBasisInputSchema,
  readMoveOutTimingBasisRecord,
  updateMoveOutTimingBasis,
} from "@/lib/firestore/lease-renewal-move-out-timing-basis";

// S125 (F04): Admin surface for the reviewed notice timing basis (mirrors the notice-rules route).
// Admin-only, server-only writes through the Admin SDK. GET returns the saved record or the exact
// reason none is saved; PATCH records a reviewed basis under a revision check. Nothing here sends,
// drafts, calculates money or touches a provider record.
export async function GET() {
  try {
    const user = await requireCapability("manageAdmin");
    const timingBasis = await readMoveOutTimingBasisRecord(user);

    return NextResponse.json({ timingBasis });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, UpdateMoveOutTimingBasisInputSchema);
    const record = await updateMoveOutTimingBasis(user, input);

    return NextResponse.json({ timingBasis: { state: "saved", record } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
