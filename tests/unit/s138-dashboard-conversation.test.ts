import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  conversationActorKey,
  runAssistantConversation,
  type ConversationAnswer,
  type ModelInterpreter,
} from "@/lib/assistant/conversation";
import {
  ConversationContextSchema,
  ConversationPlanSchema,
  EMPTY_FILTERS,
  type ConversationContext,
  type ConversationPlan,
} from "@/lib/assistant/conversation-plan";
import { interpretWithModel } from "@/lib/assistant/interpret";
import type { ModelProvider, ModelTextRequest } from "@/lib/llm/model-provider";
import { notAuthorizedRead, unavailableRead } from "@/lib/operational-context/types";
import {
  TEST_NOW,
  approvalsRead,
  communicationsRead,
  connectionsRead,
  fakeOperationalContext,
  maintenanceRead,
  processesRead,
  renewalsRead,
  task,
  workRead,
  type FakeContextInput,
  type LeaseFixture,
} from "@/tests/helpers/operational-context-fake";

// S138: ordinary-language Dashboard questions answered from the shared S137 context. Every
// expectation below is checked against the fixture records, not against how the answer sounds.

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function ask(
  question: string,
  input: FakeContextInput = {},
  conversation: ConversationContext | null = null,
  interpret: ModelInterpreter | null = null,
): Promise<{ answer: ConversationAnswer; calls: string[] }> {
  const ctx = fakeOperationalContext(input);
  const answer = await runAssistantConversation(
    { question, conversation },
    {
      nowIso: ctx.nowIso,
      actorKey: conversationActorKey(ctx.actorUid),
      context: ctx,
      interpret,
    },
  );
  // The context the client sends back must always re-validate against the request schema.
  expect(ConversationContextSchema.safeParse(answer.conversation).success).toBe(true);
  return { answer, calls: ctx.calls };
}

function ids(answer: ConversationAnswer, group = 0): string[] {
  return answer.groups[group].items.map((item) => item.ref.id);
}

const WEEK_LEASES: LeaseFixture[] = [
  { id: "L-mon", endDateIso: "2026-09-28" },
  { id: "L-sun", endDateIso: "2026-10-04" },
  { id: "L-next-mon", endDateIso: "2026-10-05" },
  { id: "L-prev-sun", endDateIso: "2026-09-27" },
  { id: "L-outside", endDateIso: "2026-10-01", retention: "outside" },
];

