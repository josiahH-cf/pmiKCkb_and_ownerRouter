import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  listLeaseRenewalResolutionActivity,
  ResolveLeaseRenewalFlagInputSchema,
  resolveLeaseRenewalFlag,
} from "@/lib/firestore/lease-renewal-resolutions";

// Resolve one lease-renewal reconciliation flag (§3.5: pick a source / enter a corrected value /
// flag-is-wrong). The route gates at "read"; the data layer enforces the Approver/Admin rule, the
// required reason, and the no-execute write-back gate. No system-of-record write happens here.
export async function POST(request: Request) {
  try {
    const user = await requireCapability("read");
    const input = await parseJsonBody(request, ResolveLeaseRenewalFlagInputSchema);
    const resolution = await resolveLeaseRenewalFlag(user, input);
    const activity = await listLeaseRenewalResolutionActivity(
      user,
      input.source_trigger_key,
    );

    return NextResponse.json({ activity, resolution });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
