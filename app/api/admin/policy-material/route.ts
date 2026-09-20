import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  DecidePolicyMaterialInputSchema,
  IntakePolicyMaterialInputSchema,
  decidePolicyMaterial,
  intakePolicyMaterial,
  listPolicyMaterial,
} from "@/lib/firestore/lease-renewal-policy-material";

// S131 (F11): Admin surface for versioned policy material. Admin-only, server-only writes through
// the Admin SDK. GET lists every version of the product; POST submits one exact version as pending
// (never active); PATCH approves or rejects one exact pending version under a revision check. The
// approve capability is checked again inside the repository. Nothing here sends, drafts, charges,
// enrolls, files a claim or writes to a provider or the operating Sheet.
export async function GET() {
  try {
    const user = await requireCapability("manageAdmin");
    const records = await listPolicyMaterial(user, "rhino");

    return NextResponse.json({ policyMaterial: { records } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, IntakePolicyMaterialInputSchema);
    const result = await intakePolicyMaterial(user, input);

    return NextResponse.json({ policyMaterial: result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, DecidePolicyMaterialInputSchema);
    const result = await decidePolicyMaterial(user, input);

    return NextResponse.json({ policyMaterial: result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
