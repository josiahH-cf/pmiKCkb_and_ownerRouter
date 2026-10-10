import { AnswerClaimsSchema, CLAIM_LABELS } from "@/lib/ask/evidence-context";
import { DRAFT_BANNER, UNVERIFIED_PLACEHOLDER } from "@/lib/constants";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { canonicalizeValidCitations } from "@/lib/citations/validate";
import {
  friendlyModelLabel,
  readServerConfig,
  type ServerConfig,
} from "@/lib/config/server";
import {
  demoCitation,
  findDemoWorkflow,
  isUnsupportedDemoQuestion,
} from "@/lib/demo/data";
import type { AskLogWriter } from "@/lib/firestore/ask-logs";
import { FirestoreAskLogWriter } from "@/lib/firestore/ask-logs";
import { isLiveReadOnlyContext } from "@/lib/environment/descriptor";
import { getProcessDefinition } from "@/lib/firestore/workflows";
import {
  ensureDraftBanner,
  GoogleGenAiAnswerGenerator,
  type AnswerGenerator,
  type AnswerProcessContext,
  type GeneratedAnswer,
} from "@/lib/llm/answer";
import type {
  GroundedSearchResult,
  RetrievalClient,
} from "@/lib/retrieval/vertex-search";
import { VertexSearchRetrievalClient } from "@/lib/retrieval/vertex-search";
import type { AskRequest, AskResponse } from "@/lib/schemas";
import { scopeAskRequest } from "@/lib/space-scope-resources";
import type { SourceState } from "@/lib/source-state";
import { classifyGrounding, noReliableSourceResponse } from "@/lib/source-state";

import {
  conversationMemoryNote,
  conversationRetrievalQuestion,
} from "@/lib/assistant-history/memory-types";
import type { ConversationMemory } from "@/lib/assistant-history/memory-types";

export interface AskServiceOptions {
  memory?: ConversationMemory;
  answerGenerator?: AnswerGenerator;
  askLogWriter?: AskLogWriter;
  config?: ServerConfig;
  retrievalClient?: RetrievalClient;
  /** Resolves a process id to model-hint context. Injectable for tests; defaults to a guarded read of
   *  the process definition. Returns null when the id is absent/unreadable (an enhancement, never fatal). */
  processProvider?: (processId: string) => Promise<AnswerProcessContext | null>;
}

/** Default process-context resolver: a guarded read of the trusted definition. Never throws — process
 *  context is a model hint, so a missing/unreadable definition just yields no context. */
async function resolveProcessContext(
  user: AuthenticatedUser,
  processId: string,
): Promise<AnswerProcessContext | null> {
  try {
    const definition = await getProcessDefinition(user, processId);
    return {
      name: definition.name,
      outcome: definition.short_outcome,
      steps: definition.steps.slice(0, 8).map((step) => step.title),
    };
  } catch {
    return null;
  }
}

export async function answerQuestion(
  user: AuthenticatedUser,
  request: AskRequest,
  options: AskServiceOptions = {},
): Promise<AskResponse> {
  const config = options.config ?? readServerConfig();
  // Local rehearsal may answer from real sources, but it cannot prepare even a transient draft.
  // Enforce that server-side because the existing Console client always asks for draft_enabled=true.
  const effectiveRequest = isLiveReadOnlyContext(config.environment)
    ? { ...request, draft_enabled: false }
    : request;
  const response = await produceAnswer(user, effectiveRequest, { ...options, config });
  // Answer transparency (Slice 4): stamp the configured answer-model label + the number of sources
  // shown on EVERY result path (generated, demo, no-source, review-only). Never overrides a value a
  // path already set.
  return {
    ...response,
    evidence_context: response.evidence_context ?? {
      answered_at: new Date().toISOString(),
      mode: response.citations.length ? "source_facts" : "unknown",
      claims: [],
      coverage:
        response.source_state === "Verified Source"
          ? []
          : [`Source coverage: ${response.source_state}.`],
    },
    ...(options.memory && conversationMemoryNote(options.memory)
      ? { context_note: conversationMemoryNote(options.memory) }
      : {}),
    answered_by: response.answered_by ?? {
      model: friendlyModelLabel(config.geminiAnswerModel),
      source_count: response.citations.length,
    },
  };
}

