import { afterEach, expect, it, vi } from "vitest";
import { refineEmailDraft } from "@/lib/email-refinement/refine";
import { buildWorkflowAiReply } from "@/lib/gmail-hub/ai-reply-policy";
import { GoogleGenAiAnswerGenerator } from "@/lib/llm/answer";
import type { ServerConfig } from "@/lib/config/server";
import type { ModelProvider } from "@/lib/llm/model-provider";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function stalled() {
  return { generateText: vi.fn(() => new Promise(() => {})) } as unknown as ModelProvider;
}
it("S171 each actual refinement surface terminates a stalled adapter without replacing the draft", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const provider = stalled();
  for (const surface of [
    "renewal_message",
    "maintenance_owner_notice",
    "maintenance_resident_reply",
    "workflow_reply",
  ] as const) {
    let settled = false;
    const pending = refineEmailDraft(
      {
        surface,
        purpose: "Synthetic local test",
        currentBody: "Hello Pat.",
        instruction: "Make this shorter",
        facts: [],
        protectedPhrases: ["Pat"],
      },
      { provider, model: "local-test", timeoutMs: 15 },
    );
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(16);
    expect(settled).toBe(true);
    expect(await pending).toMatchObject({
      status: "unavailable",
      reason: expect.stringMatching(/draft is unchanged/),
    });
  }
  expect(provider.generateText).toHaveBeenCalledTimes(4);
});
it("S171 linked workflow AI owns a finite wait and produces no persisted reply on timeout", async () => {
  vi.useFakeTimers();
  let settled = false;
  const provider = stalled();
  const pending = buildWorkflowAiReply({
    artifactRef: "maintenance-owner:v1.0",
    category: "general_question",
    currentText: "Hello Pat.",
    model: "local-test",
    provider,
    sources: [
      {
        ref: "fixture:1",
        label: "Synthetic source",
        text: "Pat asked about the workflow.",
        verified: true,
      },
    ],
  });
  void pending.then(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(30_001);
  expect(settled).toBe(true);
  expect(await pending).toMatchObject({
    ok: false,
    persisted: false,
    applied: false,
    proposal: "",
  });
  expect(provider.generateText).toHaveBeenCalledTimes(1);
});
it("S171 grounded answer timeout ends the original call without launching a JSON-repair retry", async () => {
  vi.useFakeTimers();
  let settled = false;
  const provider = stalled();
  const generator = new GoogleGenAiAnswerGenerator(
    { geminiAnswerModel: "local-test" } as ServerConfig,
    { provider },
  );
  const pending = generator.generateAnswer({
    ask: { question: "What is the process?", draft_enabled: false },
    grounding: { citations: [], confidence: 0, sourceIds: [], sources: [] },
    sourceState: "No Reliable Source Found",
  });
  const observed = pending.catch((error: unknown) => {
    settled = true;
    return error;
  });
  await vi.advanceTimersByTimeAsync(30_001);
  expect(settled).toBe(true);
  expect(await observed).toMatchObject({ name: "ReadDeadlineError" });
  expect(provider.generateText).toHaveBeenCalledTimes(1);
});
