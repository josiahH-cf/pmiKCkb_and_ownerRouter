import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import { summarizeThread } from "@/lib/gmail-inbox-zero/thread-summary";
import { AnswerGenerationSetupError, createModelProvider } from "@/lib/llm/model-provider";

// z.string().trim().min(1) rejects an empty or whitespace-only paste with a typed 400 (via
// parseJsonBody) BEFORE any model or mailbox work — the summary is never produced from nothing.
const ThreadSummaryInputSchema = z.object({
  threadText: z.string().trim().min(1),
});

// POST /api/gmail-hub/thread-summary — summarize PASTED, sanitized thread text into a structured
// { summary, waiting_on, suggested_next_action } object through the ModelProvider seam (local in dev,
// Gemini in prod). Reads NO mailbox — this route imports no @/lib/gmail-runtime/*. Any model failure
// degrades non-fatally inside summarizeThread. Edit-gated.
export async function POST(request: Request) {
  try {
    await requireCapability("edit");
    const input = await parseJsonBody(request, ThreadSummaryInputSchema);

    const config = readServerConfig();
    const provider = createModelProvider(config);
    const model =
      config.modelProvider === "local" ? config.localModelName : config.geminiAnswerModel;

    const result = await summarizeThread({ threadText: input.threadText, provider, model });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AnswerGenerationSetupError) {
      return NextResponse.json(
        { error: "The thread-summary model provider is not configured." },
        { status: 503 },
      );
    }
    return apiErrorResponse(error);
  }
}
