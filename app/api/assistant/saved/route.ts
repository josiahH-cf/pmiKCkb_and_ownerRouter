import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import {
  NO_STORE,
  isHistoryPersisted,
  logHistoryOperation,
  refuseVerificationWrite,
} from "@/lib/assistant-history/route-support";
import { requireCapability } from "@/lib/auth/session";
import { historyOwnerKey } from "@/lib/firestore/assistant-history-read";
import {
  SaveQuestionInputSchema,
  listSavedQuestions,
  saveQuestion,
} from "@/lib/firestore/assistant-saved-questions";

// S149: the signed-in user's own saved Dashboard questions. GET lists them (pinned first); POST
// saves one of the user's own answered history turns, read on the server, so the saved item keeps
// what that turn actually executed. Neither path calls a model, refreshes a source or reruns.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCapability("read");
    const ownerKey = historyOwnerKey(user.uid);
    if (!isHistoryPersisted(user)) {
      logHistoryOperation("saved_list", "ok", { items: 0, persisted: false });
      return NextResponse.json(
        { ownerKey, persisted: false, items: [], truncated: false },
        { headers: NO_STORE },
      );
    }
    const list = await listSavedQuestions(user);
    logHistoryOperation("saved_list", "ok", {
      items: list.items.length,
      pinned: list.items.filter((item) => item.pinned).length,
    });
    return NextResponse.json(
      { ownerKey, persisted: true, ...list },
      { headers: NO_STORE },
    );
  } catch (error) {
    logHistoryOperation("saved_list", "error");
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("read");
    const refused = refuseVerificationWrite(user);
    if (refused) {
      logHistoryOperation("save", "refused");
      return refused;
    }
    const input = await parseJsonBody(request, SaveQuestionInputSchema);
    const result = await saveQuestion(user, input);
    logHistoryOperation("save", "ok", {
      created: result.created,
      structured: result.item.structured,
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    logHistoryOperation("save", "error");
    return apiErrorResponse(error);
  }
}