describe("S138 question families answer from the owning records", () => {
  it("lists leases ending this week, Monday through Sunday, with the exact dates and desk link", async () => {
    const { answer } = await ask("What leases are due this week?", {
      reads: { renewals: renewalsRead(WEEK_LEASES) },
    });
    expect(answer.kind).toBe("answer");
    expect(ids(answer)).toEqual(["L-mon", "L-sun"]);
    expect(answer.summary).toBe(
      "2 leases end this week, 09/28/2026 through 10/04/2026 (Monday through Sunday).",
    );
    expect(answer.interpretation).toContain(
      "Dates: this week, 09/28/2026 through 10/04/2026 (Monday through Sunday), on the America/Chicago business calendar.",
    );
    expect(answer.interpretation.join(" ")).toMatch(/lease end date/);
    expect(answer.groups[0].link?.href).toBe(
      "/lease-renewal/live/desk?v=2&from=2026-09-28&through=2026-10-04",
    );
  });

  it("lists leases ending next month with the desk's Renewal-month filter", async () => {
    const { answer } = await ask("Which leases are coming up next month?", {
      reads: {
        renewals: renewalsRead([
          { id: "L-oct-1", endDateIso: "2026-10-01" },
          { id: "L-oct-31", endDateIso: "2026-10-31" },
          { id: "L-nov", endDateIso: "2026-11-01" },
        ]),
      },
    });
    expect(ids(answer)).toEqual(["L-oct-1", "L-oct-31"]);
    expect(answer.summary).toContain(
      "next month, October 2026 (10/01/2026 through 10/31/2026)",
    );
    expect(answer.groups[0].link?.href).toBe(
      "/lease-renewal/live/desk?v=2&month=2026-10",
    );
  });

  it("answers leases and work assigned to me from open My Work tasks", async () => {
    const tasks = [
      task({ id: "t1", source: { type: "renewal_lease", id: "L1", status: "verified" } }),
      task({
        id: "t2",
        assignee_uid: "uid-other",
        source: { type: "renewal_lease", id: "L2", status: "verified" },
      }),
      task({ id: "t3" }),
      task({
        id: "t4",
        state: "Completed",
        source: { type: "renewal_lease", id: "L3", status: "verified" },
      }),
    ];
    const { answer } = await ask("Which leases or work items are assigned to me?", {
      reads: {
        renewals: renewalsRead([{ id: "L1" }, { id: "L2" }, { id: "L3" }]),
        work: workRead(tasks),
      },
    });
    expect(answer.groups.map((group) => group.source)).toEqual(["renewals", "work"]);
    expect(ids(answer, 0)).toEqual(["L1"]);
    expect(ids(answer, 1)).toEqual(["t1", "t3"]);
    expect(answer.groups[1].summary).toBe("2 tasks are open and assigned to you.");
  });

  it("resolves named owners, tenants and staff from accessible records, never by guessing", async () => {
    const { answer } = await ask(
      "Which leases are assigned or related to Pat Jones, Lee Park, or Casey Doe?",
      {
        reads: {
          renewals: renewalsRead([
            { id: "L4", owners: ["Pat Jones"] },
            { id: "L5" },
            { id: "L6", tenants: ["Lee Park"] },
            { id: "L7", owners: ["Pat Jonas"] },
          ]),
        },
        people: [
          {
            uid: "uid-casey",
            label: "casey.doe@pmikcmetro.com",
            email: "casey.doe@pmikcmetro.com",
          },
        ],
        teamWork: workRead([
          task({
            id: "t9",
            assignee_uid: "uid-casey",
            source: { type: "renewal_lease", id: "L5", status: "verified" },
          }),
        ]),
      },
    );
    expect(ids(answer)).toEqual(["L4", "L5", "L6"]);
    const details = answer.groups[0].items.map((item) => item.detail).join(" | ");
    expect(details).toContain("owner Pat Jones");
    expect(details).toContain("tenant Lee Park");
    expect(details).toContain("assigned to casey.doe@pmikcmetro.com");
  });

  it("asks once when a name matches different people, then answers the chosen one", async () => {
    const input: FakeContextInput = {
      reads: {
        renewals: renewalsRead([
          { id: "L8", owners: ["John Smith"] },
          { id: "L9", owners: ["Jane Smith"] },
        ]),
      },
    };
    const first = await ask("Which leases are related to Smith?", input);
    expect(first.answer.kind).toBe("clarification");
    expect(first.answer.clarification).toBe(
      "More than one person matches “Smith”: John Smith (owner), Jane Smith (owner). Which one do you mean?",
    );
    const second = await ask("John Smith", input, first.answer.conversation);
    expect(second.answer.kind).toBe("answer");
    expect(ids(second.answer)).toEqual(["L8"]);
  });

  it("never conflates similar names", async () => {
    const { answer } = await ask("Which leases are related to Jon Smith?", {
      reads: { renewals: renewalsRead([{ id: "L8", owners: ["John Smith"] }]) },
    });
    expect(answer.groups[0].total).toBe(0);
    expect(answer.groups[0].notes.join(" ")).toContain(
      "No accessible person, property or unit matches",
    );
  });

  it("lists blocked leases with what is holding them up", async () => {
    const { answer } = await ask(
      "Which leases are blocked, and what is holding them up?",
      {
        reads: {
          renewals: renewalsRead([
            { id: "L10", blockers: ["Owner has not responded"] },
            { id: "L12" },
          ]),
        },
      },
    );
    expect(ids(answer)).toEqual(["L10"]);
    expect(answer.groups[0].items[0].blockers).toEqual(["Owner has not responded"]);
    expect(answer.summary).toBe("1 lease is blocked.");
  });

  it("describes the approval queue from the queue's own eligibility rule, then narrows a follow-up", async () => {
    const input: FakeContextInput = {
      reads: {
        approvals: approvalsRead([
          { key: "a1", canApproveNow: true },
          {
            key: "a2",
            canApproveNow: false,
            waitingReason: "The second approver must decide first.",
          },
          { key: "a3", kind: "renewal_flag", canApproveNow: null, queueItemId: null },
        ]),
      },
    };
    const first = await ask("What does my approval queue look like?", input);
    expect(first.answer.summary).toBe(
      "Your approval queue has 3 items: 1 you can approve now, 1 waiting on someone else, and 1 with no approval rule recorded here.",
    );
    const second = await ask(
      "Which of these are waiting on someone else?",
      input,
      first.answer.conversation,
    );
    expect(ids(second.answer)).toEqual(["a2"]);
    expect(second.answer.groups[0].items[0].detail).toContain(
      "The second approver must decide first.",
    );
  });

  it("distinguishes a configured connection from one that passed a live check", async () => {
    const { answer } = await ask("What applications are connected?", {
      reads: {
        connections: connectionsRead([
          { id: "none-app", state: "none" },
          { id: "verified-app", state: "connected", verifiedByLiveCheck: true },
          { id: "setup-app", state: "connected", verifiedByLiveCheck: false },
          { id: "attention-app", state: "action" },
        ]),
      },
    });
    expect(answer.summary).toBe(
      "2 of 4 applications are connected; 1 of those passed a live read-only check in the last ten minutes, and 1 needs attention.",
    );
    expect(ids(answer).slice(0, 2)).toEqual(["verified-app", "setup-app"]);
    expect(answer.groups[0].items[1].detail).toContain(
      "set up, with no live check in the last ten minutes",
    );
  });

  it("names what is stale and when it was last read, without refreshing anything", async () => {
    const { answer, calls } = await ask("What information is stale and needs updating?", {
      reads: {
        connections: connectionsRead([
          { id: "verified-app", state: "connected", verifiedByLiveCheck: true },
          { id: "setup-app", state: "connected", verifiedByLiveCheck: false },
          { id: "none-app", state: "none" },
        ]),
        renewals: renewalsRead([], {
          currency: { state: "stale", readAtIso: "2026-09-30T13:00:00.000Z" },
        }),
      },
    });
    expect(ids(answer, 0)).toEqual(["setup-app", "none-app"]);
    expect(answer.groups[1].summary).toBe(
      "Renewal desk data was last read 09/30/2026, 8:00 AM CDT and is stale.",
    );
    expect(answer.interpretation).toContain(
      "Nothing was refreshed; these are the last recorded reads.",
    );
    expect(calls).toEqual(["connections", "renewals"]);
  });

  it("answers the recorded communication and status for this lease from the previous answer", async () => {
    const input: FakeContextInput = {
      reads: {
        renewals: renewalsRead([
          {
            id: "L10",
            blockers: ["Owner has not responded"],
            nextAction: "Call the owner",
          },
          { id: "L12" },
        ]),
        communications: communicationsRead([
          { id: "m1", entityId: "L10", status: "sent", waitingOn: "owner" },
          { id: "m2", entityId: "L12" },
        ]),
      },
    };
    const first = await ask("Which leases are blocked?", input);
    const second = await ask(
      "What is the recorded communication or current status for this lease?",
      input,
      first.answer.conversation,
    );
    expect(second.answer.groups[0].items[0].ref.id).toBe("L10");
    expect(second.answer.groups[0].items[0].facts).toContain(
      "Next action: Call the owner",
    );
    expect(second.answer.groups[1].source).toBe("communications");
    expect(ids(second.answer, 1)).toEqual(["m1"]);
  });

  it("answers process runs and maintenance tickets from their owning records", async () => {
    const processes = await ask("Which process runs are blocked?", {
      reads: {
        processes: processesRead([
          { id: "r1", title: "Move-in", blockers: ["Waiting on keys"] },
          { id: "r2", title: "Move-out" },
          { id: "r3", title: "Old", status: "Completed", blockers: ["done"] },
        ]),
      },
    });
    expect(ids(processes.answer)).toEqual(["run:r1"]);
    const tickets = await ask("Which maintenance tickets are waiting on someone?", {
      reads: {
        maintenance: maintenanceRead([
          { id: "k1", waitingOn: "Waiting on: Vendor" },
          { id: "k2" },
          { id: "k3", status: "Closed", waitingOn: "Waiting on: Vendor" },
        ]),
      },
    });
    expect(ids(tickets.answer)).toEqual(["k1"]);
  });
});

