import { describe, expect, it, vi } from "vitest";
import {
  runAssistantConversation,
  conversationActorKey,
} from "@/lib/assistant/conversation";
import { interpretDeterministically } from "@/lib/assistant/interpret";
import { projectRenewalRead } from "@/lib/operational-context/projections";
import {
  deskRow,
  fakeOperationalContext,
  TEST_NOW,
} from "@/tests/helpers/operational-context-fake";

function context() {
  return fakeOperationalContext({
    reads: {
      renewals: projectRenewalRead({
        status: "ok",
        rows: [deskRow({ id: "7001", tenants: ["Jane Doe"] })],
        readComplete: true,
      }),
    },
  });
}
type Interpreter = NonNullable<
  Parameters<typeof runAssistantConversation>[1]["interpret"]
>;
async function ask(question: string, interpret: Interpreter) {
  const ctx = context();
  const spy = vi.fn<Interpreter>(interpret);
  const answer = await runAssistantConversation(
    { question },
    {
      nowIso: TEST_NOW,
      actorKey: conversationActorKey(ctx.actorUid),
      context: ctx,
      interpret: spy,
    },
  );
  return { answer, spy };
}

describe("S178 literal lookup leaves ordinary questions to their own answer", () => {
  it("keeps a day-count window a date constraint, never a street address", async () => {
    for (const question of [
      "What leases end in the next 60 days?",
      "Which leases are ending within 90 days",
      "Leases ending in 3 months",
    ]) {
      const plan = interpretDeterministically(question, null, TEST_NOW);
      expect(plan.filters.text, question).toBeNull();
      const { spy } = await ask(question, async () => null);
      expect(spy, question).toHaveBeenCalledTimes(1);
    }
    expect(interpretDeterministically("1234 Oak St", null, TEST_NOW).filters.text).toBe(
      "1234 Oak St",
    );
  });

  it("asks the interpreter once when a bare phrase matches no record, and follows its plan", async () => {
    const knowledge = interpretDeterministically(
      "Why is this policy written this way today",
      null,
      TEST_NOW,
    );
    expect(["knowledge", "unsupported"]).toContain(knowledge.kind);
    const { answer, spy } = await ask("Security deposit", async () => knowledge);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(["knowledge", "unsupported"]).toContain(answer.kind);
    expect(answer.groups.flatMap((group) => group.items)).toEqual([]);
    expect(answer.summary).not.toMatch(/No leases are related/);
  });

  it("keeps the honest no-match answer when the interpreter has nothing better", async () => {
    const { answer, spy } = await ask("Zebulon Quartermain", async () => null);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(answer.kind).toBe("answer");
    expect(answer.groups.flatMap((group) => group.items)).toEqual([]);
    expect(answer.interpretedBy).toBe("deterministic");
  });

  it("still answers a matching name from the records without a model call", async () => {
    const { answer, spy } = await ask("Jane Doe", async () => null);
    expect(spy).not.toHaveBeenCalled();
    expect(answer.groups[0].items.map((item) => item.ref.id)).toEqual(["7001"]);
  });
});
