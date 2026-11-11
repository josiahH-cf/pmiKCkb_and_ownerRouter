import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  readOfferChargeMappings,
  saveOfferChargeMappings,
} from "@/lib/firestore/renewal-offer-charge-mappings";
import { SaveOfferChargeMappingsSchema } from "@/lib/lease-renewal/offer-charge-mapping";

// S264 (R-S264-1, AC-S264-1): Admin → Renewal packet policy → Offer charge mappings. GET reads
// the current version; POST saves the next one against the version the Admin reviewed and returns
// the stored version read back. Admin-only, server-only writes. A mapping supplies a RentVine
// account's meaning only; it sets no amount, rate or default, and it changes no lease's saved
// selection, RentVine charge or packet policy.
export async function GET() {
  try {
    await requireCapability("manageAdmin");
    return NextResponse.json(
      { mappings: await readOfferChargeMappings() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, SaveOfferChargeMappingsSchema);
    const result = await saveOfferChargeMappings(user, input);
    return NextResponse.json(
      {
        mappings: { readable: true, record: result.record },
        duplicate: result.duplicate,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