describe("S138 follow-ups carry context and re-read current state", () => {
  it("changes only the period for 'Now next month' and reads fresh records", async () => {
    const first = await ask("What leases are due this week?", {
      reads: { renewals: renewalsRead(WEEK_LEASES) },
    });
    const second = await ask(
      "Now next month",
      {
        reads: {
          renewals: renewalsRead([
            ...WEEK_LEASES,
            { id: "L-new-oct", endDateIso: "2026-10-20" },
          ]),
        },
      },
      first.answer.conversation,
    );
    expect(ids(second.answer)).toEqual(["L-sun", "L-next-mon", "L-new-oct"]);
    expect(second.answer.interpretation).toContain(
      "Continuing from your last question with fresh records.",
    );
  });

  it("narrows to my assignments for 'Only mine' and keeps the month", async () => {
    const input: FakeContextInput = {
      reads: {
        renewals: renewalsRead([
          { id: "L1", endDateIso: "2026-10-10" },
          { id: "L2", endDateIso: "2026-10-12" },
          { id: "L3", endDateIso: "2026-11-02" },
        ]),
        work: workRead([
          task({
            id: "t1",
            source: { type: "renewal_lease", id: "L2", status: "verified" },
          }),
          task({
            id: "t2",
            source: { type: "renewal_lease", id: "L3", status: "verified" },
          }),
        ]),
      },
    };
    const first = await ask("Which leases are coming up next month?", input);
    const second = await ask("Only mine", input, first.answer.conversation);
    expect(ids(second.answer)).toEqual(["L2"]);
  });

  it("explains why the second listed record is blocked", async () => {
    const input: FakeContextInput = {
      reads: {
        renewals: renewalsRead([
          { id: "L10", blockers: ["Owner has not responded"] },
          { id: "L11", blockers: ["Rent is not verified", "Packet missing"] },
        ]),
      },
    };
    const first = await ask("Which leases are blocked?", input);
    const second = await ask(
      "Why is the second one blocked?",
      input,
      first.answer.conversation,
    );
    expect(second.answer.groups[0].items[0].ref.id).toBe("L11");
    expect(second.answer.summary).toContain(
      "Blockers: Rent is not verified; Packet missing.",
    );
  });

  it("limits 'which of those need approval?' to the previous records", async () => {
    const input: FakeContextInput = {
      reads: {
        renewals: renewalsRead([
          { id: "L1", endDateIso: "2026-10-10" },
          { id: "L2", endDateIso: "2026-10-12" },
          { id: "L9", endDateIso: "2026-12-01" },
        ]),
        approvals: approvalsRead([
          { key: "a5", leaseId: "L1", canApproveNow: true },
          { key: "a6", leaseId: "L9", canApproveNow: true },
        ]),
      },
    };
    const first = await ask("Which leases are coming up next month?", input);
    const second = await ask(
      "Which of those need approval?",
      input,
      first.answer.conversation,
    );
    expect(ids(second.answer)).toEqual(["a5"]);
    expect(second.answer.summary).toContain("1 approval item is linked to those records");
  });

  it("asks for a missing period once and completes the question from the reply", async () => {
    const input: FakeContextInput = {
      reads: { renewals: renewalsRead([{ id: "L1", endDateIso: "2026-10-10" }]) },
    };
    const first = await ask("Which leases are coming up?", input);
    expect(first.answer.kind).toBe("clarification");
    const second = await ask("next month", input, first.answer.conversation);
    expect(second.answer.kind).toBe("answer");
    expect(ids(second.answer)).toEqual(["L1"]);
  });

  it("asks which date to use for a notice deadline the app does not record", async () => {
    const input: FakeContextInput = {
      reads: { renewals: renewalsRead(WEEK_LEASES) },
    };
    const first = await ask("Which leases have a notice deadline this week?", input);
    expect(first.answer.kind).toBe("clarification");
    expect(first.answer.clarification).toContain("does not record a notice deadline");
    const second = await ask("the lease end date", input, first.answer.conversation);
    expect(ids(second.answer)).toEqual(["L-mon", "L-sun"]);
  });

  it("discards a context that belongs to another sign-in", async () => {
    const input: FakeContextInput = { reads: { renewals: renewalsRead(WEEK_LEASES) } };
    const first = await ask("What leases are due this week?", input);
    const foreign: ConversationContext = {
      ...first.answer.conversation,
      actorKey: "f".repeat(32),
    };
    const { answer } = await ask("Only mine", input, foreign);
    expect(answer.contextReset).toBe(true);
    expect(answer.conversation.turns).toHaveLength(1);
    expect(answer.kind).not.toBe("answer");
  });
});

