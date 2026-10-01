import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  conversationActorKey,
  runAssistantConversation,
  runStoredPlan,
  storedPlanSupport,
  type ConversationAnswer,
  type ModelInterpreter,
} from "@/lib/assistant/conversation";
import { EMPTY_FILTERS, type ConversationPlan } from "@/lib/assistant/conversation-plan";
import {
  approvalsRead,
  connectionsRead,
  fakeOperationalContext,
  renewalsRead,
  task,
  workRead,
} from "@/tests/helpers/operational-context-fake";

// S150: a saved question's stored plan runs again through the S138 subject executors with no
// interpretation step. Every model seam is counted: the stored-plan path has no interpreter
// parameter at all, and the fail-first fixture proves today's only entry point interprets on every
// call. Relative periods resolve at run time on the business calendar, a named month stays fixed,
// and a failed, partial or denied read is reported as exactly that, never as an old answer.

const ACTOR = "uid-me";
const SEPTEMBER = "2026-09-30T17:00:00.000Z";
const OCTOBER = "2026-10-15T17:00:00.000Z";

const LEASES = [
  { id: "L-SEP", endDateIso: "2026-09-25" },
  { id: "L-OCT-A", endDateIso: "2026-10-05" },
  { id: "L-OCT-B", endDateIso: "2026-10-28" },
  { id: "L-NOV", endDateIso: "2026-11-12" },
];

function contextAt(nowIso: string, reads = {}) {
  return fakeOperationalContext({
    actorUid: ACTOR,
    nowIso,
    reads: {
      renewals: renewalsRead(LEASES),
      work: workRead([
        task({ id: "t-mine", assignee_uid: ACTOR }),
        task({ id: "t-other", assignee_uid: "uid-other" }),
      ]),
      approvals: approvalsRead([{ key: "q-1" }]),
      connections: connectionsRead([{ id: "rentvine", state: "connected" }]),
      ...reads,
    },
  });
}

function plan(overrides: Partial<ConversationPlan> = {}): ConversationPlan {
  return {
    kind: "operational",
    subjects: ["leases"],
    filters: { ...EMPTY_FILTERS },
    followUp: { usePrevious: false, ordinal: null, detail: false },
    clarification: null,
    unsupportedTopic: null,
    ...overrides,
  };
}

async function ask(
  question: string,
  nowIso: string,
  interpret: ModelInterpreter | null = null,
) {
  const context = contextAt(nowIso);
  return runAssistantConversation(
    { question, conversation: null },
    { nowIso, actorKey: conversationActorKey(ACTOR), context, interpret },
  );
}

async function rerun(answer: ConversationAnswer, nowIso: string, reads = {}) {
  const context = contextAt(nowIso, reads);
  const result = await runStoredPlan(
    {
      question: "saved question",
      plan: answer.execution!.plan,
      relatedRefs: answer.execution!.relatedRefs,
      detailRef: answer.execution!.detailRef,
    },
    { nowIso, actorKey: conversationActorKey(ACTOR), context },
  );
  return { result, context };
}

