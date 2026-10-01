import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { runOncePerOperation } from "@/lib/api/assistant-operation-dedupe";
import { assistantModelRateLimiter } from "@/lib/api/model-call-throttle";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { requireCapability } from "@/lib/auth/session";
import { ConversationContextSchema } from "@/lib/assistant/conversation-plan";
import {
  conversationActorKey,
  runAssistantConversation,
  type ModelInterpreter,
} from "@/lib/assistant/conversation";
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
// asks the model again. Replay is a read; history is saved through its own routes.
export const dynamic = "force-dynamic";

const RequestSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    conversation: ConversationContextSchema.nullable().optional(),
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
    const persisted = !isVerificationAccount(user);
    if (body.operationId && persisted) {
      const replay = await readCompletedTurnAnswer(user, body.operationId).catch(
        () => null,
      );
      if (replay && replay.question === body.question) {
        console.info(
          JSON.stringify({ event: "assistant_conversation_replay", source: "history" }),
        );
        return NextResponse.json({ ...replay.answer, replayed: true });
      }
    }
    const execute = async () => {
      const now = new Date();
      const config = readServerConfig();
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
          interpretWithModel(question, previous, nowIso, { provider, model });
      }
      return runAssistantConversation(
        { question: body.question, conversation: body.conversation ?? null },
        {
          nowIso: now.toISOString(),
          actorKey: conversationActorKey(user.uid),
          context: createServerOperationalContext(user, now),
          interpret,
        },
      );
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
    return apiErrorResponse(error);
  }
}
