import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  listLeaseRenewalResolutionActivity,
  ResolveLeaseRenewalFlagInputSchema,
  resolveLeaseRenewalFlag,
} from "@/lib/firestore/lease-renewal-resolutions";
import { createRenewalRunResolver } from "@/lib/lease-renewal/resolve-run";

// Resolve one lease-renewal reconciliation flag (§3.5: pick a source / enter a corrected value /
// flag-is-wrong). The route gates at "read"; the data layer enforces the Approver/Admin rule, the
// required reason, and the no-execute write-back gate. No system-of-record write happens here.
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("read", "renewals");
    const input = await parseJsonBody(request, ResolveLeaseRenewalFlagInputSchema);
    // Bind the resolver to the authenticated actor so persisted Test ids are accepted only after
    // their isolated Test records are proven to exist. Live and deterministic simulation ids keep
    // their existing read-only resolution paths.
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

    return NextResponse.json({ activity, resolution });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
