import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  assertRenewalRoleAuthority,
  renewalRoleCapability,
} from "@/lib/lease-renewal/role-action-governance";
import {
  DecideWritebackApprovalInputSchema,
  decideWritebackApproval,
  listWritebackApprovalActivity,
} from "@/lib/firestore/lease-renewal-writeback-approvals";

// Approve or return a queued lease-renewal write-back proposal (Phase-2 control plane). The route
// route and data layer both enforce the Admin-only rule, the required reason, the
// resolve-before-approve precondition, and the no-execute invariant. No system-of-record write
// happens here — approving only records human authorization for the future, separately-gated write.
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    assertRenewalRoleAuthority("approve_source_write", user.role);
    const input = await parseJsonBody(request, DecideWritebackApprovalInputSchema);
    const approval = await decideWritebackApproval(user, input);
    const activity = await listWritebackApprovalActivity(user, input.source_trigger_key);

    return NextResponse.json({ activity, approval });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
