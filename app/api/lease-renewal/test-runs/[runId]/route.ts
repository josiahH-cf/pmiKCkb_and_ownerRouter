import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  TransitionLeaseTestRunInputSchema,
  transitionLeaseTestRun,
} from "@/lib/firestore/lease-renewal-test-runs";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

// Sequential app-plane status transition. The writer requires all eleven Test receipts before Done.
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCapabilityInSpace("edit", "renewals");
    const { runId } = await context.params;
    const input = await parseJsonBody(request, TransitionLeaseTestRunInputSchema);
    const run = await transitionLeaseTestRun(user, runId, input);
    return NextResponse.json({ run });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