describe("S138 dates use the America/Chicago business calendar", () => {
  it("reads 'this month' at 10:30 PM on September 30 as September, not October", async () => {
    const { answer } = await ask("What leases are due this month?", {
      nowIso: "2026-10-01T03:30:00.000Z",
      reads: {
        renewals: renewalsRead([
          { id: "L-sep-30", endDateIso: "2026-09-30" },
          { id: "L-oct-1", endDateIso: "2026-10-01" },
        ]),
      },
    });
    expect(ids(answer)).toEqual(["L-sep-30"]);
  });

  it("keeps Sunday night inside the Monday-through-Sunday week", async () => {
    const { answer } = await ask("What leases are due this week?", {
      nowIso: "2026-10-05T04:30:00.000Z",
      reads: { renewals: renewalsRead(WEEK_LEASES) },
    });
    expect(ids(answer)).toEqual(["L-mon", "L-sun"]);
  });

  it("keeps the S110 today rule for work: due today, overdue, or blocked", async () => {
    const { answer } = await ask("What work is assigned to me today?", {
      reads: {
        work: workRead([
          task({ id: "late-tonight", due_at: "2026-10-01T04:00:00.000Z" }),
          task({ id: "overdue", due_at: "2026-09-20T15:00:00.000Z" }),
          task({ id: "blocked", state: "Blocked" }),
          task({ id: "tomorrow", due_at: "2026-10-01T15:00:00.000Z" }),
          task({
            id: "not-mine",
            assignee_uid: "uid-other",
            due_at: "2026-09-30T15:00:00.000Z",
          }),
        ]),
      },
    });
    expect(ids(answer)).toEqual(["late-tonight", "overdue", "blocked"]);
  });
});

