import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { runOncePerOperation } from "@/lib/api/assistant-operation-dedupe";
import {
  NO_STORE,
  logHistoryOperation,
  refuseVerificationWrite,
} from "@/lib/assistant-history/route-support";
import {
  conversationActorKey,
  runStoredPlan,
  storedPlanSupport,
} from "@/lib/assistant/conversation";
import { requireCapability } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import { recordRerunTurn } from "@/lib/firestore/assistant-history";
import {
  readTurnByOperation,
  type StoredTurnRecord,
} from "@/lib/firestore/assistant-history-read";
import {
  readSavedQuestion,
  toSavedQuestionView,
  type SavedQuestionRecord,
} from "@/lib/firestore/assistant-saved-questions";
import { createServerOperationalContext } from "@/lib/operational-context/server-context";

// S150: POST runs one of the signed-in user's own saved questions for current results. The server
// loads the saved plan by id (a client never supplies one) and executes it through the S138 subject
// executors with no interpretation step and no model call: relative periods resolve now, a named
// month stays fixed, and every record is read with the user's current access. The result is
// recorded as a new turn, so the earlier answer stays as it was. A duplicate delivery of the same
// operation replays the recorded turn or joins the in-flight run, so a run executes once.
export const dynamic = "force-dynamic";

const RunRequestSchema = z
  .object({ operationId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/) })
  .strict();

interface RouteContext {
  params: Promise<{ savedId: string }>;
}

function respond(
  saved: SavedQuestionRecord,
  turn: StoredTurnRecord,
  replayed: boolean,
): NextResponse {
  const item = toSavedQuestionView(saved);
  return NextResponse.json(
    {
      conversationId: turn.conversation_id,
      replayed,
      turn: {
        turnId: turn.turn_id,
        operationId: turn.operation_id,
        seq: turn.seq,
        question: turn.question,
        displayState: turn.state === "completed" ? "completed" : "failed",
        assistant: turn.state === "completed" ? turn.assistant : null,
        knowledge: null,
        answeredAtIso: turn.answered_at,
        createdAtIso: turn.created_at,
        accessChanged: false,
        rerunOf: turn.rerun_of ?? null,
      },
      item:
        turn.state === "completed"
          ? {
              ...item,
              lastOperationId: turn.operation_id,
              lastAnsweredAtIso: turn.answered_at ?? item.lastAnsweredAtIso,
            }
          : item,
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const refused = refuseVerificationWrite(user);
    if (refused) {
      logHistoryOperation("run", "refused");
      return refused;
    }
    const { savedId } = await context.params;
    const { operationId } = await parseJsonBody(request, RunRequestSchema);
    const saved = await readSavedQuestion(user, savedId);
    if (!saved) throw new EditableLayerError("That saved question was not found.", 404);
    if (!storedPlanSupport(saved.plan, saved.detail_ref).supported) {
      logHistoryOperation("run", "refused", { structured: false });
      return NextResponse.json(
        {
          error:
            "This saved question needs a new answer, so ask it again as a new question.",
          error_type: "structured_rerun_unsupported",
        },
        { status: 409, headers: NO_STORE },
      );
    }

    // A completed run for this operation is replayed as recorded; nothing executes again.
    const recorded = await readTurnByOperation(user, operationId);
    if (recorded && recorded.rerun_of === savedId && recorded.state === "completed") {
      logHistoryOperation("run", "ok", { replayed: true, executed: false });
      return respond(saved, recorded, true);
    }

    const { promise, joined } = runOncePerOperation(
      `${user.uid}:${operationId}:rerun:${savedId}`,
      async () => {
        const now = new Date();
        const answer = await runStoredPlan(
          {
            question: saved.question,
            plan: saved.plan,
            relatedRefs: saved.related_refs,
            detailRef: saved.detail_ref,
          },
          {
            nowIso: now.toISOString(),
            actorKey: conversationActorKey(user.uid),
            context: createServerOperationalContext(user, now),
          },
        );
        return recordRerunTurn(user, operationId, {
          savedId,
          state: "completed",
          assistant: answer,
        });
      },
    );
    const written = await promise;
    logHistoryOperation("run", "ok", {
      replayed: joined || !written.created,
      executed: !joined,
      partial: (written.record.assistant?.groups ?? []).some(
        (group) => group.status !== "ok",
      ),
    });
    return respond(saved, written.record, joined || !written.created);
  } catch (error) {
    logHistoryOperation("run", error instanceof EditableLayerError ? "refused" : "error");
    return apiErrorResponse(error);
  }
}
