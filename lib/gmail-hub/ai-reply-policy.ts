import { createHash } from "node:crypto";

import { inspectGmailDraftSafety } from "@/lib/gmail-inbox-zero/draft-safety";
import {
  getGovernedArtifact,
  getGovernedArtifactBaseCopy,
  type GovernedArtifactRef,
  WORKFLOW_REPLY_POLICY_REF,
} from "@/lib/gmail-hub/governed-artifacts";
import type { ModelProvider } from "@/lib/llm/model-provider";

export interface WorkflowReplySource {
  ref: string;
  label: string;
  text: string;
  verified: boolean;
}

export interface WorkflowAiReplyInput {
  artifactRef: GovernedArtifactRef;
  category: string;
  currentText: string;
  model: string;
  provider: ModelProvider;
  sources: readonly WorkflowReplySource[];
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: { draft: { type: "string" } },
  required: ["draft"],
  additionalProperties: false,
} as const;

const systemInstruction = [
  "Draft a property-management workflow reply for human review.",
  "Use only the authorized source blocks and the human's current draft.",
  "Do not invent or infer an amount, date, recipient, legal position, promise, vendor choice, approval, completion state, or channel-success claim.",
  'When a required fact is absent, write "Needs Verification: <fact>".',
  "Return only JSON with one field named draft.",
].join(" ");

export async function buildWorkflowAiReply(input: WorkflowAiReplyInput) {
  const artifact = getGovernedArtifact(input.artifactRef);
  const artifactBaseCopy = getGovernedArtifactBaseCopy(input.artifactRef);
  const verifiedSources = input.sources.filter(
    (source) => source.verified && source.ref.trim() && source.text.trim(),
  );
  const safety = inspectGmailDraftSafety({
    category: input.category,
    facts: verifiedSources.map((source) => source.text),
  });
  if (!safety.allowed) {
    return refused(artifact, safety.errors, false, verifiedSources);
  }
  if (verifiedSources.length === 0) {
    return refused(
      artifact,
      ["At least one authorized verified source is required."],
      false,
      verifiedSources,
    );
  }

  let text: string;
  try {
    text = (
      await input.provider.generateText({
        model: input.model,
        systemInstruction,
        userContent: [
          `Artifact: ${artifact.ref} (${artifact.contentHash})`,
          `Approved base artifact copy:\n${artifactBaseCopy}`,
          `Current human draft:\n${input.currentText.trim() || "(none)"}`,
          ...verifiedSources.map(
            (source, index) =>
              `Authorized source ${index + 1} [${source.ref}] ${source.label}:\n${source.text}`,
          ),
        ].join("\n\n---\n\n"),
        temperature: 0,
        responseJsonSchema: RESPONSE_SCHEMA,
      })
    ).text;
  } catch {
    return refused(
      artifact,
      ["The model could not be reached; no reply was produced."],
      true,
      verifiedSources,
    );
  }

  const proposal = parseProposal(text);
  if (!proposal) {
    return refused(
      artifact,
      ["The model returned no usable reply."],
      true,
      verifiedSources,
    );
  }
  const authorizedCorpus = [
    artifactBaseCopy,
    ...verifiedSources.map((source) => source.text),
  ].join("\n");
  const violations = findUnsupportedClaims(proposal, authorizedCorpus);
  if (violations.length > 0) {
    return refused(
      artifact,
      violations.map((violation) => `Needs Verification: ${violation}`),
      true,
      verifiedSources,
    );
  }

  return {
    ok: true as const,
    reviewState: "Needs Review" as const,
    applied: false as const,
    persisted: false as const,
    usedModel: true as const,
    policyRef: WORKFLOW_REPLY_POLICY_REF,
    artifactRef: artifact.ref,
    artifactHash: artifact.contentHash,
    proposal,
    proposalHash: sha256(proposal),
    diff: lineDiff(input.currentText, proposal),
    sources: verifiedSources.map((source) => ({
      ref: source.ref,
      label: source.label,
    })),
    errors: [] as string[],
  };
}

export function findUnsupportedClaims(proposal: string, authorizedCorpus: string) {
  const normalizedCorpus = normalize(authorizedCorpus);
  const violations: string[] = [];
  for (const token of extractSensitiveClaims(proposal)) {
    if (!normalizedCorpus.includes(normalize(token))) {
      violations.push(`unsupported value ${token}`);
    }
  }
  for (const sentence of proposal.split(/(?<=[.!?])\s+|\n+/)) {
    const normalizedSentence = normalize(sentence);
    if (!normalizedSentence) continue;
    const sentenceClaims = extractSensitiveClaims(sentence);
    if (
      /\b(?:we will|we'll|promise|guarantee|completed|resolved|closed|selected|liable|legal position|emailed|messaged|texted|sent)\b/.test(
        normalizedSentence,
      ) &&
      !normalizedCorpus.includes(normalizedSentence)
    ) {
      violations.push(`unsupported commitment or completion claim: ${sentence.trim()}`);
    }
    if (
      /\bapproved\b/.test(normalizedSentence) &&
      sentenceClaims.length === 0 &&
      !normalizedCorpus.includes(normalizedSentence)
    ) {
      violations.push(`unsupported approval claim: ${sentence.trim()}`);
    }
  }
  return [...new Set(violations)];
}

export function lineDiff(before: string, after: string) {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  return {
    removed: beforeLines.filter((line) => !afterLines.includes(line)),
    added: afterLines.filter((line) => !beforeLines.includes(line)),
  };
}

function refused(
  artifact: ReturnType<typeof getGovernedArtifact>,
  errors: string[],
  usedModel: boolean,
  sources: readonly WorkflowReplySource[],
) {
  return {
    ok: false as const,
    reviewState: "Needs Review" as const,
    applied: false as const,
    persisted: false as const,
    usedModel,
    policyRef: WORKFLOW_REPLY_POLICY_REF,
    artifactRef: artifact.ref,
    artifactHash: artifact.contentHash,
    proposal: "",
    proposalHash: "",
    diff: { added: [] as string[], removed: [] as string[] },
    sources: sources.map((source) => ({ ref: source.ref, label: source.label })),
    errors,
  };
}

function parseProposal(text: string) {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    return typeof value.draft === "string" && value.draft.trim()
      ? value.draft.trim()
      : null;
  } catch {
    return null;
  }
}

function extractSensitiveClaims(value: string) {
  return [
    ...(value.match(/\$\s?\d[\d,]*(?:\.\d{1,2})?/g) ?? []),
    ...(value.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []),
    ...(value.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g) ?? []),
    ...(value.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? []),
  ];
}

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
