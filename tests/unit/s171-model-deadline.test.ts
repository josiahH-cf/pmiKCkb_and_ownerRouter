import { expect, it, vi } from "vitest";
import { interpretWithModel } from "@/lib/assistant/interpret";
import type { ModelProvider } from "@/lib/llm/model-provider";
it("S171 the actual interpreter owns its finite fallback when the model adapter stalls", async () => {
  vi.useFakeTimers();
  let settled = false;
  const provider = {
    generateText: vi.fn(() => new Promise(() => {})),
  } as unknown as ModelProvider;
  const pending = interpretWithModel(
    "Which leases end next month?",
    [],
    "2026-10-04T16:00:00Z",
    { provider, model: "local-test", timeoutMs: 15 },
  );
  void pending.then(() => {
    settled = true;
  });
  try {
    await vi.advanceTimersByTimeAsync(16);
    expect(settled).toBe(true);
    expect(await pending).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
