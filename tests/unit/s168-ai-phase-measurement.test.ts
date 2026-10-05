import { expect, it, vi } from "vitest";
import {
  conversationActorKey,
  runAssistantConversation,
} from "@/lib/assistant/conversation";
import {
  interpretDeterministically,
  interpretWithModel,
} from "@/lib/assistant/interpret";
import type { ModelProvider } from "@/lib/llm/model-provider";
import type { OperationalContext } from "@/lib/operational-context/types";
import {
  fakeOperationalContext,
  renewalsRead,
  TEST_NOW,
} from "@/tests/helpers/operational-context-fake";

it.each(["first_fixture", "repeat_fixture"] as const)(
  "S168 records comparable %s interpretation and complete long-portfolio source phases independently",
  async (invocation) => {
    const adapterDelayMs = invocation === "first_fixture" ? 40 : 10;
    const question = "Which leases end next month?";
    const plan = interpretDeterministically(question, null, TEST_NOW);
    let interpretationMs = 0;
    let sourceMs = 0;
    const pause = () => new Promise((resolve) => setTimeout(resolve, adapterDelayMs));
    const provider = {
      generateText: vi.fn(async () => {
        await pause();
        return { text: JSON.stringify(plan) };
      }),
    } as unknown as ModelProvider;
    const base = fakeOperationalContext({
      reads: {
        renewals: renewalsRead(
          Array.from({ length: 312 }, (_, index) => ({
            id: String(7001 + index),
            address: `Local long source fixture ${index + 1}: ${"UnbrokenFixtureAddress".repeat(20)}`,
            endDateIso: "2026-10-15",
          })),
        ),
      },
    });
    const context: OperationalContext = {
      ...base,
      read: async (source) => {
        const start = performance.now();
        await pause();
        const value = await base.read(source);
        sourceMs += performance.now() - start;
        return value;
      },
    };
    const started = performance.now();
    const answer = await runAssistantConversation(
      { question },
      {
        nowIso: TEST_NOW,
        actorKey: conversationActorKey(base.actorUid),
        context,
        interpret: async (text, previous, nowIso) => {
          const start = performance.now();
          const result = await interpretWithModel(text, previous, nowIso, {
            provider,
            model: "local-fixture",
            timeoutMs: 1000,
          });
          interpretationMs = performance.now() - start;
          return result;
        },
      },
    );
    expect(answer.interpretedBy).toBe("model");
    expect(answer.groups[0].total).toBe(312);
    expect(answer.groups[0].notes).toContain(
      "Showing the first 25 of 312. Open the full list for the rest.",
    );
    expect(answer.groups[0].link?.href).toContain("month=2026-10");
    expect(base.calls).toEqual(["renewals"]);
    expect(provider.generateText).toHaveBeenCalledTimes(1);
    console.info(
      JSON.stringify({
        event: "batch005_comparable_ai_phases",
        invocation,
        adapterDelayMs,
        interpretationMs: Math.round(interpretationMs),
        sourceMs: Math.round(sourceMs),
        totalMs: Math.round(performance.now() - started),
        rows: 312,
        modelCalls: 1,
        sourceReads: 1,
        scope:
          "native ready-process deterministic adapter fixture; separate first/repeat invocations, not machine-cold or production service latency",
      }),
    );
  },
);