const ids = (answer: ConversationAnswer) =>
  answer.groups.flatMap((group) => group.items.map((item) => item.ref.id));

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("S150 stored-plan run", () => {
  it("ARCH-S150-1 fail-first: the question path interprets every time; the stored-plan path never does", async () => {
    const interpret = vi.fn<ModelInterpreter>(async () => null);
    const first = await ask("What leases are due this month?", SEPTEMBER, interpret);
    await ask("What leases are due this month?", SEPTEMBER, interpret);
    // Today's only entry point asks the interpreter on every call, even for the same question.
    expect(interpret).toHaveBeenCalledTimes(2);

    const { result } = await rerun(first, SEPTEMBER);
    expect(interpret).toHaveBeenCalledTimes(2);
    expect(result.interpretedBy).toBe("stored_plan");
    expect(result.interpretation).toContain(
      "Ran your saved question again with current records; it was not reinterpreted.",
    );
    // runStoredPlan accepts no interpreter at all.
    expect(runStoredPlan.length).toBe(2);
  });

  it("BEH-S150-1: a rerun matches a new question's records for the same data and moment", async () => {
    const asked = await ask("What leases are due this month?", SEPTEMBER);
    expect(ids(asked)).toEqual(["L-SEP"]);
    const { result } = await rerun(asked, SEPTEMBER);
    expect(ids(result)).toEqual(ids(asked));
    expect(result.groups.map((group) => group.total)).toEqual(
      asked.groups.map((group) => group.total),
    );
    expect(result.groups[0].items.map((item) => item.href)).toEqual(
      asked.groups[0].items.map((item) => item.href),
    );
  });

  it("BEH-S149-2: 'this month' is worked out again in the new month and records its actual range", async () => {
    const september = await ask("What leases are due this month?", SEPTEMBER);
    expect(september.execution?.range).toMatchObject({
      preset: "this_month",
      intent: "relative",
      startIso: "2026-09-01",
      endIso: "2026-09-30",
    });
    const { result } = await rerun(september, OCTOBER);
    expect(ids(result).sort()).toEqual(["L-OCT-A", "L-OCT-B"]);
    expect(result.execution?.range).toMatchObject({
      preset: "this_month",
      intent: "relative",
      startIso: "2026-10-01",
      endIso: "2026-10-31",
    });
    // The earlier answer is a value: running again never changes it.
    expect(ids(september)).toEqual(["L-SEP"]);
    expect(september.execution?.range?.startIso).toBe("2026-09-01");
  });

  it("BEH-S149-2: a named month stays fixed on every run", async () => {
    const named = await ask("What leases end in 2026-10?", SEPTEMBER);
    expect(named.execution?.range).toMatchObject({
      preset: "month",
      month: "2026-10",
      intent: "fixed",
    });
    const { result } = await rerun(named, "2026-12-02T17:00:00.000Z");
    expect(ids(result).sort()).toEqual(["L-OCT-A", "L-OCT-B"]);
    expect(result.execution?.range).toMatchObject({ preset: "month", month: "2026-10" });
  });

  it("AC-S149-3: a saved follow-up keeps its merged meaning; its own words alone do not", async () => {
    const first = await ask("What work is assigned to anyone?", SEPTEMBER);
    const followUp = await runAssistantConversation(
      { question: "Only mine", conversation: first.conversation },
      {
        nowIso: SEPTEMBER,
        actorKey: conversationActorKey(ACTOR),
        context: contextAt(SEPTEMBER),
        interpret: null,
      },
    );
    expect(followUp.execution?.plan.subjects).toEqual(["work"]);
    expect(followUp.execution?.plan.filters.assignee).toBe("me");

    // Interpreting the follow-up's words without its conversation loses the subject.
    const wordsOnly = await ask("Only mine", SEPTEMBER);
    expect(wordsOnly.execution?.plan.subjects ?? []).not.toEqual(["work"]);

    const { result } = await rerun(followUp, OCTOBER);
    expect(result.execution?.plan.filters.assignee).toBe("me");
    expect(ids(result)).toEqual(ids(followUp));
    expect(ids(result)).toContain("t-mine");
    expect(ids(result)).not.toContain("t-other");
  });

  it("AC-S149-3: a cross-subject follow-up keeps the record references it was limited to", async () => {
    const stored = {
      question: "saved",
      plan: plan({
        subjects: ["leases"],
        followUp: { usePrevious: true, ordinal: null, detail: false },
      }),
      relatedRefs: [{ source: "renewals" as const, id: "L-OCT-B" }],
      detailRef: null,
    };
    const result = await runStoredPlan(stored, {
      nowIso: OCTOBER,
      actorKey: conversationActorKey(ACTOR),
      context: contextAt(OCTOBER),
    });
    expect(result.execution?.relatedRefs).toEqual(stored.relatedRefs);
    expect(result.interpretation).toContain(
      "Limited to the leases linked to the previous answer.",
    );
    expect(ids(result)).toEqual(["L-OCT-B"]);
  });

  it("answers a saved detail question about its one stored record directly", async () => {
    const result = await runStoredPlan(
      {
        question: "saved",
        plan: plan({ followUp: { usePrevious: true, ordinal: 2, detail: true } }),
        relatedRefs: [],
        detailRef: { source: "renewals", id: "L-OCT-A" },
      },
      {
        nowIso: OCTOBER,
        actorKey: conversationActorKey(ACTOR),
        context: contextAt(OCTOBER),
      },
    );
    expect(result.execution?.detailRef).toEqual({ source: "renewals", id: "L-OCT-A" });
    expect(ids(result)).toEqual(["L-OCT-A"]);
  });

  it("BEH-S150-2: failed, partial and denied current reads are reported as such, never as the old answer", async () => {
    const asked = await ask("What leases are due this month?", SEPTEMBER);
    const failed = await rerun(asked, OCTOBER, { renewals: new Error("source down") });
    expect(failed.result.groups[0].status).not.toBe("ok");
    expect(ids(failed.result)).toEqual([]);

    const denied = await rerun(asked, OCTOBER, {
      renewals: {
        source: "renewals",
        status: "not_authorized",
        records: [],
        truncated: false,
        asOf: OCTOBER,
      },
    });
    expect(denied.result.groups[0].status).toBe("not_authorized");
    expect(ids(denied.result)).toEqual([]);

    const partial = await rerun(asked, OCTOBER, {
      renewals: renewalsRead(LEASES, { readComplete: false, degraded: ["rentvine"] }),
    });
    expect(partial.result.groups[0].status).toBe("partial");

    const empty = await rerun(asked, OCTOBER, { renewals: renewalsRead([]) });
    expect(empty.result.groups[0]).toMatchObject({ status: "ok", total: 0 });
    expect(empty.result.groups[0].summary).not.toBe(failed.result.groups[0].summary);
  });

  it("current runs carry their real as-of, coverage and currency", async () => {
    const asked = await ask("What leases are due this month?", SEPTEMBER);
    const { result } = await rerun(asked, OCTOBER, {
      renewals: renewalsRead(LEASES, {
        currency: { state: "stale", readAtIso: "2026-10-15T09:00:00.000Z" },
        coverage: { startIso: "2026-10-01", endIso: "2027-02-01" },
      }),
    });
    expect(result.groups[0].currency).toEqual({
      state: "stale",
      readAtIso: "2026-10-15T09:00:00.000Z",
    });
    expect(result.groups[0].coverage).toEqual({
      startIso: "2026-10-01",
      endIso: "2027-02-01",
    });
    expect(result.answeredAtIso).toBe(OCTOBER);
  });

  it("logs one bodyless line naming the stored-plan path", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const asked = await ask("What leases are due this month?", SEPTEMBER);
    info.mockClear();
    await rerun(asked, OCTOBER);
    const lines = info.mock.calls.map((call) => JSON.parse(String(call[0])));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: "assistant_conversation",
      interpretedBy: "stored_plan",
    });
    expect(JSON.stringify(lines[0])).not.toMatch(/saved question|L-OCT|due this month/);
  });
});