async function produceAnswer(
  user: AuthenticatedUser,
  request: AskRequest,
  options: AskServiceOptions = {},
): Promise<AskResponse> {
  request = scopeAskRequest(user, request);
  const config = options.config ?? readServerConfig();
  const askLogWriter =
    isLiveReadOnlyContext(config.environment) || config.askDemoMode
      ? undefined
      : (options.askLogWriter ?? new FirestoreAskLogWriter());

  if (config.askDemoMode) {
    const response = answerDemoQuestion(user, request);
    await writeAskLog(askLogWriter, user, request, response, []);
    return response;
  }

  let grounding: GroundedSearchResult,
    retrievalUnavailable = false;
  try {
    const retrievalClient =
      options.retrievalClient ?? new VertexSearchRetrievalClient(config);
    grounding = await retrievalClient.search({
      question: conversationRetrievalQuestion(request.question, options.memory),
      spaceId: request.space,
    });
  } catch {
    retrievalUnavailable = true;
    grounding = { sources: [], sourceIds: [], citations: [], confidence: 0 };
  }

  const sourceState =
    grounding.sources.length === 0 || grounding.citations.length === 0
      ? "No Reliable Source Found"
      : classifyGrounding({
          confidence: grounding.confidence,
          hasConflict: grounding.hasConflict,
          hasOpenPlaceholder: grounding.hasOpenPlaceholder,
          isPartial: grounding.sources.some(
            (source) => source.approvalStatus !== "Approved",
          ),
          supportingDocumentCount: grounding.sources.length,
          threshold: config.groundingConfidenceThreshold,
        });

  const process = request.process_id
    ? ((await (options.processProvider ?? ((id) => resolveProcessContext(user, id)))(
        request.process_id,
      )) ?? undefined)
    : undefined;

  let response: AskResponse;
  try {
    const answerGenerator =
      options.answerGenerator ?? new GoogleGenAiAnswerGenerator(config);
    const generated = await answerGenerator.generateAnswer({
      ask: request,
      grounding,
      sourceState,
      process,
      memory: options.memory,
    });
    response = finalizeGeneratedAnswer(
      request,
      sourceState,
      grounding,
      generated,
      options.memory,
    );
  } catch {
    const unknown = retrievalUnavailable
      ? "Current PMI source retrieval and answer generation are unavailable."
      : "Answer generation is unavailable. Retrieved sources have not been interpreted into an answer; no current source fact was established.";
    const recommendation =
      "Keep this question and its workflow context, open an available linked current record, and retry the answer. No policy, contact, amount or completed action should be inferred from this interruption.";
    response = {
      answered_by: { model: "Application fallback", source_count: 0 },
      question: request.question,
      source_state:
        sourceState === "Conflict Found" || sourceState === "Open Placeholder"
          ? sourceState
          : "No Reliable Source Found",
      answer: `Unknown: ${unknown}\n\nRecommendation: ${recommendation}`,
      handling_steps: [],
      citations: [],
      draft: "",
      evidence_context: {
        answered_at: new Date().toISOString(),
        mode: "guidance",
        claims: [
          { kind: "unknown", text: unknown, source_ids: [], history_seq: null },
          {
            kind: "recommendation",
            text: recommendation,
            source_ids: [],
            history_seq: null,
          },
        ],
        coverage: [
          retrievalUnavailable
            ? "Current sources were unavailable. Historical conversation context does not establish current source truth."
            : `Source retrieval completed with coverage: ${sourceState}. Answer generation did not establish a source fact.`,
        ],
      },
    };
  }
  if (retrievalUnavailable) {
    response.evidence_context = {
      ...(response.evidence_context ?? {
        answered_at: new Date().toISOString(),
        mode: "unknown" as const,
        claims: [],
      }),
      coverage: [
        ...(response.evidence_context?.coverage ?? []),
        "Current PMI source retrieval is unavailable; no current source fact was verified.",
      ],
    };
  }
  // An audit failure is a real service failure, not a model outage or a reason to write a second log.
  await writeAskLog(askLogWriter, user, request, response, grounding.sourceIds);
  return response;
}

function answerDemoQuestion(user: AuthenticatedUser, request: AskRequest): AskResponse {
  const workflow = findDemoWorkflow(request.question, request.space);

  if (isUnsupportedDemoQuestion(request.question, request.space) || !workflow) {
    return noReliableSourceResponse(request.question);
  }

  return {
    question: request.question,
    source_state: "Verified Source",
    answer: workflow.answer,
    handling_steps: workflow.handlingSteps,
    citations: [workflow.citation ?? demoCitation],
    draft: workflow.draft,
    escalation_owner: user.role === "Editor" ? "Approver" : "Process owner",
  };
}

