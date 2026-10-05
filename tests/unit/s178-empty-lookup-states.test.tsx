// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TurnView, type DashboardTurn } from "@/components/ask/DashboardTurnView";
import {
  conversationActorKey,
  runAssistantConversation,
  type ConversationAnswer,
} from "@/lib/assistant/conversation";
import { EMPTY_FILTERS, type ConversationPlan } from "@/lib/assistant/conversation-plan";
import { projectRenewalRead } from "@/lib/operational-context/projections";
import type { TypedSourceRead } from "@/lib/operational-context/types";
import {
  fakeOperationalContext,
  renewalsRead,
  TEST_NOW,
  type LeaseFixture,
} from "@/tests/helpers/operational-context-fake";

// S178 (R-S178-6): a lookup that finds nothing says which of four things happened, in the answer
// and on the screen: the read was complete and nothing matches; the read was incomplete; the data
// is stale; or a lease does not name its owner or tenant, so a relationship cannot be ruled out.
// A source that could not be read is never replaced by a general answer. Names are synthetic.

afterEach(cleanup);

const NAMED: readonly LeaseFixture[] = [
  { id: "7001", tenants: ["Jane Doe"], owners: ["Olive Owner"] },
  { id: "7002", tenants: ["Sam Sample"], owners: ["Olive Owner"] },
];
const WANTED = "Zebulon Quartermain";
const REFRESH = "Use Refresh data on the Renewals desk, then ask again.";
const DESK = { label: "Open the Renewals desk", href: "/lease-renewal/live/desk?v=2" };

type Interpreter = NonNullable<
  Parameters<typeof runAssistantConversation>[1]["interpret"]
>;
const UNSUPPORTED: ConversationPlan = {
  kind: "unsupported",
  subjects: [],
  filters: EMPTY_FILTERS,
  followUp: { usePrevious: false, ordinal: null, detail: false },
  clarification: null,
  unsupportedTopic: null,
};

async function ask(
  renewals: TypedSourceRead<"renewals">,
  question = WANTED,
  interpret: Interpreter | null = null,
) {
  const context = fakeOperationalContext({ reads: { renewals } });
  return runAssistantConversation(
    { question },
    {
      nowIso: TEST_NOW,
      actorKey: conversationActorKey(context.actorUid),
      context,
      interpret,
    },
  );
}

function show(assistant: ConversationAnswer) {
  const turn: DashboardTurn = {
    id: "fixture-turn",
    question: WANTED,
    contextBefore: null,
    state: "answered",
    assistant,
    assistantUnavailable: false,
    knowledge: null,
    knowledgeError: null,
    error: null,
    answeredAtIso: TEST_NOW,
    restored: false,
    accessChanged: false,
    saveState: "none",
    rerunOf: null,
    askedAgain: false,
    questionSave: "none",
  };
  render(
    <TurnView
      turn={turn}
      index={0}
      onRetry={() => {}}
      onRetrySave={() => {}}
      registerRef={() => {}}
    />,
  );
  return document.querySelector("[data-read-state]");
}