describe("S150 which stored plans can run without interpretation", () => {
  it("supports lease, work, approval and connection plans", () => {
    for (const subjects of [
      ["leases"],
      ["work"],
      ["approvals"],
      ["connections"],
      ["leases", "approvals"],
    ] as const) {
      expect(storedPlanSupport(plan({ subjects: [...subjects] }), null).supported).toBe(
        true,
      );
    }
    expect(
      storedPlanSupport(
        plan({ subjects: [], filters: { ...EMPTY_FILTERS, stale: true } }),
        null,
      ).supported,
    ).toBe(true);
  });

  it("sends knowledge, mixed, clarifying, unsupported and incomplete plans to a new answer", () => {
    const cases: [unknown, string][] = [
      [plan({ kind: "knowledge", subjects: [] }), "not_operational"],
      [plan({ kind: "mixed" }), "not_operational"],
      [plan({ kind: "clarify", clarification: "Which period?" }), "not_operational"],
      [plan({ subjects: ["maintenance"] }), "unsupported_subject"],
      [plan({ subjects: ["processes"] }), "unsupported_subject"],
      [plan({ subjects: ["communications"] }), "unsupported_subject"],
      [plan({ subjects: [] }), "unsupported_subject"],
      [
        plan({ followUp: { usePrevious: true, ordinal: 2, detail: false } }),
        "incomplete",
      ],
      [{ ...plan(), injected: "x" }, "invalid"],
      [null, "invalid"],
    ];
    for (const [candidate, reason] of cases) {
      expect(storedPlanSupport(candidate, null)).toEqual({ supported: false, reason });
    }
    expect(storedPlanSupport(plan(), { source: "maintenance", id: "ticket-1" })).toEqual({
      supported: false,
      reason: "unsupported_subject",
    });
  });

  it("refuses to run a plan it does not support", async () => {
    await expect(
      runStoredPlan(
        {
          question: "q",
          plan: plan({ kind: "knowledge", subjects: [] }),
          relatedRefs: [],
          detailRef: null,
        },
        {
          nowIso: OCTOBER,
          actorKey: conversationActorKey(ACTOR),
          context: contextAt(OCTOBER),
        },
      ),
    ).rejects.toThrow(/cannot run without interpretation/);
  });
});
