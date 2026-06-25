import { describe, expect, it, vi } from "vitest";
import { readServerConfig } from "@/lib/config/server";
import {
  AnswerGenerationSetupError,
  GoogleGenAiModelProvider,
  LocalModelProvider,
  createModelProvider,
  type ModelHttpRequest,
  type ModelHttpTransport,
} from "@/lib/llm/model-provider";

function recordingTransport(reply: { status?: number; body?: unknown } = {}): {
  transport: ModelHttpTransport;
  calls: ModelHttpRequest[];
} {
  const calls: ModelHttpRequest[] = [];
  const status = reply.status ?? 200;
  const body = reply.body ?? {
    choices: [{ message: { content: '{"answer":"ok"}' } }],
  };
  const transport: ModelHttpTransport = {
    async send(request) {
      calls.push(request);
      return {
        status,
        text: async () => JSON.stringify(body),
        json: async () => body,
      };
    },
  };
  return { transport, calls };
}

describe("createModelProvider", () => {
  it("selects the local provider when configured", () => {
    const config = readServerConfig({
      MODEL_PROVIDER: "local",
      LOCAL_MODEL_BASE_URL: "http://localhost:1234",
    });
    expect(createModelProvider(config)).toBeInstanceOf(LocalModelProvider);
  });

  it("selects the Gemini provider by default", () => {
    const config = readServerConfig({ GCP_PROJECT_ID: "pmikckb-test" });
    const provider = createModelProvider(config, {
      models: { generateContent: vi.fn() } as never,
    });
    expect(provider).toBeInstanceOf(GoogleGenAiModelProvider);
  });
});

describe("LocalModelProvider", () => {
  it("posts an OpenAI-compatible chat completion and returns the message text", async () => {
    const { transport, calls } = recordingTransport({
      body: { choices: [{ message: { content: '{"answer":"hi"}' } }] },
    });
    const provider = new LocalModelProvider(
      "http://localhost:1234/",
      "llama-local",
      transport,
    );

    const result = await provider.generateText({
      model: "ignored-by-local",
      systemInstruction: "SYS",
      userContent: "USER",
      temperature: 0.2,
    });

    expect(result.text).toBe('{"answer":"hi"}');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://localhost:1234/v1/chat/completions");
    const body = JSON.parse(calls[0].body);
    expect(body.model).toBe("llama-local");
    expect(body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "USER" },
    ]);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("rejects an empty base URL as a setup error", () => {
    const { transport } = recordingTransport();
    expect(() => new LocalModelProvider("", "m", transport)).toThrow(
      AnswerGenerationSetupError,
    );
  });

  it("treats a non-2xx response as a setup error without echoing the body", async () => {
    const { transport } = recordingTransport({ status: 500 });
    const provider = new LocalModelProvider("http://localhost:1234", "m", transport);
    await expect(
      provider.generateText({
        model: "m",
        systemInstruction: "S",
        userContent: "U",
      }),
    ).rejects.toBeInstanceOf(AnswerGenerationSetupError);
  });
});

describe("GoogleGenAiModelProvider", () => {
  it("maps generateText onto generateContent and returns the text", async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: '{"answer":"ok"}' });
    const config = readServerConfig({ GCP_PROJECT_ID: "pmikckb-test" });
    const provider = new GoogleGenAiModelProvider(config, {
      models: { generateContent } as never,
    });

    const result = await provider.generateText({
      model: "gemini-2.5-pro",
      systemInstruction: "SYS",
      userContent: "USER",
      temperature: 0.2,
      responseJsonSchema: { type: "object" },
    });

    expect(result.text).toBe('{"answer":"ok"}');
    expect(generateContent).toHaveBeenCalledWith({
      config: {
        responseJsonSchema: { type: "object" },
        responseMimeType: "application/json",
        systemInstruction: "SYS",
        temperature: 0.2,
      },
      contents: "USER",
      model: "gemini-2.5-pro",
    });
  });

  it("rejects a missing GCP project id as a setup error", () => {
    const config = readServerConfig({});
    expect(() => new GoogleGenAiModelProvider(config)).toThrow(
      AnswerGenerationSetupError,
    );
  });
});
