import { NextResponse } from "next/server";

import { authErrorResponse, requireCapability } from "@/lib/auth/session";
import { getUnitIndex, searchUnits } from "@/lib/maintenance/unit-index";

const MAX_Q = 120;

// Edit-gated unit type-ahead endpoint (slice 2a). Serves suggestions from the ~10-minute TTL unit index
// (getUnitIndex) so it never fans out a per-keystroke live RentVine read. Empty query returns an empty
// list without touching the index; an over-long query is rejected; an unavailable index degrades to a 503
// with its error category. Read-only; no write, no send. Edit-gated so the route-auth-boundary invariant
// is satisfied without any allow-list change.
export async function GET(request: Request) {
  try {
    await requireCapability("edit");
  } catch (error) {
    return authErrorResponse(error);
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q === "") {
    return NextResponse.json({ units: [] });
  }
  if (q.length > MAX_Q) {
    return NextResponse.json({ error: "Query is too long." }, { status: 400 });
  }

  const index = await getUnitIndex();
  if (index.status !== "ok") {
    return NextResponse.json(
      { error: "Unit lookup is unavailable.", error_type: index.status },
      { status: 503 },
    );
  }

  const units = searchUnits(index.candidates, q).map((candidate) => ({
    unitId: candidate.unitId,
    label: candidate.label,
  }));
  return NextResponse.json({ units });
}
