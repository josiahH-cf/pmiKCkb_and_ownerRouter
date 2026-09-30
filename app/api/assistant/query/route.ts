import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { assistantModelRateLimiter } from "@/lib/api/model-call-throttle";
import { requireCapability } from "@/lib/auth/session";
import { ConversationContextSchema } from "@/lib/assistant/conversation-plan";
import {
  conversationActorKey,
  runAssistantConversation,
  type ModelInterpreter,
} from "@/lib/assistant/conversation";
import { interpretWithModel } from "@/lib/assistant/interpret";
import { readServerConfig } from "@/lib/config/server";
import { createModelProvider } from "@/lib/llm/model-provider";
import { createServerOperationalContext } from "@/lib/operational-context/server-context";

// S138: the Dashboard conversation's one boundary. The body carries the question text and the page
// session's own conversation context; the actor, their role and their Space access come from the
// session, and the context can only narrow what that actor already sees (a context from another
// sign-in is discarded). Every record comes from the owning services through the shared S137 context
// (the renewal read is the desk's own loadRenewalAssistantSource orchestration). No path writes,
// sends, drafts, starts a run, or refreshes a provider; the selected model only interprets wording.
export const dynamic = "force-dynamic";

const RequestSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    conversation: ConversationContextSchema.nullable().optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const user = await requireCapability("read");
    const body = await parseJsonBody(request, RequestSchema);
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
    const answer = await runAssistantConversation(
      { question: body.question, conversation: body.conversation ?? null },
      {
        nowIso: now.toISOString(),
        actorKey: conversationActorKey(user.uid),
        context: createServerOperationalContext(user, now),
        interpret,
      },
    );
    return NextResponse.json(answer);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
