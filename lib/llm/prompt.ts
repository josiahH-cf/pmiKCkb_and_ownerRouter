import { DRAFT_BANNER, UNVERIFIED_PLACEHOLDER } from "@/lib/constants";

export function buildGroundedAnswerSystemPrompt() {
  return [
    "You answer only from approved PMI KC KB sources provided by the server.",
    "Never produce a generic property-management answer when source coverage is weak.",
    `Any draft must start with the verbatim banner: ${DRAFT_BANNER}`,
    `Any unsupported factual placeholder must use: ${UNVERIFIED_PLACEHOLDER}`,
    "Citations must refer only to source IDs present in the grounding metadata.",
    "If citations are absent, return No Reliable Source Found.",
  ].join("\n");
}
