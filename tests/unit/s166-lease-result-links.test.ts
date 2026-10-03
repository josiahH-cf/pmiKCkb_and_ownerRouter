import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveAskAction, RENEWAL_DRAFT_ACTION_KEY } from "@/lib/ask/action-intent";
import {
  conversationActorKey,
  runAssistantConversation,
  type ConversationAnswer,
} from "@/lib/assistant/conversation";
import type { ConversationContext } from "@/lib/assistant/conversation-plan";
import { projectRenewalItems } from "@/lib/assistant/renewal-adapter";
import { StoredAssistantAnswerSchema } from "@/lib/assistant-history/stored-answer";
import { workflowEntityHref } from "@/lib/gmail-hub/workflow-context";
import {
  buildWorkspaceHref,
  leaseWorkspaceHrefOrNull,
} from "@/lib/lease-renewal/desk-view-continuation";
import {
  deskRow,
  fakeOperationalContext,
  renewalsRead,
  type FakeContextInput,
} from "@/tests/helpers/operational-context-fake";

// S166 (F15): a lease result is a real link to that lease's own workspace, carries enough identity
// to act on, and several matching leases come back as a list to open rather than only a question.
// Every value here is synthetic.

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function ask(
  question: string,
  input: FakeContextInput,
  conversation: ConversationContext | null = null,
): Promise<ConversationAnswer> {
  const ctx = fakeOperationalContext(input);
  return runAssistantConversation(
    { question, conversation },
    {
      nowIso: ctx.nowIso,
      actorKey: conversationActorKey(ctx.actorUid),
      context: ctx,
      interpret: null,
    },
  );
}