function finalizeGeneratedAnswer(
  request: AskRequest,
  sourceState: SourceState,
  grounding: Awaited<ReturnType<RetrievalClient["search"]>>,
  generated: GeneratedAnswer,
  memory?: ConversationMemory,
): AskResponse {
  if (generated.claims) {
    const parsed = AnswerClaimsSchema.safeParse(generated.claims);
    if (!parsed.success) return noReliableSourceResponse(request.question);
    const current = new Set(grounding.citations.map((c) => c.source_id)),
      history = new Set(memory?.turns.map((t) => t.seq) ?? []),
      claims = parsed.data;
    const unresolved =
      sourceState === "Open Placeholder" ||
      sourceState === "Conflict Found" ||
      sourceState === "No Reliable Source Found";
    if (
      claims.some((c) =>
        c.kind === "source_fact"
          ? unresolved ||
            c.history_seq !== null ||
            !c.source_ids.length ||
            c.source_ids.some((id) => !current.has(id))
          : c.kind === "historical"
            ? c.source_ids.length > 0 ||
              c.history_seq === null ||
              !history.has(c.history_seq)
            : c.source_ids.length > 0 || c.history_seq !== null,
      )
    )
      return noReliableSourceResponse(request.question);
    const ids = new Set(claims.flatMap((c) => c.source_ids)),
      citations = grounding.citations.filter((c) => ids.has(c.source_id));
    const hasCurrent = claims.some((c) => c.kind === "source_fact"),
      hasOther = claims.some((c) => c.kind !== "source_fact"),
      hasGuidance = claims.some(
        (c) => c.kind === "recommendation" || c.kind === "historical",
      );
    return {
      question: request.question,
      source_state: hasCurrent
        ? sourceState
        : sourceState === "Verified Source" || sourceState === "Partial Source"
          ? "No Reliable Source Found"
          : sourceState,
      answer: claims.map((c) => `${CLAIM_LABELS[c.kind]}: ${c.text}`).join("\n\n"),
      handling_steps: [],
      citations,
      draft: "",
      evidence_context: {
        answered_at: new Date().toISOString(),
        mode: hasCurrent
          ? hasOther
            ? "mixed"
            : "source_facts"
          : hasGuidance
            ? "guidance"
            : "unknown",
        claims,
        coverage: [
          ...(!hasCurrent
            ? ["No current PMI source fact was established for this answer."]
            : []),
          ...(sourceState !== "Verified Source"
            ? [`Source coverage: ${sourceState}.`]
            : []),
          ...(claims.some((c) => c.kind === "historical")
            ? [
                "Historical statements retain their earlier meaning and do not verify current state.",
              ]
            : []),
        ],
      },
    };
  }
  // Legacy generators remain accepted only for grounded answers; unstructured text cannot bypass
  // the new certainty contract when the current sources are absent, conflicting or unresolved.
  if (sourceState === "Open Placeholder" || sourceState === "Conflict Found")
    return reviewOnlyResponse(request, sourceState, grounding.citations);
  if (sourceState === "No Reliable Source Found")
    return noReliableSourceResponse(request.question);

  if (generated.source_state === "No Reliable Source Found") {
    return noReliableSourceResponse(request.question);
  }

  const citations = canonicalizeValidCitations(generated.citations, grounding.citations);
  const answer = stripDraftBannerFromAnswer(generated.answer);

  if (!answer || citations.length === 0 || containsUnverifiedPlaceholder(answer)) {
    return noReliableSourceResponse(request.question);
  }

  return {
    question: request.question,
    answer,
    citations,
    draft: ensureDraftBanner(generated.draft, request.draft_enabled),
    escalation_owner: normalizeEscalationOwner(generated.escalation_owner, sourceState),
    handling_steps: generated.handling_steps,
    source_state: sourceState,
  };
}

function stripDraftBannerFromAnswer(answer: string) {
  const trimmed = answer.trim();

  if (!trimmed.startsWith(DRAFT_BANNER)) {
    return trimmed;
  }

  return trimmed.slice(DRAFT_BANNER.length).trim();
}

// The "Needs Verification: <fact>" placeholder belongs only in the draft (spec.md §10.2),
// never in the customer-facing answer. If the model leaks it into the answer, treat the
// answer as unsupported rather than returning unverified content to the user.
const UNVERIFIED_ANSWER_MARKER = UNVERIFIED_PLACEHOLDER.split("<")[0].trim();

function containsUnverifiedPlaceholder(answer: string) {
  return answer.toLowerCase().includes(UNVERIFIED_ANSWER_MARKER.toLowerCase());
}

function normalizeEscalationOwner(
  escalationOwner: string | undefined,
  sourceState: SourceState,
) {
  const fallback = sourceState === "Verified Source" ? undefined : "Process owner";
  const trimmed = escalationOwner?.trim();

  if (!trimmed) {
    return fallback;
  }

  if (trimmed.length > 48 || /[\r\n.!?;:]/.test(trimmed)) {
    return fallback;
  }

  const normalized = normalizeKnownEscalationOwner(trimmed);

  return normalized ?? fallback;
}

function normalizeKnownEscalationOwner(escalationOwner: string) {
  const normalized = escalationOwner.toLowerCase();

  if (normalized === "approver") {
    return "Approver";
  }

  if (normalized === "process owner") {
    return "Process owner";
  }

  return undefined;
}

function reviewOnlyResponse(
  request: AskRequest,
  sourceState: "Open Placeholder" | "Conflict Found",
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
