import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  SimulateLeaseTestActionInputSchema,
  listLeaseTestActionAttempts,
  listLeaseTestActionReceipts,
  simulateLeaseTestAction,
} from "@/lib/firestore/lease-renewal-test-runs";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapabilityInSpace("read", "renewals");
    const { runId } = await context.params;
    const [receipts, attempts] = await Promise.all([
      listLeaseTestActionReceipts(user, runId),
      listLeaseTestActionAttempts(user, runId),
    ]);
    return NextResponse.json({ receipts, attempts });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

// Explicit Test execution. The writer re-reads the persisted lane and constructs no provider.
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapabilityInSpace("edit", "renewals");
    const { runId } = await context.params;
    const input = await parseJsonBody(request, SimulateLeaseTestActionInputSchema);
    const evidence = await simulateLeaseTestAction(user, runId, input);
    return NextResponse.json(evidence, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
