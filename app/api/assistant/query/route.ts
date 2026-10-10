import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { runOncePerOperation } from "@/lib/api/assistant-operation-dedupe";
import { assistantModelRateLimiter } from "@/lib/api/model-call-throttle";
import { historyModeFor } from "@/lib/assistant-history/route-support";
import { projectStoredAssistantAnswer } from "@/lib/assistant-history/stored-answer";
import { requireCapability } from "@/lib/auth/session";
import { ConversationContextSchema } from "@/lib/assistant/conversation-plan";
import {
  conversationActorKey,
  runAssistantConversation,
  type ModelInterpreter,
} from "@/lib/assistant/conversation";
import { conversationMemoryNote } from "@/lib/assistant-history/memory-types";
import {
  ConversationMemoryUnavailable,
  readConversationMemory,
} from "@/lib/assistant-history/conversation-memory";
import { interpretWithModel } from "@/lib/assistant/interpret";
import { readServerConfig } from "@/lib/config/server";
import { readCompletedTurnAnswer } from "@/lib/firestore/assistant-history-read";
import { createModelProvider } from "@/lib/llm/model-provider";
import { createServerOperationalContext } from "@/lib/operational-context/server-context";

// S138: the Dashboard conversation's one boundary. The body carries the question text and the page
// session's own conversation context; the actor, their role and their Space access come from the
// session, and the context can only narrow what that actor already sees (a context from another
// sign-in is discarded). Every record comes from the owning services through the shared S137 context
// (the renewal read is the desk's own loadRenewalAssistantSource orchestration). No path writes,
// sends, drafts, starts a run, or refreshes a provider; the selected model only interprets wording.
// S148: an optional client operation id names one submission. A duplicate delivery joins or reuses
// that submission's answer on this instance, or replays its completed history turn, so it never
// asks the model again. Replay is a read; history is saved through its own routes, and where
// history is never saved (verification accounts, the Live-read-only rehearsal) nothing is read.
export const dynamic = "force-dynamic";

const RequestSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    conversation: ConversationContextSchema.nullable().optional(),
    conversationKey: z
      .string()
      .regex(/^[A-Za-z0-9-]{8,64}$/)
      .optional(),
    operationId: z
      .string()
      .regex(/^[A-Za-z0-9-]{8,64}$/)
      .optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const user = await requireCapability("read");
    const body = await parseJsonBody(request, RequestSchema);
    if (body.operationId && historyModeFor(user) === "saved") {
      const replay = await readCompletedTurnAnswer(user, body.operationId).catch(
        () => null,
      );
      if (replay && replay.question === body.question) {
        console.info(
          JSON.stringify({ event: "assistant_conversation_replay", source: "history" }),
        );
        // A replay is a reopening: the viewer's current access applies, as in the history view.
        return NextResponse.json({
          ...projectStoredAssistantAnswer(replay.answer, replay.accessBasis, user),
          replayed: true,
        });
      }
    }
    const execute = async () => {
      const now = new Date();
      const config = readServerConfig();
      const memory =
        body.conversationKey && historyModeFor(user) === "saved"
          ? await readConversationMemory(
              user,
              body.conversationKey,
              body.question,
              body.operationId,
            )
          : null;
      let interpret: ModelInterpreter | null = null;
      // The deterministic interpreter answers in local rehearsal and whenever this actor's model
      // budget is spent; a throttled question is still answered, never refused.
      if (
        !config.askDemoMode &&
        assistantModelRateLimiter.check(user.uid, now.getTime()).allowed
      ) {
        const provider = createModelProvider(config);
        const model =
          config.modelProvider === "local"
            ? config.localModelName
            : config.geminiClassifyModel;
        interpret = (question, previous, nowIso) =>
          interpretWithModel(question, previous, nowIso, {
            provider,
            model,
            ...(memory ? { memory: memory.memory } : {}),
          });
      }
      const answer = await runAssistantConversation(
        {
          question: body.question,
          conversation: memory?.continuation ?? body.conversation ?? null,
        },
        {
          nowIso: now.toISOString(),
          actorKey: conversationActorKey(user.uid),
          context: createServerOperationalContext(user, now),
          interpret,
          priorQuestionTexts: memory?.memory.turns.map((t) => t.question),
        },
      );
      const note = memory ? conversationMemoryNote(memory.memory) : undefined;
      return { ...answer, ...(note ? { contextNote: note } : {}) };
    };
    if (!body.operationId) return NextResponse.json(await execute());
    const { promise, joined } = runOncePerOperation(
      `${user.uid}:${body.operationId}:${body.question}`,
      execute,
    );
    const answer = await promise;
    if (joined) {
      console.info(
        JSON.stringify({ event: "assistant_conversation_replay", source: "in_flight" }),
      );
      return NextResponse.json({ ...answer, replayed: true });
    }
    return NextResponse.json(answer);
  } catch (error) {
    if (error instanceof ConversationMemoryUnavailable)
      return NextResponse.json(
        { error: error.message, error_type: "conversation_context_unavailable" },
        { status: 503 },
      );
    return apiErrorResponse(error);
  }
}
