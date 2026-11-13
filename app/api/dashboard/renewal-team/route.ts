import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { loadRenewalTeamLine } from "@/lib/attention/renewal-team-line-read";
import { requireCapabilityInSpace } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCapabilityInSpace("read", "renewals");
    return NextResponse.json(await loadRenewalTeamLine(user), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
