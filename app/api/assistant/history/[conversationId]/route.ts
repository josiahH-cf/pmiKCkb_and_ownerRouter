import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/editable";
import {
  NO_STORE,
  isHistoryPersisted,
  logHistoryOperation,
} from "@/lib/assistant-history/route-support";
import {
  accessNarrowedSince,
  projectStoredAssistantAnswer,
  projectStoredKnowledgeAnswer,
} from "@/lib/assistant-history/stored-answer";
import { requireCapability } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import {
  historyOwnerKey,
  readAssistantConversationPage,
} from "@/lib/firestore/assistant-history-read";

// S148: GET one of the signed-in user's own conversations with its turns in order, exactly as they
// were answered, each labelled with its answer time. Reopening reads stored data only: no model
// call, no source refresh, no rerun. The viewer's current access is applied first, so a Space or
// role they no longer hold hides the stored detail instead of revealing it.
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ conversationId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { conversationId } = await context.params;
    const notFound = new EditableLayerError("That conversation was not found.", 404);
    if (!isHistoryPersisted(user)) throw notFound;
    const params = new URL(request.url).searchParams;
    if (
      [...params.keys()].some((key) => key !== "after") ||
      params.getAll("after").length > 1 ||
      !/^\d{1,12}$/.test(params.get("after") ?? "0")
    )
      throw new EditableLayerError("Invalid conversation page.", 400);
    const found = await readAssistantConversationPage(
      user,
      conversationId,
      Number(params.get("after") ?? 0),
    );
    if (!found) throw notFound;
    const turns = found.turns.map(({ accessBasis, ...turn }) => ({
      ...turn,
      accessChanged: accessNarrowedSince(accessBasis, user),
      assistant: turn.assistant
        ? projectStoredAssistantAnswer(turn.assistant, accessBasis, user)
        : null,
      knowledge: turn.knowledge
        ? projectStoredKnowledgeAnswer(turn.knowledge, accessBasis, user)
        : null,
    }));
    logHistoryOperation("open", "ok", { turns: turns.length });
    return NextResponse.json(
      {
        ownerKey: historyOwnerKey(user.uid),
        conversation: found.conversation,
        turns,
        nextTurnCursor: found.nextTurnCursor,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    logHistoryOperation(
      "open",
      error instanceof EditableLayerError ? "refused" : "error",
    );
    return apiErrorResponse(error);
  }
}
