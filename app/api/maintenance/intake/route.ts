import { NextResponse } from "next/server";

import { requireCapabilityInSpace } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/api/editable";
import { listUnverifiedIntake } from "@/lib/firestore/maintenance-intake-review";

// GET /api/maintenance/intake — the UNVERIFIED public-intake triage queue (edit-gated read). This is the
// authed staff view of what the public tokenized ingress captured; promote/dismiss live at
// /api/maintenance/intake/:intakeId/{promote,dismiss}. Distinct from the unauthenticated
// /api/maintenance/intake/public POST (which writes here) and /intake/token (mint).
export async function GET() {
  try {
    const user = await requireCapabilityInSpace("edit", "maintenance");
    const intake = await listUnverifiedIntake(user);
    return NextResponse.json({ intake });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
