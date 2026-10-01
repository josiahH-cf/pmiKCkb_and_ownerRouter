import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import {
  NO_STORE,
  logHistoryOperation,
  refuseVerificationWrite,
} from "@/lib/assistant-history/route-support";
import { requireCapability } from "@/lib/auth/session";
import {
  BeginTurnInputSchema,
  beginAssistantTurn,
} from "@/lib/firestore/assistant-history";

// S148: POST records a submitted Dashboard question in the signed-in user's own history. It is
// idempotent per client operation id, writes only that user's own history records, and never
// calls a model or a provider.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireCapability("read");
    const refused = refuseVerificationWrite(user);
    if (refused) {
      logHistoryOperation("begin", "refused");
      return refused;
    }
    const input = await parseJsonBody(request, BeginTurnInputSchema);
    const result = await beginAssistantTurn(user, input);
    logHistoryOperation("begin", "ok", { created: result.created });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    logHistoryOperation("begin", "error");
    return apiErrorResponse(error);
  }
}
