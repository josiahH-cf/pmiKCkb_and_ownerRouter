import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { ServerConfig } from "@/lib/config/server";
import { DRAFT_BANNER, SOURCE_STATES } from "@/lib/constants";
import type { GroundedSearchResult } from "@/lib/retrieval/vertex-search";
import { CitationSchema, type AskRequest } from "@/lib/schemas";
import type { SourceState } from "@/lib/source-state";
import {
  buildGroundedAnswerSystemPrompt,
  buildGroundedAnswerUserPrompt,
} from "@/lib/llm/prompt";

const GeneratedAnswerSchema = z
  .object({
    answer: z.string().trim().min(1),
    citations: z.array(CitationSchema),
    draft: z.string(),
    escalation_owner: z.string().trim().min(1).optional(),
    handling_steps: z.array(z.string().trim().min(1)),
    source_state: z.enum(SOURCE_STATES),
  })
  .strict();

export const ANSWER_RESPONSE_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    citations: {
      items: {
        additionalProperties: false,
        properties: {
          excerpt: { type: "string" },
          source_id: { type: "string" },
          title: { type: "string" },
          url: { type: "string" },
        },
        required: ["source_id", "title", "url"],
        type: "object",
      },
      type: "array",
    },
    draft: { type: "string" },
    escalation_owner: { type: "string" },
    handling_steps: {
      items: { type: "string" },
      type: "array",
    },
    source_state: {
      enum: SOURCE_STATES,
      type: "string",
    },
  },
  required: ["answer", "handling_steps", "source_state", "citations", "draft"],
  type: "object",
} as const;

export type GeneratedAnswer = z.infer<typeof GeneratedAnswerSchema>;

export interface AnswerGenerationRequest {
  ask: AskRequest;
  grounding: GroundedSearchResult;
  sourceState: SourceState;
}

export interface AnswerGenerator {
  generateAnswer(request: AnswerGenerationRequest): Promise<GeneratedAnswer>;
}

export class AnswerGenerationSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnswerGenerationSetupError";
  }
}

export class GeminiAnswerGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiAnswerGenerationError";
  }
}

type GenAiModelsClient = Pick<GoogleGenAI["models"], "generateContent">;

export class GoogleGenAiAnswerGenerator implements AnswerGenerator {
  private readonly models: GenAiModelsClient;

  constructor(
    private readonly config: ServerConfig,
    options: { models?: GenAiModelsClient } = {},
  ) {
    this.models =
      options.models ??
      new GoogleGenAI({
        apiVersion: "v1",
        location: config.vertexAiLocation,
        project: requiredProjectId(config),
        vertexai: true,
      }).models;
  }

  async generateAnswer(request: AnswerGenerationRequest) {
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.models.generateContent({
        config: {
          responseJsonSchema: ANSWER_RESPONSE_JSON_SCHEMA,
          responseMimeType: "application/json",
          systemInstruction: buildGroundedAnswerSystemPrompt(),
          temperature: 0.2,
        },
        contents: buildGroundedAnswerUserPrompt(request, {
          retry: attempt > 0,
        }),
        model: this.config.geminiAnswerModel,
      });

      try {
        return parseGeneratedAnswerText(response.text ?? "");
      } catch (error) {
        lastError = error;
      }
    }

    throw new GeminiAnswerGenerationError(
      `Gemini returned invalid answer JSON: ${readErrorMessage(lastError)}`,
    );
  }
}

export function parseGeneratedAnswerText(text: string) {
  const trimmed = stripJsonFence(text.trim());

  if (!trimmed) {
    throw new GeminiAnswerGenerationError("Gemini response did not include text.");
  }

  return GeneratedAnswerSchema.parse(JSON.parse(trimmed));
}

export function ensureDraftBanner(draft: string, draftEnabled: boolean) {
  const trimmed = draft.trim();

  if (!draftEnabled || !trimmed) {
    return "";
  }

  if (!trimmed.startsWith(DRAFT_BANNER)) {
    return `${DRAFT_BANNER}\n\n${trimmed}`;
  }

  const body = trimmed.slice(DRAFT_BANNER.length).trim();

  return body ? `${DRAFT_BANNER}\n\n${body}` : DRAFT_BANNER;
}

function requiredProjectId(config: Pick<ServerConfig, "gcpProjectId">) {
  if (!config.gcpProjectId) {
    throw new AnswerGenerationSetupError("Missing GCP_PROJECT_ID for Gemini.");
  }

  return config.gcpProjectId;
}

function stripJsonFence(text: string) {
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : text;
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown validation error";
}