describe("S178 a lookup that finds nothing says which state it is in", () => {
  it("complete read, nothing matches: a plain no-match that says how to look again", async () => {
    const answer = await ask(renewalsRead(NAMED));
    const [group] = answer.groups;
    expect(answer.kind).toBe("answer");
    expect(group.status).toBe("ok");
    expect(group.total).toBe(0);
    expect(group.summary).toBe(`No leases are related to “${WANTED}”.`);
    expect(group.notes).toContain(
      "Try another spelling, or a shorter part of the name or address.",
    );
    expect(group.notes).not.toContain(REFRESH);
    expect(show(answer)).toBeNull();
    expect(screen.getByText(group.summary)).toBeInTheDocument();
  });

  it("missing pages: never a definite zero, and the recovery is a refresh", async () => {
    const answer = await ask(renewalsRead(NAMED, { readComplete: false }));
    const [group] = answer.groups;
    expect(group.status).toBe("partial");
    expect(group.summary).toBe(
      `No match for “${WANTED}” in the renewal records that were read. The read was incomplete, so a match cannot be ruled out.`,
    );
    expect(group.summary).not.toMatch(/^No leases\b/);
    expect(group.notes).toContain(
      "The RentVine portfolio read did not return every lease.",
    );
    expect(group.notes).toContain(REFRESH);
    expect(group.link).toEqual(DESK);

    const state = show(answer);
    expect(state).toHaveAttribute("data-read-state", "partial");
    expect(state).toHaveTextContent("Incomplete read");
    expect(screen.getByRole("link", { name: DESK.label })).toHaveAttribute(
      "href",
      DESK.href,
    );
  });

  it("a supporting record that did not answer is an incomplete read too", async () => {
    const answer = await ask(renewalsRead(NAMED, { degraded: ["work_status"] }));
    expect(answer.groups[0].status).toBe("partial");
    expect(answer.groups[0].summary).toMatch(/The read was incomplete/);
    expect(answer.groups[0].notes).toContain(REFRESH);
  });

  it("stale or expired data: says so, and never a definite zero", async () => {
    for (const [state, words, label] of [
      ["stale", "stale", "Stale data"],
      ["expired", "too old to act on", "Data too old to act on"],
    ] as const) {
      const answer = await ask(
        renewalsRead(NAMED, {
          currency: { state, readAtIso: "2026-09-29T17:00:00.000Z" },
        }),
      );
      const [group] = answer.groups;
      expect(group.summary, state).toBe(
        `No match for “${WANTED}” in renewal data that is ${words}. A matching lease may have changed since it was read.`,
      );
      expect(group.notes, state).toContain(REFRESH);
      expect(group.link, state).toEqual(DESK);
      const shown = show(answer);
      expect(shown, state).toHaveAttribute("data-read-state", state);
      expect(shown, state).toHaveTextContent(label);
      cleanup();
    }
  });

  it("a lease with no owner or tenant on record: the relationship is unresolved, with its own recovery", async () => {
    const answer = await ask(
      renewalsRead([
        { id: "7001", tenants: ["Jane Doe"], owners: [] },
        { id: "7002", tenants: [], owners: ["Olive Owner"] },
        { id: "7003", tenants: ["Sam Sample"], owners: ["Olive Owner"] },
      ]),
    );
    const [group] = answer.groups;
    expect(group.status).toBe("ok");
    expect(group.total).toBe(0);
    expect(group.summary).toBe(
      `No lease names “${WANTED}”. 2 leases have no owner or tenant name on record, so a relationship there cannot be ruled out.`,
    );
    expect(group.notes).toContain(
      "A person the records do not name cannot be matched. Look up the property or address instead, or check those leases on the Renewals desk.",
    );
    expect(group.notes).not.toContain(REFRESH);
    expect(group.link).toEqual(DESK);
    expect(show(answer)).toBeNull();

    const one = await ask(
      renewalsRead([{ id: "7001", tenants: ["Jane Doe"], owners: [] }]),
    );
    expect(one.groups[0].summary).toContain(
      "1 lease has no owner or tenant name on record",
    );
  });

  it("an address lookup is not a relationship: unnamed parties do not change its no-match", async () => {
    const rows: LeaseFixture[] = [{ id: "7001", tenants: ["Jane Doe"], owners: [] }];
    const complete = await ask(renewalsRead(rows), "9999 Oak St");
    expect(complete.groups[0].summary).toBe("No leases match “9999 Oak St”.");
    expect(complete.groups[0].notes).toContain(
      "Try another spelling, or a shorter part of the name or address.",
    );
    const partial = await ask(renewalsRead(rows, { readComplete: false }), "9999 Oak St");
    expect(partial.groups[0].summary).toBe(
      "No match for “9999 Oak St” in the renewal records that were read. The read was incomplete, so a match cannot be ruled out.",
    );
  });

  it("the four states never share their wording", async () => {
    const summaries = await Promise.all([
      ask(renewalsRead(NAMED)),
      ask(renewalsRead(NAMED, { readComplete: false })),
      ask(
        renewalsRead(NAMED, {
          currency: { state: "stale", readAtIso: "2026-09-29T17:00:00.000Z" },
        }),
      ),
      ask(renewalsRead([{ id: "7001", tenants: ["Jane Doe"], owners: [] }])),
      ask(projectRenewalRead({ status: "read_error", rows: [] })),
    ]);
    const said = summaries.map((answer) => answer.groups[0].summary);
    expect(new Set(said).size).toBe(5);
  });

  it("a match on an incomplete read is still listed, and the read is still named incomplete", async () => {
    const answer = await ask(renewalsRead(NAMED, { readComplete: false }), "Jane Doe");
    expect(answer.groups[0].items.map((item) => item.ref.id)).toEqual(["7001"]);
    expect(answer.groups[0].summary).toMatch(/^1 lease /);
    expect(show(answer)).toHaveTextContent("Incomplete read");
  });

  it("a source that could not be read stays said when the interpreter cannot place the words", async () => {
    const failed = projectRenewalRead({ status: "read_error", rows: [] });
    const interpret = vi.fn<Interpreter>(async () => UNSUPPORTED);
    const answer = await ask(failed, WANTED, interpret);
    expect(interpret).toHaveBeenCalledTimes(1);
    expect(answer.kind).toBe("answer");
    expect(answer.groups).toHaveLength(1);
    expect(answer.groups[0].status).toBe("unavailable");
    expect(answer.groups[0].summary).toBe(
      "The renewal source could not be read just now.",
    );
    expect(answer.groups[0].total).toBe(0);
    const state = show(answer);
    expect(state).toHaveAttribute("data-read-state", "unavailable");
    expect(state).toHaveTextContent("Source unavailable");
    cleanup();

    // An incomplete read keeps its own state the same way.
    const partial = await ask(
      renewalsRead(NAMED, { readComplete: false }),
      WANTED,
      async () => UNSUPPORTED,
    );
    expect(partial.kind).toBe("answer");
    expect(partial.groups[0].summary).toMatch(/The read was incomplete/);
  });

  it("an ordinary question keeps its own answer, and a complete no-match still follows the interpreter", async () => {
    const failed = projectRenewalRead({ status: "read_error", rows: [] });
    const knowledge = await ask(failed, "Security deposit", async () => ({
      ...UNSUPPORTED,
      kind: "knowledge",
    }));
    expect(knowledge.kind).toBe("knowledge");

    const complete = await ask(renewalsRead(NAMED), WANTED, async () => UNSUPPORTED);
    expect(complete.kind).toBe("unsupported");
  });
});
