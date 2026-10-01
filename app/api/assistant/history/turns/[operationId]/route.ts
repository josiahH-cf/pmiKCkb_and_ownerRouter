import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import {
  NO_STORE,
  logHistoryOperation,
  refuseVerificationWrite,
} from "@/lib/assistant-history/route-support";
import { requireCapability } from "@/lib/auth/session";
import {
  FinalizeTurnInputSchema,
  finalizeAssistantTurn,
} from "@/lib/firestore/assistant-history";

// S148: PUT finishes one of the signed-in user's own history turns with what was actually shown:
// completed with its answer, failed, or interrupted. Retrying saves the same result (idempotent per
// operation id) and never asks the model again; a completed answer is never overwritten.
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ operationId: string }>;
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const refused = refuseVerificationWrite(user);
    if (refused) {
      logHistoryOperation("finalize", "refused");
      return refused;
    }
    const { operationId } = await context.params;
    const input = await parseJsonBody(request, FinalizeTurnInputSchema);
    const result = await finalizeAssistantTurn(user, operationId, input);
    logHistoryOperation("finalize", "ok", { created: result.created });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    logHistoryOperation("finalize", "error");
    return apiErrorResponse(error);
  }
}
