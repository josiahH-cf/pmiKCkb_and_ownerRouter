import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  readRenewalRehearsalSheetAdminConfig,
  UpdateRenewalRehearsalSheetConfigInputSchema,
  updateRenewalRehearsalSheetAdminConfig,
} from "@/lib/firestore/renewal-rehearsal-sheet-config";

// Admin-only configuration. Saving an id is not a Sheet proof and performs no Google API call.
export async function GET() {
  try {
    const user = await requireCapability("manageAdmin");
    const config = await readRenewalRehearsalSheetAdminConfig(user);
    return NextResponse.json({ config });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(
      request,
      UpdateRenewalRehearsalSheetConfigInputSchema,
    );
    const config = await updateRenewalRehearsalSheetAdminConfig(user, input);
    return NextResponse.json({ config });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
