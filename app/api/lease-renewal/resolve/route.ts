import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
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
import { writebackAuthorizationTokenForResolution } from "@/lib/lease-renewal/writeback-authorization-token";

// Resolve one lease-renewal reconciliation flag (§3.5: pick a source / enter a corrected value /
// flag-is-wrong). S156/S167: the Renewals Space guard and Editor access are the only requirements;
// the route and data layer both refuse a verification account and keep the no-execute write-back
// gate. A reason is optional context. No system-of-record write happens here.
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    assertRenewalRoleAuthority("resolve_reconciliation", user.role);
    if (isVerificationAccount(user))
      throw new EditableLayerError(
        "Verification accounts cannot record lease-renewal decisions.",
        403,
      );
    const input = await parseJsonBody(request, ResolveLeaseRenewalFlagInputSchema);
    // Only the ordinary Live-backed run id resolves; retired Test/sample ids fail closed.
    const resolution = await resolveLeaseRenewalFlag(
      user,
      input,
      undefined,
      createRenewalRunResolver(user),
    );
    const activity = await listLeaseRenewalResolutionActivity(
      user,
      input.source_trigger_key,
    );

    const authorizationToken = writebackAuthorizationTokenForResolution(resolution);
    return NextResponse.json({
      activity,
      resolution,
      ...(authorizationToken ? { authorization_token: authorizationToken } : {}),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
