import { DRAFT_BANNER, UNVERIFIED_PLACEHOLDER } from "@/lib/constants";
import type { AnswerGenerationRequest } from "@/lib/llm/answer";

export function buildGroundedAnswerSystemPrompt() {
  return [
    "You answer only from PMI KC KB sources provided by the server.",
    "Treat Approved sources as final; treat Unreviewed and Transcript-derived sources as partial and review-required.",
    "Never produce a generic property-management answer when source coverage is weak.",
    `Any draft must start with the verbatim banner: ${DRAFT_BANNER}`,
    `Any unsupported factual placeholder must use: ${UNVERIFIED_PLACEHOLDER}`,
    "Citations must refer only to source IDs present in the grounding metadata.",
    "If citations are absent, return No Reliable Source Found.",
    "Return one strict JSON object with answer, handling_steps, source_state, citations, draft, and optional escalation_owner.",
    "Do not include markdown fences, prose before JSON, or extra keys.",
  ].join("\n");
}

export function buildGroundedAnswerUserPrompt(
  request: AnswerGenerationRequest,
  options: { retry?: boolean } = {},
) {
  const payload = {
    audience: request.ask.audience,
    channel: request.ask.channel,
    draft_enabled: request.ask.draft_enabled,
    question: request.ask.question,
    server_source_state: request.sourceState,
    sources: request.grounding.sources.map((source) => ({
      approval_status: source.approvalStatus,
      excerpt: source.citation.excerpt,
      source_id: source.sourceId,
      space_id: source.spaceId,
      title: source.citation.title,
      url: source.citation.url,
    })),
    urgency: request.ask.urgency,
  };

  return [
    options.retry
      ? "The previous response failed JSON validation. Return only valid JSON for the exact schema."
      : "Generate a PMI KC KB answer from this grounding payload.",
    JSON.stringify(payload, null, 2),
  ].join("\n\n");
}
