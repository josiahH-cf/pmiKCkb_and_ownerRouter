import { NextResponse } from "next/server";
import { z } from "zod";

import { authErrorResponse, requireCapability } from "@/lib/auth/session";
import { loadLiveUnitCandidates } from "@/lib/maintenance/live-unit-source";
import { matchLocationToUnit } from "@/lib/maintenance/unit-matcher";

const MAX_LOCATION = 300;

const MatchUnitRequestSchema = z.object({
  location: z.string().trim().min(1).max(MAX_LOCATION),
});

// Maintenance location→unit matcher (M-4). Reads live RentVine units (read-only) and returns the best
// match + the ordered candidates for a human to confirm/override. Edit-gated (capture is editor work).
// Value-bearing but authenticated + edit-gated; never writes, never assigns (autoMerge:false).
export async function POST(request: Request) {
  try {
    await requireCapability("edit");
  } catch (error) {
    return authErrorResponse(error);
  }

  const payload = await request.json().catch(() => null);
  const parsed = MatchUnitRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid match-unit request." }, { status: 400 });
  }

  const source = await loadLiveUnitCandidates();
  if (source.status !== "ok") {
    return NextResponse.json(
      { error: "Unit lookup is unavailable.", error_type: source.status },
      { status: 503 },
    );
  }

  const result = matchLocationToUnit(parsed.data.location, source.candidates);
  return NextResponse.json(result);
}
