import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  publishChargePolicy,
  readChargePolicy,
} from "@/lib/firestore/lease-charge-policy";
import { PublishChargePolicyInputSchema } from "@/lib/lease-documents/charge-policy";

// S66 (AC-S66-7): Admin surface for the versioned renewal charge policy. GET returns the current
// version; POST publishes the next one against the version the page loaded. Admin-only,
// server-only writes. Publishing changes no lease's inputs, frozen attempt, RentVine charge or
// Sheet value, and nothing here adopts a printed fee schedule from a form.
export async function GET() {
  try {
    await requireCapability("manageAdmin");
    const policy = await readChargePolicy();
    return NextResponse.json({ chargePolicy: policy });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, PublishChargePolicyInputSchema);
    const result = await publishChargePolicy(user, input);
    return NextResponse.json({
      chargePolicy: { readable: true, record: result.record },
      duplicate: result.duplicate,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
