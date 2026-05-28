import { DRAFT_BANNER } from "@/lib/constants";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { canonicalizeValidCitations } from "@/lib/citations/validate";
import { readServerConfig, type ServerConfig } from "@/lib/config/server";
import {
  demoCitation,
  isLeaseRenewalsDemoQuestion,
  isUnsupportedDemoQuestion,
} from "@/lib/demo/data";
import type { AskLogWriter } from "@/lib/firestore/ask-logs";
import { FirestoreAskLogWriter } from "@/lib/firestore/ask-logs";
import {
  ensureDraftBanner,
  GeminiAnswerGenerationError,
  GoogleGenAiAnswerGenerator,
  type AnswerGenerator,
  type GeneratedAnswer,
} from "@/lib/llm/answer";
import type { RetrievalClient } from "@/lib/retrieval/vertex-search";
import { VertexSearchRetrievalClient } from "@/lib/retrieval/vertex-search";
import type { AskRequest, AskResponse } from "@/lib/schemas";
import type { SourceState } from "@/lib/source-state";
import { classifyGrounding, noReliableSourceResponse } from "@/lib/source-state";

export interface AskServiceOptions {
  answerGenerator?: AnswerGenerator;
  askLogWriter?: AskLogWriter;
  config?: ServerConfig;
  retrievalClient?: RetrievalClient;
}

export async function answerQuestion(
  user: AuthenticatedUser,
  request: AskRequest,
  options: AskServiceOptions = {},
): Promise<AskResponse> {
  const config = options.config ?? readServerConfig();
  const askLogWriter =
    options.askLogWriter ??
    (config.askDemoMode ? undefined : new FirestoreAskLogWriter());

  if (config.askDemoMode) {
    const response = answerDemoQuestion(user, request);
    await writeAskLog(askLogWriter, user, request, response, []);
    return response;
  }

  const retrievalClient =
    options.retrievalClient ?? new VertexSearchRetrievalClient(config);
  const grounding = await retrievalClient.search({
    question: request.question,
    spaceId: request.space,
  });

  if (grounding.sources.length === 0 || grounding.citations.length === 0) {
    const response = noReliableSourceResponse(request.question);
    await writeAskLog(askLogWriter, user, request, response, grounding.sourceIds);
    return response;
  }

  const sourceState = classifyGrounding({
    confidence: grounding.confidence,
    hasConflict: grounding.hasConflict,
    hasOpenPlaceholder: grounding.hasOpenPlaceholder,
    isPartial: grounding.sources.some((source) => source.approvalStatus !== "Approved"),
    supportingDocumentCount: grounding.sources.length,
    threshold: config.groundingConfidenceThreshold,
  });

  if (sourceState === "No Reliable Source Found") {
    const response = noReliableSourceResponse(request.question);
    await writeAskLog(askLogWriter, user, request, response, grounding.sourceIds);
    return response;
  }

  if (sourceState === "Bailey Placeholder" || sourceState === "Conflict Found") {
    const response = reviewOnlyResponse(request, sourceState, grounding.citations);
    await writeAskLog(askLogWriter, user, request, response, grounding.sourceIds);
    return response;
  }

  const answerGenerator =
    options.answerGenerator ?? new GoogleGenAiAnswerGenerator(config);

  try {
    const generated = await answerGenerator.generateAnswer({
      ask: request,
      grounding,
      sourceState,
    });
    const response = finalizeGeneratedAnswer(request, sourceState, grounding, generated);

    await writeAskLog(askLogWriter, user, request, response, grounding.sourceIds);
    return response;
  } catch (error) {
    if (!(error instanceof GeminiAnswerGenerationError)) {
      throw error;
    }

    const response = noReliableSourceResponse(request.question);
    await writeAskLog(askLogWriter, user, request, response, grounding.sourceIds);
    return response;
  }
}

function answerDemoQuestion(user: AuthenticatedUser, request: AskRequest): AskResponse {
  if (
    isUnsupportedDemoQuestion(request.question) ||
    !isLeaseRenewalsDemoQuestion(request.question)
  ) {
    return noReliableSourceResponse(request.question);
  }

  return {
    question: request.question,
    source_state: "Verified Source",
    answer:
      "Use the Lease Renewals demo SOP: check the lease and renewal status, confirm owner direction before commitments, and use approved follow-up wording only for documented details.",
    handling_steps: [
      "Open the Lease Renewals Space.",
      "Check the renewal SOP and any open placeholders.",
      "Use the approved owner follow-up template only for verified details.",
      "Create a placeholder for undocumented fees, timing, or approval details.",
    ],
    citations: [demoCitation],
    draft: `${DRAFT_BANNER}\n\nHi [Owner Name],\n\nWe are checking the renewal status and will confirm the recommended next step once the documented renewal details are verified.\n\nThank you,`,
    escalation_owner: user.role === "Editor" ? "Approver" : "Process owner",
  };
}

function finalizeGeneratedAnswer(
  request: AskRequest,
  sourceState: SourceState,
  grounding: Awaited<ReturnType<RetrievalClient["search"]>>,
  generated: GeneratedAnswer,
): AskResponse {
  if (generated.source_state === "No Reliable Source Found") {
    return noReliableSourceResponse(request.question);
  }

  const citations = canonicalizeValidCitations(generated.citations, grounding.citations);

  if (citations.length === 0) {
    return noReliableSourceResponse(request.question);
  }

  return {
    question: request.question,
    answer: generated.answer,
    citations,
    draft: ensureDraftBanner(generated.draft, request.draft_enabled),
    escalation_owner:
      generated.escalation_owner ??
      (sourceState === "Verified Source" ? undefined : "Process owner"),
    handling_steps: generated.handling_steps,
    source_state: sourceState,
  };
}

function reviewOnlyResponse(
  request: AskRequest,
  sourceState: "Bailey Placeholder" | "Conflict Found",
  citations: AskResponse["citations"],
): AskResponse {
  if (sourceState === "Conflict Found") {
    return {
      question: request.question,
      source_state: sourceState,
      answer:
        "The retrieved PMI KC sources appear to conflict. Review the cited sources and route the decision to an Approver instead of choosing a winner.",
      handling_steps: [
        "Open each cited source.",
        "Do not merge conflicting instructions into one answer.",
        "Create or update a placeholder for the decision that needs approval.",
      ],
      citations,
      draft: "",
      escalation_owner: "Approver",
    };
  }

  return {
    question: request.question,
    source_state: sourceState,
    answer:
      "A related PMI KC placeholder is still open. The KB should not answer this gap until the process owner fills and approves it.",
    handling_steps: [
      "Open the cited placeholder or source.",
      "Ask the process owner to fill the missing detail.",
      "Route the filled placeholder through the Approval Queue.",
    ],
    citations,
    draft: "",
    escalation_owner: "Process owner",
  };
}

async function writeAskLog(
  askLogWriter: AskLogWriter | undefined,
  user: AuthenticatedUser,
  request: AskRequest,
  response: AskResponse,
  groundingSourceIds: string[],
) {
  await askLogWriter?.write({
    groundingSourceIds,
    request,
    response,
    user,
  });
}