describe("S166 lease results link the real lease (ARCH-S166-1)", () => {
  it("BEH-S166-1 / BEH-S166-2: a tenant question returns the matching lease as a link to its own workspace, with the address and tenant", async () => {
    const answer = await ask("Which leases are related to Robin Vale?", {
      reads: {
        renewals: renewalsRead([
          { id: "4101", address: "12 Sample Ct", tenants: ["Robin Vale"] },
          { id: "4102", address: "14 Sample Ct", tenants: ["Sam Other"] },
        ]),
      },
    });
    expect(answer.kind).toBe("answer");
    expect(answer.groups[0].items).toHaveLength(1);
    const item = answer.groups[0].items[0];
    // The destination is the owning record's own id through the one workspace link builder.
    expect(item.ref).toEqual({ source: "renewals", id: "4101" });
    expect(item.href).toBe(buildWorkspaceHref({ leaseId: "4101", deskView: null }));
    expect(item.title).toBe("12 Sample Ct");
    expect(item.detail).toContain("Tenant: Robin Vale");
  });

  it("BEH-S166-2: the projection names every tenant it already carries and never derives a link from a name", () => {
    const [one, two, none] = projectRenewalItems([
      deskRow({ id: "5001", address: "1 Fixture Way", tenants: ["Ada Test"] }),
      deskRow({
        id: "5002",
        address: "2 Fixture Way",
        tenants: ["Ada Test", "Ben Test", "Cy Test", "Di Test"],
      }),
      deskRow({ id: "5003", address: "3 Fixture Way", tenants: [] }),
    ]);
    expect(one.href).toBe("/lease-renewal/live/desk/lease/5001");
    expect(one.detail.startsWith("Tenant: Ada Test · ")).toBe(true);
    expect(two.href).toBe("/lease-renewal/live/desk/lease/5002");
    expect(
      two.detail.startsWith("Tenants: Ada Test, Ben Test, Cy Test and 1 more · "),
    ).toBe(true);
    // No tenant on the projection: nothing is invented.
    expect(none.detail).not.toMatch(/Tenant/);
    for (const item of [one, two, none])
      expect(item.href).not.toMatch(/Ada|Test|Fixture/);
  });

  it("BEH-S166-2 / AC-S166-1: a row without a resolved lease id is never given a lease link", () => {
    const [item] = projectRenewalItems([
      deskRow({ id: "", address: "9 Unresolved Rd", tenants: ["Pat Unknown"] }),
    ]);
    expect(item.href).toBe("/lease-renewal/live/desk?v=2");
    expect(item.href).not.toContain("/desk/lease/");
    expect(item.detail).toContain("Lease record not resolved");
    expect(leaseWorkspaceHrefOrNull("")).toBeNull();
    expect(leaseWorkspaceHrefOrNull("../etc")).toBeNull();
    expect(leaseWorkspaceHrefOrNull(null)).toBeNull();
    expect(leaseWorkspaceHrefOrNull("7001")).toBe("/lease-renewal/live/desk/lease/7001");
  });

  it("BEH-S166-3 / AC-S166-1: several matching people return every matching lease as its own link, with no silent pick", async () => {
    const input: FakeContextInput = {
      reads: {
        renewals: renewalsRead([
          { id: "6101", address: "21 Sample Ave", tenants: ["Jordan Smith"] },
          { id: "6102", address: "23 Sample Ave", tenants: ["Jamie Smith"] },
          { id: "6103", address: "25 Sample Ave", tenants: ["Lee Park"] },
        ]),
      },
    };
    const first = await ask("Which leases are related to Smith?", input);
    // Still asks which person is meant: nothing is chosen on the user's behalf.
    expect(first.kind).toBe("clarification");
    expect(first.clarification).toBe(
      "More than one person matches “Smith”: Jordan Smith (tenant), Jamie Smith (tenant). Which one do you mean?",
    );
    // And the actual matches are already there to open.
    expect(first.groups).toHaveLength(1);
    const items = first.groups[0].items;
    expect(items.map((item) => item.ref.id)).toEqual(["6101", "6102"]);
    expect(items.map((item) => item.href)).toEqual([
      "/lease-renewal/live/desk/lease/6101",
      "/lease-renewal/live/desk/lease/6102",
    ]);
    expect(new Set(items.map((item) => item.href)).size).toBe(2);
    expect(items[0].title).toBe("21 Sample Ave");
    expect(items[0].detail).toContain("Tenant: Jordan Smith");
    expect(items[1].title).toBe("23 Sample Ave");
    expect(items[1].detail).toContain("Tenant: Jamie Smith");
    expect(first.groups[0].total).toBe(2);
    // The stored-answer contract (S148 history) accepts the listed clarification unchanged.
    expect(StoredAssistantAnswerSchema.safeParse(first).success).toBe(true);

    // Naming the person afterwards still narrows to that one lease.
    const second = await ask("Jamie Smith", input, first.conversation);
    expect(second.kind).toBe("answer");
    expect(second.groups[0].items.map((item) => item.ref.id)).toEqual(["6102"]);
    // So does pointing at the list.
    const pointed = await ask("Tell me about the first one", input, first.conversation);
    expect(pointed.groups[0].items[0].ref.id).toBe("6101");
  });

  it("BEH-S166-3: one person on several leases lists each lease separately", async () => {
    const answer = await ask("Which leases are related to Robin Vale?", {
      reads: {
        renewals: renewalsRead([
          { id: "4201", address: "30 Sample Ct", tenants: ["Robin Vale"] },
          { id: "4202", address: "32 Sample Ct", tenants: ["Robin Vale"] },
        ]),
      },
    });
    expect(answer.kind).toBe("answer");
    expect(answer.groups[0].items.map((item) => item.href)).toEqual([
      "/lease-renewal/live/desk/lease/4201",
      "/lease-renewal/live/desk/lease/4202",
    ]);
  });

  it("BEH-S166-2: an unknown person stays unmatched and produces no link", async () => {
    const answer = await ask("Which leases are related to Quinn Nobody?", {
      reads: {
        renewals: renewalsRead([{ id: "4301", tenants: ["Robin Vale"] }]),
      },
    });
    expect(answer.groups[0].items).toEqual([]);
    expect(answer.groups[0].notes.join(" ")).toContain("nothing was guessed");
  });

  it("BEH-S166-1: the default-worklist answer opens the same explicit view it described", async () => {
    const answer = await ask("Which leases are in the renewal worklist?", {
      reads: { renewals: renewalsRead([{ id: "4401" }]) },
    });
    expect(answer.groups[0].link?.href).toBe("/lease-renewal/live/desk?v=2");
  });
});

describe("S166 other lease destinations use the same real-id link (ARCH-S166-1)", () => {
  it("BEH-S166-2: a workflow-linked email and its notification open the lease by its recorded id", () => {
    expect(workflowEntityHref({ entity_type: "renewal_lease", entity_id: "8101" })).toBe(
      buildWorkspaceHref({ leaseId: "8101", deskView: null }),
    );
    // A record whose id is not a lease id is never turned into a lease path.
    const unresolved = workflowEntityHref({
      entity_type: "renewal_lease",
      entity_id: "not a lease/../x",
    });
    expect(unresolved).toBe("/lease-renewal/live/desk?v=2");
  });

  it("BEH-S166-2: the Ask action route links the resolved target only", () => {
    const open = () => true;
    expect(
      resolveAskAction({
        detected: { processId: "lease-renewal" },
        target: { leaseId: "8201", addressLabel: "40 Sample Ct" },
        isExecutable: open,
      }),
    ).toMatchObject({
      actionKey: RENEWAL_DRAFT_ACTION_KEY,
      href: "/lease-renewal/live/desk/lease/8201",
    });
    expect(
      resolveAskAction({
        detected: { processId: "lease-renewal" },
        target: { leaseId: "bad id", addressLabel: "40 Sample Ct" },
        isExecutable: open,
      }),
    ).toBeNull();
    expect(
      resolveAskAction({
        detected: { processId: "lease-renewal" },
        target: null,
        isExecutable: open,
      }),
    ).toBeNull();
  });
});
