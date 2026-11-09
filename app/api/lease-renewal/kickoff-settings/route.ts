import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { readKickoffAutomaticStart } from "@/lib/firestore/renewal-kickoff-settings";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    await requireCapabilityInSpace(renewalRoleCapability("read_workspace"), "renewals");
    const saved = await readKickoffAutomaticStart();
    return NextResponse.json(
      { ...saved, historicalEnabled: saved.enabled, enabled: false, retired: true },
      { headers },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST() {
  try {
    await requireCapabilityInSpace(
      renewalRoleCapability("manage_renewal_configuration"),
      "renewals",
    );
    return NextResponse.json(
      {
        error:
          "Automatic preparation is retired. Choose the preparation button for the selected month.",
      },
      { status: 410, headers },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
