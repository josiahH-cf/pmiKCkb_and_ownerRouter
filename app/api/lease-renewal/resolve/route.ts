import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  assertRenewalRoleAuthority,
  renewalRoleCapability,
} from "@/lib/lease-renewal/role-action-governance";
import {
  listLeaseRenewalResolutionActivity,
  ResolveLeaseRenewalFlagInputSchema,
  resolveLeaseRenewalFlag,
} from "@/lib/firestore/lease-renewal-resolutions";
import { createRenewalRunResolver } from "@/lib/lease-renewal/resolve-run";

// Resolve one lease-renewal reconciliation flag (§3.5: pick a source / enter a corrected value /
// flag-is-wrong). The route and data layer both enforce the Approver/Admin rule, the
// required reason, and the no-execute write-back gate. No system-of-record write happens here.
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    assertRenewalRoleAuthority("resolve_reconciliation", user.role);
    const input = await parseJsonBody(request, ResolveLeaseRenewalFlagInputSchema);
    // Only the ordinary Live-backed run id resolves; retired Test/sample ids fail closed.
    const resolution = await resolveLeaseRenewalFlag(
      user,
      input,
      undefined,
      createRenewalRunResolver(),
    );
    const activity = await listLeaseRenewalResolutionActivity(
      user,
      input.source_trigger_key,
    );

    return NextResponse.json({ activity, resolution });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