describe("S138 empty, partial, unavailable and denied stay distinct", () => {
  it("reports a genuine empty result as complete", async () => {
    const { answer } = await ask("What leases are due this week?", {
      reads: { renewals: renewalsRead([{ id: "L-far", endDateIso: "2026-12-15" }]) },
    });
    expect(answer.groups[0].status).toBe("ok");
    expect(answer.groups[0].total).toBe(0);
    expect(answer.summary).toBe(
      "No leases end this week, 09/28/2026 through 10/04/2026 (Monday through Sunday).",
    );
  });

  it("keeps other modules answering when one source is unavailable", async () => {
    const { answer } = await ask("Which leases or work items are assigned to me?", {
      reads: {
        renewals: unavailableRead(
          "renewals",
          "The renewal source could not be read just now.",
        ),
        work: workRead([task({ id: "t1" })]),
      },
    });
    expect(answer.groups[0].status).toBe("unavailable");
    expect(answer.groups[0].summary).toBe(
      "The renewal source could not be read just now.",
    );
    expect(answer.groups[0].items).toEqual([]);
    expect(answer.groups[1].status).toBe("ok");
    expect(ids(answer, 1)).toEqual(["t1"]);
  });

  it("gives an actor without access no count, label or link", async () => {
    const { answer } = await ask("Which leases are blocked?", {
      reads: {
        renewals: notAuthorizedRead(
          "renewals",
          "Renewal records need access to the Renewals Space.",
        ),
      },
    });
    expect(answer.groups[0]).toMatchObject({
      status: "not_authorized",
      total: 0,
      items: [],
      link: null,
      summary: "Renewal records need access to the Renewals Space.",
    });
  });

  it("names the uncovered part of a period instead of implying there is nothing", async () => {
    const { answer } = await ask("Which leases are coming up in 2027-03?", {
      reads: { renewals: renewalsRead([{ id: "L1", endDateIso: "2027-03-02" }]) },
    });
    expect(answer.groups[0].status).toBe("partial");
    expect(answer.groups[0].notes).toContain(
      "The renewal read covers leases ending 09/01/2026 through 01/28/2027, so leases ending outside those dates are not included.",
    );
  });

  it("states the full count and links the owning view beyond one page", async () => {
    const leases = Array.from({ length: 30 }, (_, index) => ({
      id: `L${String(index).padStart(2, "0")}`,
      endDateIso: "2026-10-15",
    }));
    const { answer } = await ask("Which leases are coming up next month?", {
      reads: { renewals: renewalsRead(leases) },
    });
    expect(answer.groups[0].total).toBe(30);
    expect(answer.groups[0].items).toHaveLength(25);
    expect(answer.groups[0].notes).toContain(
      "Showing the first 25 of 30. Open the full list for the rest.",
    );
    expect(answer.groups[0].link?.href).toBe(
      "/lease-renewal/live/desk?v=2&month=2026-10",
    );
  });

  it("reports a source that throws as unavailable while other groups answer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { answer } = await ask("Which leases are blocked, and what tasks do I have?", {
      reads: {
        renewals: renewalsRead([{ id: "L1", blockers: ["Owner has not responded"] }]),
        work: new Error("boom"),
      },
    });
    expect(answer.groups.map((group) => group.status)).toEqual(["ok", "unavailable"]);
    expect(ids(answer, 0)).toEqual(["L1"]);
  });

  it("marks a truncated My Work read partial", async () => {
    const { answer } = await ask("What tasks do I have?", {
      reads: { work: workRead([task({ id: "t1" })], true) },
    });
    expect(answer.groups[0].status).toBe("partial");
    expect(answer.groups[0].notes.join(" ")).toContain("record limit");
  });
});

