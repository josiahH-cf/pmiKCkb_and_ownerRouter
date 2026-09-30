import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  friendlyModelLabel,
  isKnownGoodModel,
  readServerConfig,
} from "@/lib/config/server";
import {
  GoogleGenAiModelProvider,
  type GenAiModelsClient,
  type ModelCallTelemetry,
} from "@/lib/llm/model-provider";
import {
  CHEAP_LIVE_MODEL,
  LIVE_MODEL_LOCATION,
  PRO_MODEL,
} from "../../scripts/check-live-cost.mjs";
import {
  SUPPORTED_GEMINI_MODEL,
  SUPPORTED_GEMINI_MODEL_LOCATION,
} from "../../scripts/model-selection.mjs";

const genAiConstructions: Array<Record<string, unknown>> = [];

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: vi.fn() };
    constructor(options: Record<string, unknown>) {
      genAiConstructions.push(options);
    }
  },
}));

const ROOT = join(__dirname, "..", "..");
const RETIRING_MODEL = /gemini-(?:1\.0|1\.5|2\.0|2\.5)-[a-z-]+/;

afterEach(() => {
  genAiConstructions.length = 0;
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const path = join(ROOT, dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(relative(ROOT, path)));
    else if (/\.(?:ts|tsx|mjs|js)$/.test(entry)) out.push(path);
  }
  return out;
}

describe("S136 one supported model selection (ARCH-S136-1)", () => {
  it("selects the least-cost supported model on its global endpoint everywhere", () => {
    expect(SUPPORTED_GEMINI_MODEL).toBe("gemini-3.1-flash-lite");
    expect(SUPPORTED_GEMINI_MODEL_LOCATION).toBe("global");
    expect(CHEAP_LIVE_MODEL).toBe(SUPPORTED_GEMINI_MODEL);
    expect(LIVE_MODEL_LOCATION).toBe(SUPPORTED_GEMINI_MODEL_LOCATION);

    const config = readServerConfig({});
    expect(config.geminiAnswerModel).toBe(SUPPORTED_GEMINI_MODEL);
    expect(config.geminiClassifyModel).toBe(SUPPORTED_GEMINI_MODEL);
    expect(config.geminiModelLocation).toBe(SUPPORTED_GEMINI_MODEL_LOCATION);
    // The Cloud Run region stays its own setting and no longer chooses the model endpoint.
    expect(config.vertexAiLocation).toBe("us-central1");
  });

  it("keeps the environment template on the same selection", () => {
    const example = readFileSync(join(ROOT, ".env.example"), "utf8");
    expect(example).toMatch(/^GEMINI_MODEL_ANSWER=gemini-3\.1-flash-lite$/m);
    expect(example).toMatch(/^GEMINI_MODEL_CLASSIFY=gemini-3\.1-flash-lite$/m);
    expect(example).toMatch(/^GEMINI_MODEL_LOCATION=global$/m);
  });

  it("leaves no retiring model id in an active selector, default or fallback", () => {
    const offenders: string[] = [];
    for (const file of [
      ...sourceFiles("lib"),
      ...sourceFiles("app"),
      ...sourceFiles("components"),
      ...sourceFiles("scripts"),
    ]) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (!RETIRING_MODEL.test(line)) return;
        const rel = relative(ROOT, file).replaceAll("\\", "/");
        // The guards' expensive reference is a refusal sentinel, never a selection.
        if (
          rel === "scripts/check-live-cost.mjs" &&
          line.includes(`PRO_MODEL = "${PRO_MODEL}"`)
        )
          return;
        offenders.push(`${rel}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("flags retiring ids in the Admin panel label map while still reading them cleanly", () => {
    expect(isKnownGoodModel(SUPPORTED_GEMINI_MODEL)).toBe(true);
    expect(friendlyModelLabel(SUPPORTED_GEMINI_MODEL)).toBe("Gemini 3.1 Flash-Lite");
    expect(isKnownGoodModel("gemini-2.5-flash")).toBe(false);
    expect(friendlyModelLabel("gemini-2.5-flash")).toBe("Gemini 2.5 Flash");
  });
});

describe("S136 backend request contract (ARCH-S136-2, BEH-S136-2)", () => {
  const request = {
    model: SUPPORTED_GEMINI_MODEL,
    systemInstruction: "SYSTEM-INSTRUCTION-MARKER",
    userContent: "USER-CONTENT-MARKER",
    temperature: 0,
    responseJsonSchema: { type: "object" },
    purpose: "ask.answer",
  };

  it("builds the client on the model endpoint location, not the Cloud Run region", () => {
    new GoogleGenAiModelProvider(
      readServerConfig({
        GCP_PROJECT_ID: "pmikckb-test",
        VERTEX_AI_LOCATION: "us-central1",
      }),
    );
    expect(genAiConstructions).toHaveLength(1);
    expect(genAiConstructions[0]).toMatchObject({
      apiVersion: "v1",
      location: "global",
      project: "pmikckb-test",
      vertexai: true,
    });
  });

  it("records one bodyless call with the served model version, tokens and latency", async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"ok":true}',
      modelVersion: "gemini-3.1-flash-lite",
      usageMetadata: { promptTokenCount: 104, candidatesTokenCount: 12 },
    });
    const events: ModelCallTelemetry[] = [];
    let clock = 1_000;
    const provider = new GoogleGenAiModelProvider(
      readServerConfig({ GCP_PROJECT_ID: "pmikckb-test" }),
      {
        models: { generateContent } as unknown as GenAiModelsClient,
        telemetry: (event) => events.push(event),
        now: () => (clock += 250),
      },
    );

    const response = await provider.generateText({ ...request, timeoutMs: 20_000 });

    expect(response).toEqual({
      text: '{"ok":true}',
      modelVersion: "gemini-3.1-flash-lite",
      usage: { promptTokens: 104, outputTokens: 12, thoughtsTokens: null },
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0]).toMatchObject({
      model: SUPPORTED_GEMINI_MODEL,
      config: {
        responseMimeType: "application/json",
        httpOptions: { timeout: 20_000 },
      },
    });
    expect(events).toEqual([
      {
        event: "model_call",
        purpose: "ask.answer",
        model: SUPPORTED_GEMINI_MODEL,
        location: "global",
        outcome: "ok",
        latencyMs: 250,
        modelVersion: "gemini-3.1-flash-lite",
        promptTokens: 104,
        outputTokens: 12,
        thoughtsTokens: null,
      },
    ]);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("SYSTEM-INSTRUCTION-MARKER");
    expect(serialized).not.toContain("USER-CONTENT-MARKER");
    expect(serialized).not.toContain('{\\"ok\\":true}');
  });

  it("fails visibly on an unavailable model with no retry on another model", async () => {
    const unavailable = Object.assign(new Error("Publisher model was not found"), {
      name: "ApiError",
      status: 404,
    });
    const generateContent = vi.fn().mockRejectedValue(unavailable);
    const events: ModelCallTelemetry[] = [];
    const provider = new GoogleGenAiModelProvider(
      readServerConfig({ GCP_PROJECT_ID: "pmikckb-test" }),
      {
        models: { generateContent } as unknown as GenAiModelsClient,
        telemetry: (event) => events.push(event),
      },
    );

    await expect(provider.generateText(request)).rejects.toBe(unavailable);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].model).toBe(SUPPORTED_GEMINI_MODEL);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      outcome: "error",
      errorName: "ApiError",
      status: 404,
      model: SUPPORTED_GEMINI_MODEL,
      modelVersion: null,
    });
    expect(JSON.stringify(events)).not.toContain("Publisher model was not found");
  });
});
