import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { applyCommunicationsLegalHold } from "@/lib/gmail-hub/retention-store";
import { CommunicationsLegalHoldInputSchema } from "@/lib/gmail-hub/retention-policy";

export async function POST(request: Request) {
  try {
    const actor = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, CommunicationsLegalHoldInputSchema);
    return NextResponse.json(await applyCommunicationsLegalHold(actor, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