describe("S138 role-appropriate visibility", () => {
  it("keeps other people's assignments Admin-only", async () => {
    const { answer } = await ask("Which tasks are assigned to Casey Doe?", {
      people: null,
      teamWork: notAuthorizedRead(
        "work",
        "Only an Admin can see other people's assigned work.",
      ),
    });
    expect(answer.groups[0].status).toBe("not_authorized");
    expect(answer.groups[0].summary).toBe(
      "Only an Admin can see other people's assigned work.",
    );
  });

  it("lets an Admin ask about a named staff member's work", async () => {
    const { answer } = await ask("Which tasks are assigned to Casey Doe?", {
      people: [
        {
          uid: "uid-casey",
          label: "casey.doe@pmikcmetro.com",
          email: "casey.doe@pmikcmetro.com",
        },
      ],
      teamWork: workRead([
        task({ id: "c1", assignee_uid: "uid-casey" }),
        task({ id: "c2", assignee_uid: "uid-other" }),
      ]),
    });
    expect(ids(answer)).toEqual(["c1"]);
  });
});

describe("S138 the model only proposes a plan", () => {
  const modelPlan = (overrides: Partial<ConversationPlan> = {}): ConversationPlan => ({
    kind: "operational",
    subjects: ["leases"],
    filters: { ...EMPTY_FILTERS },
    followUp: { usePrevious: false, ordinal: null, detail: false },
    clarification: null,
    unsupportedTopic: null,
    ...overrides,
  });

  it("drops a person the user never named", async () => {
    const interpret: ModelInterpreter = async () =>
      modelPlan({
        filters: { ...EMPTY_FILTERS, people: ["Alex Rivera"], peopleMatch: "related" },
      });
    const { answer } = await ask(
      "Which leases need attention?",
      {
        reads: {
          renewals: renewalsRead([{ id: "L1" }, { id: "L2", owners: ["Alex Rivera"] }]),
        },
      },
      null,
      interpret,
    );
    expect(answer.interpretedBy).toBe("model");
    expect(ids(answer)).toEqual(["L1", "L2"]);
  });

  it("falls back to the deterministic interpreter when the model fails", async () => {
    const interpret: ModelInterpreter = async () => {
      throw new Error("timeout");
    };
    const { answer } = await ask(
      "Which leases are blocked?",
      {
        reads: { renewals: renewalsRead([{ id: "L1", blockers: ["x"] }, { id: "L2" }]) },
      },
      null,
      interpret,
    );
    expect(answer.interpretedBy).toBe("deterministic");
    expect(ids(answer)).toEqual(["L1"]);
  });

  it("sends the model only the question, business date and earlier plans, and validates its reply", async () => {
    const requests: ModelTextRequest[] = [];
    const provider = (text: string): ModelProvider =>
      ({
        generateText: async (request: ModelTextRequest) => {
          requests.push(request);
          return { text, model: request.model };
        },
      }) as unknown as ModelProvider;
    const valid = JSON.stringify({
      kind: "operational",
      subjects: ["approvals"],
      filters: {
        range: { preset: "none", month: null },
        dateField: "none",
        assignee: "none",
        people: [],
        peopleMatch: "none",
        blocked: null,
        stale: null,
        waitingOnOthers: true,
        needsMyApproval: null,
        includeClosed: null,
        text: null,
      },
      followUp: { usePrevious: false, ordinal: null, detail: false },
      clarification: null,
      unsupportedTopic: null,
    });
    const plan = await interpretWithModel(
      "Which approvals wait on others?",
      [],
      TEST_NOW,
      {
        provider: provider(valid),
        model: "gemini-3.1-flash-lite",
      },
    );
    expect(plan?.subjects).toEqual(["approvals"]);
    expect(plan?.filters.range).toBeNull();
    expect(requests[0].purpose).toBe("assistant.interpret");
    expect(requests[0].temperature).toBe(0);
    expect(Object.keys(JSON.parse(requests[0].userContent)).sort()).toEqual(
      ["previous", "question", "timeZone", "today", "weekStartsOn"].sort(),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      await interpretWithModel("x", [], TEST_NOW, {
        provider: provider('{"kind":"sql"}'),
        model: "m",
      }),
    ).toBeNull();
    expect(ConversationPlanSchema.safeParse(JSON.parse(valid)).success).toBe(true);
  });
});

