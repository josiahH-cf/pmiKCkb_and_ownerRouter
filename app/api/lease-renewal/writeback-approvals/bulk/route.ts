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
  DecideWritebackApprovalsBulkInputSchema,
  decideWritebackApprovalsBulk,
} from "@/lib/firestore/lease-renewal-writeback-approvals";

// Bulk approve/return for queued lease-renewal write-back proposals (S13 B2), run-page only. One
// shared mandatory reason covers every selected proposal; the data layer loops the existing
// per-proposal transaction, so the Editor gate (S156/S167), the verification-account refusal,
// transition rules, and one Activity row per decision all hold per item, and per-item failures are
// reported without blocking the rest. No system-of-record write happens here.
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    assertRenewalRoleAuthority("approve_source_write", user.role);
    if (isVerificationAccount(user))
      throw new EditableLayerError(
        "Verification accounts cannot record write-back approval decisions.",
        403,
      );
    const input = await parseJsonBody(request, DecideWritebackApprovalsBulkInputSchema);
    const outcome = await decideWritebackApprovalsBulk(user, input);

    return NextResponse.json(outcome);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
