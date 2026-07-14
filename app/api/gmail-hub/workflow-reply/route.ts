import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { readServerConfig } from "@/lib/config/server";
import { inspectGmailDraftSafety } from "@/lib/gmail-inbox-zero/draft-safety";
import { buildWorkflowAiReply } from "@/lib/gmail-hub/ai-reply-policy";
import {
  getGovernedArtifact,
  GOVERNED_ARTIFACT_REFS,
  WORKFLOW_REPLY_POLICY_REF,
} from "@/lib/gmail-hub/governed-artifacts";
import { createGmailHubService } from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";
import { WorkflowCommunicationContextSchema } from "@/lib/gmail-hub/workflow-context";
import { requireWorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-authorization";
import {
  AnswerGenerationSetupError,
  createModelProvider,
} from "@/lib/llm/model-provider";

const WorkflowReplyInputSchema = z
  .object({
    artifactRef: z.enum(GOVERNED_ARTIFACT_REFS),
    category: z.string().trim().min(1).max(100),
    context: WorkflowCommunicationContextSchema,
    currentText: z.string().max(50_000).default(""),
    threadId: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

/** Transient proposal only: no store dependency and no mutation provider is exposed. */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, WorkflowReplyInputSchema);
    const artifact = getGovernedArtifact(input.artifactRef);
    const declaredSafety = inspectGmailDraftSafety({ category: input.category });
    if (!declaredSafety.allowed) {
      return NextResponse.json(refusedReply(artifact, declaredSafety.errors, false));
    }
    const actor = await requireWorkflowCommunicationContext(input.context, "edit");
    const thread = await createGmailHubService(actor).getThread(
      input.threadId,
      input.context,
    );
    const sourceTexts = thread.messages
      .slice(-10)
      .map((message) => [message.subject, message.bodyText].filter(Boolean).join("\n"));
    const contentSafety = inspectGmailDraftSafety({
      category: declaredSafety.categoryId,
      facts: sourceTexts,
    });
    if (!contentSafety.allowed) {
      return NextResponse.json(refusedReply(artifact, contentSafety.errors, false));
    }
    const config = readServerConfig();
    const result = await buildWorkflowAiReply({
      artifactRef: input.artifactRef,
      category: input.category,
      currentText: input.currentText,
      provider: createModelProvider(config),
      model:
        config.modelProvider === "local"
          ? config.localModelName
          : config.geminiAnswerModel,
      sources: thread.messages.slice(-10).map((message) => ({
        ref: `gmail-message:${message.id}`,
        label: `${message.from || "Unknown sender"} · ${message.date}`,
        text: [message.subject, message.bodyText].filter(Boolean).join("\n"),
        verified: true,
      })),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AnswerGenerationSetupError) {
      return NextResponse.json(
        { error: "The workflow-reply model provider is not configured." },
        { status: 503 },
      );
    }
    const gmailResponse = gmailHubErrorResponse(error);
    if (gmailResponse.status !== 500) return gmailResponse;
    return apiErrorResponse(error);
  }
}

function refusedReply(
  artifact: ReturnType<typeof getGovernedArtifact>,
  errors: string[],
  usedModel: boolean,
) {
  return {
    ok: false,
    reviewState: "Needs Review",
    applied: false,
    persisted: false,
    usedModel,
    policyRef: WORKFLOW_REPLY_POLICY_REF,
    artifactRef: artifact.ref,
    artifactHash: artifact.contentHash,
    proposal: "",
    proposalHash: "",
    diff: { added: [], removed: [] },
    sources: [],
    errors,
  };
}
