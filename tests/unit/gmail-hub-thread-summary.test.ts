import { describe, expect, it } from "vitest";

import { summarizeThread } from "@/lib/gmail-inbox-zero/thread-summary";
import type {
  ModelProvider,
  ModelTextRequest,
  ModelTextResponse,
} from "@/lib/llm/model-provider";

class FakeModelProvider implements ModelProvider {
  public calls = 0;
  public lastRequest: ModelTextRequest | undefined;

  constructor(
    private readonly responder: (
      request: ModelTextRequest,
    ) => ModelTextResponse | Promise<ModelTextResponse>,
  ) {}

  async generateText(request: ModelTextRequest): Promise<ModelTextResponse> {
    this.calls += 1;
    this.lastRequest = request;
    return this.responder(request);
  }
}

const respondWith = (payload: unknown) =>
  new FakeModelProvider(() => ({ text: JSON.stringify(payload) }));

const structured = {
  summary: "Vendor confirmed the invoice covers the completed repair.",
  waiting_on: "Owner approval to release payment.",
  suggested_next_action: "Send the owner the invoice for approval.",
};

function baseInput(
  provider: ModelProvider,
  threadText = "Vendor: invoice attached. Manager: thanks.",
) {
  return { threadText, provider, model: "test-model" };
}

describe("summarizeThread", () => {
  it("returns a structured summary with a single model call for valid JSON output", async () => {
    const provider = respondWith(structured);
    const result = await summarizeThread(baseInput(provider));

    expect(result.ok).toBe(true);
    expect(result.usedModel).toBe(true);
    expect(result.summary).toBe(structured.summary);
    expect(result.waiting_on).toBe(structured.waiting_on);
    expect(result.suggested_next_action).toBe(structured.suggested_next_action);
    expect(provider.calls).toBe(1);
    expect(provider.lastRequest?.temperature).toBe(0);
    expect(provider.lastRequest?.responseJsonSchema).toBeDefined();
  });

  it("degrades non-fatally when the model throws (usedModel:false, ok:true)", async () => {
    const provider = new FakeModelProvider(() => {
      throw new Error("model unreachable");
    });
    const result = await summarizeThread(baseInput(provider));

    expect(result.ok).toBe(true);
    expect(result.usedModel).toBe(false);
    expect(result.summary).toBe("");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("degrades when the model returns non-JSON text", async () => {
    const provider = new FakeModelProvider(() => ({ text: "not json at all" }));
    const result = await summarizeThread(baseInput(provider));
    expect(result.usedModel).toBe(false);
    expect(result.summary).toBe("");
  });

  it("degrades when the model omits the summary field", async () => {
    const provider = respondWith({ waiting_on: "x", suggested_next_action: "y" });
    const result = await summarizeThread(baseInput(provider));
    expect(result.usedModel).toBe(false);
    expect(result.summary).toBe("");
  });

  it("guards an empty paste before the model (ok:false, zero calls)", async () => {
    const provider = respondWith(structured);
    const result = await summarizeThread(baseInput(provider, "   \n  "));
    expect(result.ok).toBe(false);
    expect(provider.calls).toBe(0);
  });
});
