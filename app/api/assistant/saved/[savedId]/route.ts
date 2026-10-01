import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import {
  NO_STORE,
  logHistoryOperation,
  refuseVerificationWrite,
} from "@/lib/assistant-history/route-support";
import { requireCapability } from "@/lib/auth/session";
import {
  UpdateSavedQuestionInputSchema,
  updateSavedQuestion,
} from "@/lib/firestore/assistant-saved-questions";

// S149: PATCH pins, unpins or relabels one of the signed-in user's own saved questions. Versioned:
// a change already in place is a no-op, and a stale version cannot overwrite a newer change.
// Unpinning keeps the item and its history. No model call and no rerun.
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ savedId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const refused = refuseVerificationWrite(user);
    if (refused) {
      logHistoryOperation("pin", "refused");
      return refused;
    }
    const { savedId } = await context.params;
    const input = await parseJsonBody(request, UpdateSavedQuestionInputSchema);
    const result = await updateSavedQuestion(user, savedId, input);
    logHistoryOperation("pin", "ok", {
      changed: result.changed,
      pinned: result.item.pinned,
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    logHistoryOperation("pin", "error");
    return apiErrorResponse(error);
  }
}
