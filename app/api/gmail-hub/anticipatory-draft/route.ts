import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import { composeAnticipatoryReplyDraft } from "@/lib/gmail-inbox-zero/anticipatory-draft";
import { inspectGmailDraftSafety } from "@/lib/gmail-inbox-zero/draft-safety";
import { resolveReplyTemplate } from "@/lib/gmail-inbox-zero/template-store";
import {
  AnswerGenerationSetupError,
  createModelProvider,
} from "@/lib/llm/model-provider";

// F-TMPL-3: the client sends only a template_id. The body + status are resolved server-side from the
// approved store (or the server-defined sample patterns), never trusted from the request.
const AnticipatoryDraftInputSchema = z.object({
  template_id: z.string().trim().min(1),
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
    const user = await requireCapability("edit");
    const input = await parseJsonBody(request, AnticipatoryDraftInputSchema);

    // Client category text is untrusted. Refuse unknown/excluded category aliases or excluded intent
    // in the subject/facts before config is read or a model provider is constructed.
    const safety = inspectGmailDraftSafety({
      category: input.category ?? input.message.category,
      subject: input.message.subject,
      facts: input.missingFacts,
    });
    if (!safety.allowed || !safety.categoryId) {
      return NextResponse.json({
        ok: false,
        usedModel: false,
        refusedBeforeModel: true,
        errors: safety.errors,
      });
    }

    // F-TMPL-3: resolve the template server-side by id. An unknown id refuses BEFORE the model, the
    // same shape as a spine refusal; a stored non-Approved template resolves to Proposed and the spine
    // then refuses it — either way the client cannot influence the drafted prose or its approval state.
    const template = await resolveReplyTemplate(user, input.template_id);
    if (!template) {
      return NextResponse.json({
        ok: false,
        usedModel: false,
        refusedBeforeModel: true,
        errors: [
          `Reply template "${input.template_id}" was not found among approved patterns.`,
        ],
      });
    }

    const config = readServerConfig();
    const provider = createModelProvider(config);
    const model =
      config.modelProvider === "local" ? config.localModelName : config.geminiAnswerModel;

    const result = await composeAnticipatoryReplyDraft({
      template,
      message: { ...input.message, category: safety.categoryId },
      missingFacts: input.missingFacts,
      category: safety.categoryId,
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
