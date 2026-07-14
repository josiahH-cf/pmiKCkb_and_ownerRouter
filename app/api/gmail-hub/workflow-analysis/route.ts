import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { readServerConfig } from "@/lib/config/server";
import { inspectGmailDraftSafety } from "@/lib/gmail-inbox-zero/draft-safety";
import { summarizeThread } from "@/lib/gmail-inbox-zero/thread-summary";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";
import { WorkflowCommunicationContextSchema } from "@/lib/gmail-hub/workflow-context";
import { requireWorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-authorization";
import {
  AnswerGenerationSetupError,
  createModelProvider,
} from "@/lib/llm/model-provider";

const WorkflowAnalysisInputSchema = z
  .object({
    context: WorkflowCommunicationContextSchema,
    threadId: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9_-]+$/),
    category: z.string().trim().min(1).max(100),
  })
  .strict();

/** Explicit, one-thread analysis. It persists nothing and can only return a Needs Review proposal. */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, WorkflowAnalysisInputSchema);
    const user = await requireWorkflowCommunicationContext(input.context, "edit");

    // Unknown and hard-excluded categories refuse before Gmail or model construction.
    const declaredSafety = inspectGmailDraftSafety({ category: input.category });
    if (!declaredSafety.allowed || !declaredSafety.categoryId) {
      return NextResponse.json({
        ok: false,
        review_state: "Needs Review",
        usedModel: false,
        refusedBeforeModel: true,
        errors: declaredSafety.errors,
      });
    }

    const thread = await createGmailHubService(user).getThread(
      input.threadId,
      input.context,
    );
    const latestSubject = thread.messages.at(-1)?.subject ?? "";
    const bodyFacts = thread.messages.map((message) => message.bodyText).slice(-10);
    const contentSafety = inspectGmailDraftSafety({
      category: declaredSafety.categoryId,
      subject: latestSubject,
      facts: bodyFacts,
    });
    if (!contentSafety.allowed) {
      return NextResponse.json({
        ok: false,
        review_state: "Needs Review",
        usedModel: false,
        refusedBeforeModel: true,
        errors: contentSafety.errors,
      });
    }

    const config = readServerConfig();
    const provider = createModelProvider(config);
    const model =
      config.modelProvider === "local" ? config.localModelName : config.geminiAnswerModel;
    const threadText = thread.messages
      .slice(-10)
      .map(
        (message) =>
          `From: ${message.from}\nSubject: ${message.subject}\n${message.bodyText}`,
      )
      .join("\n\n---\n\n")
      .slice(0, 60_000);
    const analysis = await summarizeThread({ threadText, provider, model });

    return NextResponse.json({
      ok: analysis.ok,
      review_state: "Needs Review",
      applied: false,
      persisted: false,
      usedModel: analysis.usedModel,
      refusedBeforeModel: false,
      proposal: {
        summary: analysis.summary,
        waiting_on: analysis.waiting_on,
        suggested_next_action: analysis.suggested_next_action,
      },
      provenance: {
        source: "Gmail",
        threadId: thread.id,
        messageIds: thread.messages.map((message) => message.id),
        workflowEntityId: input.context.entityId,
      },
      errors: analysis.errors,
    });
  } catch (error) {
    if (error instanceof AnswerGenerationSetupError) {
      return NextResponse.json(
        { error: "The workflow-analysis model provider is not configured." },
        { status: 503 },
      );
    }
    const gmailResponse = gmailHubErrorResponse(error);
    if (gmailResponse.status !== 500) return gmailResponse;
    return apiErrorResponse(error);
  }
}
