import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import { composeAnticipatoryReplyDraft } from "@/lib/gmail-inbox-zero/anticipatory-draft";
import { GMAIL_RULE_STATUSES } from "@/lib/gmail-inbox-zero/constants";
import { AnswerGenerationSetupError, createModelProvider } from "@/lib/llm/model-provider";

const AnticipatoryDraftInputSchema = z.object({
  template: z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    body: z.string().trim().min(1),
    status: z.enum(GMAIL_RULE_STATUSES),
  }),
  message: z.object({
    sender: z.string().trim().min(1),
    subject: z.string().trim().min(1),
    category: z.string().trim().min(1).optional(),
  }),
  missingFacts: z.array(z.string().trim().min(1)).optional(),
  category: z.string().trim().min(1).optional(),
});

// POST /api/gmail-hub/anticipatory-draft — compose an anticipatory reply draft over PASTED, sanitized
// TriageMessageFacts + an Approved reply template, through the ModelProvider seam (local model in dev,
// Gemini in prod; the prod fence lives in readServerConfig). The deterministic spine runs FIRST inside
// composeAnticipatoryReplyDraft: an unapproved template or a hard-excluded category refuses BEFORE the
// model is ever called (refusedBeforeModel:true, usedModel:false). This route makes NO Gmail call — it
// imports no @/lib/gmail-runtime/*; the ceiling is a review-before-send draft a human sends. Edit-gated.
export async function POST(request: Request) {
  try {
    await requireCapability("edit");
    const input = await parseJsonBody(request, AnticipatoryDraftInputSchema);

    const config = readServerConfig();
    const provider = createModelProvider(config);
    const model =
      config.modelProvider === "local" ? config.localModelName : config.geminiAnswerModel;

    const result = await composeAnticipatoryReplyDraft({
      template: input.template,
      message: input.message,
      missingFacts: input.missingFacts,
      category: input.category,
      provider,
      model,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AnswerGenerationSetupError) {
      // Provider construction failed (e.g. missing model config). Surface a clean 503 rather than
      // letting it fall through to an unhandled 500 — no draft was produced and no Gmail call happened.
      return NextResponse.json(
        { error: "The reply-draft model provider is not configured." },
        { status: 503 },
      );
    }
    return apiErrorResponse(error);
  }
}
