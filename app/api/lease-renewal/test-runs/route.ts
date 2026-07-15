import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  CreateLeaseTestRunInputSchema,
  createCanonicalLeaseTestRun,
  listLeaseTestRuns,
} from "@/lib/firestore/lease-renewal-test-runs";

export async function GET() {
  try {
    const user = await requireCapabilityInSpace("read", "renewals");
    return NextResponse.json({ runs: await listLeaseTestRuns(user) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

// Creates a production Test run from server-owned invented aliases only.
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("edit", "renewals");
    const input = await parseJsonBody(request, CreateLeaseTestRunInputSchema);
    const run = await createCanonicalLeaseTestRun(user, input);
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
