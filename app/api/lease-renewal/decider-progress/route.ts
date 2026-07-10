import { NextResponse } from "next/server";

import { apiErrorResponse, createdJson, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  RenewalDeciderProgressRunQuerySchema,
  SetRenewalDeciderProgressInputSchema,
  listRenewalDeciderProgressForRun,
  setRenewalDeciderProgress,
  type RenewalDeciderProgressMarker,
  type RenewalDeciderProgressRecord,
} from "@/lib/firestore/renewal-decider-progress";

// Store one value-free Seen/Deferred marker for the signed-in operator. The route and repository
// both gate writes at `edit`; this is per-user navigation state, not a renewal resolution.
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("edit", "renewals");
    const input = await parseJsonBody(request, SetRenewalDeciderProgressInputSchema);
    const progress = await setRenewalDeciderProgress(user, input);
    return createdJson({ progress: toClientMarker(progress) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

// Hydrate only the signed-in operator's markers for one run. The repository repeats the owner
// filter, and Firestore client rules independently enforce read-own on both current + Activity.
export async function GET(request: Request) {
  try {
    const user = await requireCapabilityInSpace("read", "renewals");
    const url = new URL(request.url);
    const parsed = RenewalDeciderProgressRunQuerySchema.safeParse({
      run_id: url.searchParams.get("run_id") ?? undefined,
    });
    if (!parsed.success) {
      throw new EditableLayerError("A valid run_id query parameter is required.", 400);
    }

    const progress = await listRenewalDeciderProgressForRun(user, parsed.data.run_id);
    return NextResponse.json({ progress: progress.map(toClientMarker) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function toClientMarker(
  progress: RenewalDeciderProgressRecord,
): RenewalDeciderProgressMarker {
  return {
    source_trigger_key: progress.source_trigger_key,
    status: progress.status,
  };
}
