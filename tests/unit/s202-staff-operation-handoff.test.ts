import { it, expect, vi } from "vitest";
import {
  runAssistantConversation,
  conversationActorKey,
} from "@/lib/assistant/conversation";
import {
  fakeOperationalContext,
  renewalsRead,
  maintenanceRead,
} from "@/tests/helpers/operational-context-fake";
import { notAuthorizedRead } from "@/lib/operational-context/types";
async function ask(question: string, denied = false) {
  const context = fakeOperationalContext({
    reads: {
      renewals: denied
        ? notAuthorizedRead("renewals", "Current Renewal access is unavailable.")
        : renewalsRead([
            { id: "704", address: "704 Fixture Lane", endDateIso: "2026-12-31" },
            { id: "705", address: "705 Fixture Lane", endDateIso: "2026-12-31" },
          ]),
    },
  });
  const interpret = vi.fn(async () => null);
  return {
    answer: await runAssistantConversation(
      { question },
      {
        context,
        actorKey: conversationActorKey(context.actorUid),
        nowIso: context.nowIso,
        interpret,
      },
    ),
    context,
    interpret,
  };
}
it("routes an explicit owner-message request to the same actual Communications control for an existing accessible lease without an effect", async () => {
  const { answer, interpret, context } = await ask("Send an owner message for lease 704");
  expect(answer.kind).toBe("answer");
  expect(answer.execution).toBeNull();
  expect(answer.groups[0].items).toHaveLength(1);
  expect(answer.groups[0].items[0]).toMatchObject({
    ref: { source: "renewals", id: "704" },
    href: expect.stringContaining("/gmail-hub?compose=renewal_owner&lease=704"),
  });
  expect(answer.summary).toMatch(/review|Review/);
  expect(interpret).not.toHaveBeenCalled();
  expect(context.calls).toEqual(["renewals"]);
});
it("asks only for a material target instead of an irrelevant date or guessed lease", async () => {
  const { answer } = await ask("Change the working rent for a lease to $1,250");
  expect(answer.kind).toBe("clarification");
  expect(answer.clarification).toMatch(/Which lease/);
  expect(answer.clarification).not.toMatch(/month|period/);
  expect(answer.groups.flatMap((g) => g.items)).toEqual([]);
});
it("uses actual current scope and refuses fabricated targets, multiple targets and unlisted effects", async () => {
  const denied = await ask("Send an owner message for lease 704", true);
  expect(denied.answer.groups.flatMap((g) => g.items)).toEqual([]);
  expect(denied.answer.summary).toMatch(/access|read/);
  const fabricated = await ask("Change working rent for lease 999 to $1,250");
  expect(fabricated.answer.groups.flatMap((g) => g.items)).toEqual([]);
  expect(fabricated.answer.summary).toMatch(/not found|unavailable/);
  const bulk = await ask("Send owner messages for lease 704 and lease 705");
  expect(bulk.answer.kind).toBe("clarification");
  const removal = await ask("Delete the lease 704 from RentVine");
  expect(removal.answer.groups.flatMap((g) => g.items)).toEqual([]);
  expect(removal.answer.summary).toMatch(/unavailable|supported/);
});
it("keeps a policy question read-only and separate from an operation request", async () => {
  const { answer, interpret } = await ask(
    "How should we change the working rent for a lease?",
  );
  expect(interpret).toHaveBeenCalledOnce();
  expect(answer.groups.flatMap((g) => g.items).map((i) => i.href)).not.toContainEqual(
    expect.stringContaining("compose="),
  );
});