describe("S138 knowledge and unsupported questions", () => {
  it("routes a policy question to the knowledge answer without reading records", async () => {
    const { answer, calls } = await ask("What is our pet policy?");
    expect(answer.kind).toBe("knowledge");
    expect(answer.knowledgeQuestion).toBe("What is our pet policy?");
    expect(calls).toEqual([]);
  });

  it("answers the operational part of a mixed question and also asks the knowledge answer", async () => {
    const { answer } = await ask(
      "What is the policy for late fees and which leases are blocked?",
      {
        reads: { renewals: renewalsRead([{ id: "L1", blockers: ["x"] }]) },
      },
    );
    expect(answer.kind).toBe("answer");
    expect(ids(answer)).toEqual(["L1"]);
    expect(answer.knowledgeQuestion).not.toBeNull();
  });

  it("hands open discussion to labeled knowledge guidance and reads no unrelated records", async () => {
    const { answer, calls } = await ask("What is the weather tomorrow?");
    expect(answer.kind).toBe("unsupported");
    expect(answer.summary).toContain("clearly labeled guidance");
    expect(answer.knowledgeQuestion).toBe("What is the weather tomorrow?");
    expect(calls).toEqual([]);
  });
});

describe("S138 zero write across every path", () => {
  it("never opens the action gate while answering", async () => {
    const gate = (await import("@/lib/integrations/action-gate")) as Record<
      string,
      unknown
    >;
    const original = new Map<string, unknown>();
    for (const key of Object.keys(gate)) {
      if (typeof gate[key] !== "function") continue;
      original.set(key, gate[key]);
      Object.defineProperty(gate, key, {
        configurable: true,
        value: () => {
          throw new Error(`The assistant invoked the action gate through ${key}.`);
        },
      });
    }
    expect(original.size).toBeGreaterThan(0);
    try {
      const input: FakeContextInput = {
        reads: {
          renewals: renewalsRead(WEEK_LEASES),
          work: workRead([task({ id: "t1" })]),
          approvals: approvalsRead([{ key: "a1", canApproveNow: true }]),
          connections: connectionsRead([{ id: "c", state: "connected" }]),
        },
      };
      let conversation: ConversationContext | null = null;
      for (const question of [
        "What leases are due this week?",
        "Only mine",
        "Which of those need approval?",
        "What applications are connected?",
        "What information is stale and needs updating?",
        "What work is assigned to me today?",
      ]) {
        const { answer } = await ask(question, input, conversation);
        conversation = answer.conversation;
      }
    } finally {
      for (const [key, value] of original) {
        Object.defineProperty(gate, key, { configurable: true, value });
      }
    }
  });

  it("keeps the conversation, context and route free of writers and senders", () => {
    const files = [
      join(process.cwd(), "app", "api", "assistant", "query", "route.ts"),
      ...walk(join(process.cwd(), "lib", "assistant")),
      ...walk(join(process.cwd(), "lib", "operational-context")),
    ];
    for (const path of files) {
      const code = readFileSync(path, "utf8").replaceAll(
        /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        "",
      );
      for (const forbidden of [
        "action-gate",
        "external-execution/orchestrator",
        "rentvine/write-client",
        "runTransaction",
        "createDraft",
        "sendConfirmed",
        "startRun",
        "createWorkflowRun",
      ]) {
        expect(code, `${path}: ${forbidden}`).not.toContain(forbidden);
      }
      // Map, Set and hash bookkeeping is fine; a Firestore document or collection write is not.
      expect(code, path).not.toMatch(/\.doc\([^)]*\)\s*\.(set|update|delete|create)\(/);
      expect(code, path).not.toMatch(/\.collection\([^)]*\)\s*\.add\(/);
    }
    const context = readFileSync("lib/operational-context/server-context.ts", "utf8");
    const mailCalls = [...context.matchAll(/createGmailHubService\([^)]*\)\.(\w+)/g)].map(
      (match) => match[1],
    );
    expect(mailCalls).toEqual(["listCommunications"]);
    expect(context).toContain("loadRenewalAssistantSource");
  });
});

function walk(directory: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}
