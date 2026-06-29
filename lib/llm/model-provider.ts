// Model-provider seam. The generative model call goes through a thin `ModelProvider` so a free
// local model can stand in for Gemini via the SAME answer path — exactly the injected-transport
// idiom used for RentVine (lib/integrations/rentvine/client.ts) and Sheets. Selection is by config
// and fenced from prod (lib/config/server.ts forces "gemini" when NODE_ENV=production). No I/O on
// import. The local path is dev/test-only and must point at a localhost / in-boundary endpoint:
// real grounding data flows to the model, so it stays inside the pmikcmetro.com boundary.

import { GoogleGenAI } from "@google/genai";
import type { ServerConfig } from "@/lib/config/server";

/** Narrow request a local model can satisfy as readily as Gemini. */
export interface ModelTextRequest {
  model: string;
  systemInstruction: string;
  userContent: string;
  temperature?: number;
  /** Structured-output hint. Honored by Gemini; local servers fall back to JSON mode + retry. */
  responseJsonSchema?: unknown;
}

export interface ModelTextResponse {
  text: string;
}

export interface ModelProvider {
  generateText(request: ModelTextRequest): Promise<ModelTextResponse>;
}

/** Setup failure (missing config / unusable provider). Re-exported by lib/llm/answer.ts so the
 * /api/ask route maps it to a 503 (see app/api/ask/route.ts). */
export class AnswerGenerationSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnswerGenerationSetupError";
  }
}

/** The subset of the GoogleGenAI models client this seam uses. */
export type GenAiModelsClient = Pick<GoogleGenAI["models"], "generateContent">;

export class GoogleGenAiModelProvider implements ModelProvider {
  private readonly models: GenAiModelsClient;

  constructor(config: ServerConfig, options: { models?: GenAiModelsClient } = {}) {
    this.models =
      options.models ??
      new GoogleGenAI({
        apiVersion: "v1",
        location: config.vertexAiLocation,
        project: requireGcpProjectId(config),
        vertexai: true,
      }).models;
  }

  async generateText(request: ModelTextRequest): Promise<ModelTextResponse> {
    const response = await this.models.generateContent({
      config: {
        responseJsonSchema: request.responseJsonSchema,
        responseMimeType: "application/json",
        systemInstruction: request.systemInstruction,
        temperature: request.temperature,
      },
      contents: request.userContent,
      model: request.model,
    });

    return { text: response.text ?? "" };
  }
}

// ---- Local model (OpenAI-compatible chat completions: Ollama / LM Studio / llama.cpp / vLLM) ----

export interface ModelHttpRequest {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface ModelHttpResponse {
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface ModelHttpTransport {
  send(request: ModelHttpRequest): Promise<ModelHttpResponse>;
}

/** Live transport (mirrors RentVine's createFetchTransport): AbortController timeout, buffered body. */
export function createModelFetchTransport(
  options: { timeoutMs?: number } = {},
): ModelHttpTransport {
  const timeoutMs = options.timeoutMs ?? 30_000;
  return {
    async send(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: controller.signal,
        });
        const bodyText = await response.text();
        return {
          status: response.status,
          text: async () => bodyText,
          json: async () => JSON.parse(bodyText) as unknown,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class LocalModelProvider implements ModelProvider {
  private readonly endpoint: string;

  constructor(
    baseUrl: string,
    private readonly model: string,
    private readonly transport: ModelHttpTransport,
  ) {
    const trimmed = baseUrl.trim();
    if (!trimmed) {
      throw new AnswerGenerationSetupError(
        "Missing LOCAL_MODEL_BASE_URL for the local model provider.",
      );
    }
    this.endpoint = `${trimmed.replace(/\/+$/, "")}/v1/chat/completions`;
  }

  async generateText(request: ModelTextRequest): Promise<ModelTextResponse> {
    // Modern local servers (Ollama >= 0.5, LM Studio, vLLM) support OpenAI-style schema-constrained
    // structured output — the local equivalent of Gemini's responseJsonSchema. When a schema is
    // supplied, constrain decoding to it so the model emits the exact shape (objects, enums, types)
    // instead of plausible-but-wrong JSON; fall back to loose JSON mode when no schema is given.
    // Either way parseGeneratedAnswerText (fence strip) + the 2-attempt retry in answer.ts stay as a net.
    const responseFormat = request.responseJsonSchema
      ? {
          type: "json_schema",
          json_schema: {
            name: "structured_output",
            strict: true,
            schema: request.responseJsonSchema,
          },
        }
      : { type: "json_object" };

    const response = await this.transport.send({
      method: "POST",
      url: this.endpoint,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: request.systemInstruction },
          { role: "user", content: request.userContent },
        ],
        temperature: request.temperature,
        response_format: responseFormat,
      }),
    });

    if (response.status < 200 || response.status >= 300) {
      // No body in the message — a local error response can echo the prompt (real grounding data).
      throw new AnswerGenerationSetupError(
        `Local model endpoint returned HTTP ${response.status}.`,
      );
    }

    const payload = (await response.json()) as OpenAiChatResponse;
    return { text: payload.choices?.[0]?.message?.content ?? "" };
  }
}

/** Build the configured provider. Local is selected only when config resolved it (prod is fenced). */
export function createModelProvider(
  config: ServerConfig,
  options: { transport?: ModelHttpTransport; models?: GenAiModelsClient } = {},
): ModelProvider {
  if (config.modelProvider === "local") {
    return new LocalModelProvider(
      config.localModelBaseUrl ?? "",
      config.localModelName,
      options.transport ?? createModelFetchTransport(),
    );
  }

  return new GoogleGenAiModelProvider(config, { models: options.models });
}

function requireGcpProjectId(config: Pick<ServerConfig, "gcpProjectId">): string {
  if (!config.gcpProjectId) {
    throw new AnswerGenerationSetupError("Missing GCP_PROJECT_ID for Gemini.");
  }

  return config.gcpProjectId;
}
