import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  RecordLeaseTestBusinessEventInputSchema,
  listLeaseTestBusinessEvents,
  recordLeaseTestBusinessEvent,
} from "@/lib/firestore/lease-renewal-test-runs";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapabilityInSpace("read", "renewals");
    const { runId } = await context.params;
    return NextResponse.json({
      events: await listLeaseTestBusinessEvents(user, runId),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapabilityInSpace("edit", "renewals");
    const { runId } = await context.params;
    const input = await parseJsonBody(request, RecordLeaseTestBusinessEventInputSchema);
    const result = await recordLeaseTestBusinessEvent(user, runId, input);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
