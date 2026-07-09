import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  DismissIntakeInputSchema,
  dismissUnverifiedIntake,
} from "@/lib/firestore/maintenance-intake-review";

interface RouteContext {
  params: Promise<{ intakeId: string }>;
}

// POST /api/maintenance/intake/:intakeId/dismiss — edit-gated. Marks a quarantined intake as junk with a
// required reason (recorded on the append-only intake Activity). 409s if already triaged. App-plane only.
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { intakeId } = await context.params;
    const input = await parseJsonBody(request, DismissIntakeInputSchema);
    const intake = await dismissUnverifiedIntake(user, intakeId, input);
    return NextResponse.json({ intake });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
