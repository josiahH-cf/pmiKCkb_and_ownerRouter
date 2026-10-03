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
  DecideWritebackApprovalInputSchema,
  decideWritebackApproval,
  listWritebackApprovalActivity,
} from "@/lib/firestore/lease-renewal-writeback-approvals";

// Approve or return a queued lease-renewal write-back proposal (Phase-2 control plane). S156/S167:
// the Renewals Space guard and Editor access are the only requirements; the route and data layer
// both refuse a verification account and keep the required reason, the resolve-before-approve
// precondition and the no-execute invariant. No system-of-record write happens here: approving
// only records a decision about the proposal, and no source update waits on it.
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
    const input = await parseJsonBody(request, DecideWritebackApprovalInputSchema);
    const approval = await decideWritebackApproval(user, input);
    const activity = await listWritebackApprovalActivity(user, input.source_trigger_key);

    return NextResponse.json({ activity, approval });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
