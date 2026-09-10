import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  getRenewalResourceLocations,
  saveRenewalResourceLocation,
} from "@/lib/firestore/renewal-resource-locations";
import { SaveRenewalResourceSchema } from "@/lib/lease-renewal/resource-locations";
export async function GET() {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    return NextResponse.json({ settings: await getRenewalResourceLocations(actor) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("manage_renewal_configuration"),
      "renewals",
    );
    const input = await parseJsonBody(request, SaveRenewalResourceSchema);
    return NextResponse.json(await saveRenewalResourceLocation(actor, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
