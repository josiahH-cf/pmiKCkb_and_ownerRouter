import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  RenewalFollowUpAttentionTransitionSchema,
  transitionRenewalFollowUpAttention,
} from "@/lib/firestore/lease-renewal-follow-up-attention";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

/** Manual, audited transition for one exact in-app due item; no external provider is touched. */
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace(
      renewalRoleCapability("manage_follow_up_attention"),
      "renewals",
    );
    const input = await parseJsonBody(request, RenewalFollowUpAttentionTransitionSchema);
    return NextResponse.json(await transitionRenewalFollowUpAttention(user, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
