import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  SaveRenewalDeskPreferenceSchema,
  getRenewalDeskPreference,
  saveRenewalDeskPreference,
} from "@/lib/firestore/renewal-desk-preferences";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

// S166: the signed-in account's remembered worklist view. The account always comes from the
// server session, never the body, and the store targets only that account's own document. It
// writes the app's own bookkeeping only: no lease record, provider, cycle or staff activity, and
// the value never decides whether a lease can be opened or worked.

const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET() {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    return NextResponse.json(
      { preference: await getRenewalDeskPreference(actor) },
      { headers: NO_STORE },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("save_desk_preference"),
      "renewals",
    );
    const input = await parseJsonBody(request, SaveRenewalDeskPreferenceSchema);
    return NextResponse.json(
      { preference: await saveRenewalDeskPreference(actor, input) },
      { headers: NO_STORE },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
