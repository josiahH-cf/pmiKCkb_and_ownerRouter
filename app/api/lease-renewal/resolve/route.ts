import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  listLeaseRenewalResolutionActivity,
  ResolveLeaseRenewalFlagInputSchema,
  resolveLeaseRenewalFlag,
} from "@/lib/firestore/lease-renewal-resolutions";
import { resolveRenewalRun } from "@/lib/lease-renewal/resolve-run";

// Resolve one lease-renewal reconciliation flag (§3.5: pick a source / enter a corrected value /
// flag-is-wrong). The route gates at "read"; the data layer enforces the Approver/Admin rule, the
// required reason, and the no-execute write-back gate. No system-of-record write happens here.
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("read", "renewals");
    const input = await parseJsonBody(request, ResolveLeaseRenewalFlagInputSchema);
    // Inject the combined resolver so a live-review flag (run_id "live-review") no longer 404s: it
    // rebuilds the live run for the live id and falls back to the simulation run otherwise. Passing
    // `undefined` for db keeps the getAdminFirestore() default.
    const resolution = await resolveLeaseRenewalFlag(
      user,
      input,
      undefined,
      resolveRenewalRun,
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
