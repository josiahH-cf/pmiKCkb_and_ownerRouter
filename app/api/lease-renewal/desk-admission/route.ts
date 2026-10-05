import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { renewalDisplayScopeKey } from "@/lib/lease-renewal/display-scope";
import {
  RENEWAL_SOURCE_REFRESH_COOKIE,
  parseRenewalSourceRefreshAfter,
} from "@/lib/lease-renewal/post-write-freshness";
export async function GET() {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    return NextResponse.json(
      {
        scopeKey: renewalDisplayScopeKey(actor),
        refreshAfter: parseRenewalSourceRefreshAfter(
          (await cookies()).get(RENEWAL_SOURCE_REFRESH_COOKIE)?.value,
          Date.now(),
        ),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
