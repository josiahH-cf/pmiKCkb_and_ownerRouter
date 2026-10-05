import { describe, expect, it, vi } from "vitest";
import {
  runAssistantConversation,
  conversationActorKey,
} from "@/lib/assistant/conversation";
import { projectRenewalRead } from "@/lib/operational-context/projections";
import { StoredAssistantAnswerSchema } from "@/lib/assistant-history/stored-answer";
import {
  deskRow,
  fakeOperationalContext,
  TEST_NOW,
} from "@/tests/helpers/operational-context-fake";

describe("S178 actual related identity records", () => {
  it("matches a property and retains its related historical lease with the verified source shortcut", async () => {
    const current = deskRow({ id: "7001", tenants: ["Casey Sample"] });
    const historical = deskRow({
      id: "7002",
      endDateIso: "2025-10-31",
      tenants: ["Taylor Sample"],
    });
    for (const row of [current, historical]) row.propertyNameLabel = "Acme Properties";
    current.sourceDestinations = {
      rentvine: {
        kind: "external",
        href: "https://fixture.rentvine.com/leases/7001",
        label: "Opens verified lease",
      },
    };
    const ctx = fakeOperationalContext({
      reads: {
        renewals: projectRenewalRead({
          status: "ok",
          rows: [current, historical],
          readComplete: true,
        }),
      },
    });
    const answer = await runAssistantConversation(
      { question: "Acme Properties" },
      {
        nowIso: TEST_NOW,
        actorKey: conversationActorKey(ctx.actorUid),
        context: ctx,
        interpret: null,
      },
    );
    expect(answer.groups[0].items.map((item) => item.ref.id)).toEqual(["7001", "7002"]);
    expect(answer.groups[0].items[0]).toMatchObject({
      href: expect.stringContaining("7001"),
      sourceHref: "/lease-renewal/live/desk/lease/7001/rentvine",
    });
    expect(answer.groups[0].items[1]).not.toHaveProperty("sourceHref");
    expect(StoredAssistantAnswerSchema.safeParse(answer).success).toBe(true);
  });
  it("treats a literal identity as an independent deterministic lookup even with a model available", async () => {
    const ctx = fakeOperationalContext({
      reads: {
        renewals: projectRenewalRead({
          status: "ok",
          rows: [deskRow({ id: "7001", tenants: ["Jane Doe"] })],
          readComplete: true,
        }),
      },
    });
    const interpret = vi.fn(async () => null);
    const answer = await runAssistantConversation(
      { question: "Jane Doe" },
      {
        nowIso: TEST_NOW,
        actorKey: conversationActorKey(ctx.actorUid),
        context: ctx,
        interpret,
      },
    );
    expect(answer.groups[0].items[0].ref.id).toBe("7001");
    expect(interpret).not.toHaveBeenCalled();
  });
});
