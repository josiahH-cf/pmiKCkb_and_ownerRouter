import { NextResponse } from "next/server";

import { apiErrorResponse, parseOptionalJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  PromoteIntakeInputSchema,
  promoteUnverifiedIntake,
} from "@/lib/firestore/maintenance-intake-review";

interface RouteContext {
  params: Promise<{ intakeId: string }>;
}

// POST /api/maintenance/intake/:intakeId/promote — edit-gated. Atomically creates a real (external,
// Needs-Verification) ticket from the quarantined intake and flips it to "promoted". Body is optional
// ({ priority? }); the writer 409s if it was already triaged. App-plane only; no SoR write, no send.
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { intakeId } = await context.params;
    const input = await parseOptionalJsonBody(request, PromoteIntakeInputSchema);
    const ticket = await promoteUnverifiedIntake(user, intakeId, input);
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
