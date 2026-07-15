import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  SimulateMaintenanceTestActionInputSchema,
  listMaintenanceTestActionReceipts,
  simulateMaintenanceTestAction,
} from "@/lib/firestore/maintenance-tickets";

interface RouteContext {
  params: Promise<{ ticketId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapabilityInSpace("read", "maintenance");
    const { ticketId } = await context.params;
    const receipts = await listMaintenanceTestActionReceipts(user, ticketId);
    return NextResponse.json({ receipts });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

// Explicit Test execution. The service re-reads the persisted ticket lane and rejects Live tickets.
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapabilityInSpace("edit", "maintenance");
    const { ticketId } = await context.params;
    const input = await parseJsonBody(request, SimulateMaintenanceTestActionInputSchema);
    const receipt = await simulateMaintenanceTestAction(user, ticketId, input);
    return NextResponse.json({ receipt }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
