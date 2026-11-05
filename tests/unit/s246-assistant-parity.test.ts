import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  conversationActorKey,
  runAssistantConversation,
  type ConversationAnswer,
} from "@/lib/assistant/conversation";
import {
  RENEWAL_BATCH_GROUPS,
  partitionRenewalBatch,
  renewalBatchExcludedNotes,
} from "@/lib/lease-renewal/renewal-batch";
import { DEFAULT_RENEWAL_DESK_QUERY_V2 } from "@/lib/lease-renewal/desk-query-v2";
import { buildExplicitDeskHref } from "@/lib/lease-renewal/desk-view-continuation";
import { projectRenewalBatchRows } from "@/lib/lease-renewal/renewal-batch-row";
import { projectRenewalRead } from "@/lib/operational-context/projections";
import { fakeOperationalContext } from "@/tests/helpers/operational-context-fake";
import {
  S246_LEASES,
  S246_READ_TS,
  S246_RENEWED_CYCLE,
  S246_TODAY,
  S246_WORKING_MONTH,
  loadS246Desk,
  type S246DeskOptions,
} from "@/tests/helpers/s246-portfolio";

// S246 BEH-S246-4 / AC-S246-4: a Dashboard assistant answer about a month's renewals lists exactly
// the working batch of that month and states the excluded counts by reason, from the same rows
// and the same partition the desk renders. Values are synthetic.

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function deskAndAnswer(
  question: string,
  options: S246DeskOptions = {},
): Promise<{
  answer: ConversationAnswer;
  partition: ReturnType<typeof partitionRenewalBatch>;
}> {
  const view = await loadS246Desk(options);
  const window = view.windows[0];
  const ctx = fakeOperationalContext({
    nowIso: S246_READ_TS,
    reads: {
      renewals: projectRenewalRead({
        status: "ok",
        rows: view.items,
        readComplete: view.readComplete,
        dataCurrency: view.dataCurrency,
        coverage: { startIso: window.startIso, endIso: window.endIso },
      }),
    },
  });
  const answer = await runAssistantConversation(
    { question, conversation: null },
    {
      nowIso: ctx.nowIso,
      actorKey: conversationActorKey(ctx.actorUid),
      context: ctx,
      interpret: null,
    },
  );
  const partition = partitionRenewalBatch(
    projectRenewalBatchRows(view.items, {
      sourceReadAtIso: S246_READ_TS,
      todayIso: S246_TODAY,
    }),
    S246_WORKING_MONTH,
  );
  return { answer, partition };
}

const answerIds = (answer: ConversationAnswer) =>
  answer.groups[0].items.map((item) => item.ref.id).sort();

describe("S246 the assistant and the desk agree on a month (BEH-S246-4, AC-S246-4)", () => {
  it("BEH-S246-4: next month's answer lists exactly the batch membership", async () => {
    const { answer, partition } = await deskAndAnswer(
      "Which leases are coming up next month?",
    );
    expect(answer.kind).toBe("answer");
    expect(answerIds(answer)).toEqual(
      partition.groups.this_batch.map((row) => row.key).sort(),
    );
    expect(answerIds(answer)).toEqual([
      S246_LEASES.activeInMonth,
      S246_LEASES.activeInMonthSecond,
      S246_LEASES.statusUnreadable,
    ]);
    // Leases that end in the month and are outside renewal work are named in the counts only.
    for (const excluded of [
      S246_LEASES.closed,
      S246_LEASES.pending,
      S246_LEASES.moveOut,
      S246_LEASES.completed,
    ])
      expect(answerIds(answer)).not.toContain(excluded);
    expect(answer.summary).toContain("next month, December 2026");
  });

  it("AC-S246-4: the answer states the desk's other counts and each excluded reason", async () => {
    const { answer, partition } = await deskAndAnswer(
      "Which leases are coming up next month?",
    );
    const notes = answer.groups[0].notes;
    expect(notes).toEqual(
      expect.arrayContaining([...renewalBatchExcludedNotes(partition)]),
    );
    expect(notes).toContain(
      "Also on the Renewals desk for December 2026: Carried over (2); Renewed in RentVine, confirm and close (1); Month-to-month reviews due (1); Non-renewals to hand off (1); Coming up later (2); Not renewal targets (5); Completed (1).",
    );
    expect(notes).toContain(
      "Not renewal targets by reason: No end date on file (1); Owner-authorized hold (1); Program lease (1); RentVine status: Closed (1); RentVine status: Future (1).",
    );
    // The listed leases and the stated counts account for every loaded lease.
    expect(
      RENEWAL_BATCH_GROUPS.reduce((sum, group) => sum + partition.counts[group], 0),
    ).toBe(16);
    expect(answer.groups[0].total).toBe(partition.counts.this_batch);
    expect(answer.interpretation.join(" ")).toMatch(/renewal targets/i);
  });

  it("the answer links the same month of the working batch", async () => {
    const { answer } = await deskAndAnswer("Which leases are coming up next month?");
    expect(answer.groups[0].link).toEqual({
      label: "Open these on the Renewals desk",
      href: "/lease-renewal/live/desk?batch=2026-12",
    });
  });

  it("a narrowed month answer keeps its filter on the desk link", async () => {
    const { answer } = await deskAndAnswer(
      "Which blocked leases are coming up next month?",
    );
    expect(answer.interpretation.join(" ")).toMatch(/renewal targets/i);
    // The batch link would open every target of the month. A blocked answer opens the table with
    // the month and the blocked filter, the leases the answer narrowed to.
    expect(answer.groups[0].link).toEqual({
      label: "Open these on the Renewals desk",
      href: buildExplicitDeskHref({
        ...DEFAULT_RENEWAL_DESK_QUERY_V2,
        month: "2026-12",
        blocked: "blocked",
      }),
    });
  });

  it("a lease staff chose to keep working is in the answer exactly as it is in the batch", async () => {
    const { answer, partition } = await deskAndAnswer(
      "Which leases are coming up next month?",
      {
        decisions: new Map([
          [
            S246_LEASES.renewedInSource,
            {
              schemaVersion: "renewal-cycle-date-decision/v1",
              leaseId: S246_LEASES.renewedInSource,
              cycleId: S246_RENEWED_CYCLE,
              recordedDateIso: "2026-12-31",
              sourceDateIso: "2027-12-31",
              decision: "keep_working",
              revision: 1,
              recordedAt: "2026-11-04T16:00:00.000Z",
              recordedByUid: "synthetic-operator",
              recordedByLabel: "operator@example.invalid",
              eventId: "7d2e3f40-5162-4c73-8d84-9e0f1a2b3c4d",
            },
          ],
        ]),
      },
    );
    expect(partition.groups.this_batch.map((row) => row.key)).toContain(
      S246_LEASES.renewedInSource,
    );
    expect(answerIds(answer)).toEqual(
      partition.groups.this_batch.map((row) => row.key).sort(),
    );
    expect(answer.groups[0].notes.join(" ")).not.toContain("Renewed in RentVine");
  });

  it("with the status table unreadable the answer keeps every lease the batch keeps (R-S246-12)", async () => {
    const { answer, partition } = await deskAndAnswer(
      "Which leases are coming up next month?",
      { statuses: "unavailable" },
    );
    expect(answerIds(answer)).toEqual(
      partition.groups.this_batch.map((row) => row.key).sort(),
    );
    expect(answerIds(answer)).toEqual(
      expect.arrayContaining([S246_LEASES.closed, S246_LEASES.pending]),
    );
    expect(answer.groups[0].notes.join(" ")).not.toContain("RentVine status: Closed");
  });

  it("a named month gives the same membership as the relative one", async () => {
    const named = await deskAndAnswer("renewals for 2026-12");
    expect(answerIds(named.answer)).toEqual([
      S246_LEASES.activeInMonth,
      S246_LEASES.activeInMonthSecond,
      S246_LEASES.statusUnreadable,
    ]);
    // This month's batch is the lease that ends in November; October's lease is carried over.
    const current = await deskAndAnswer("renewals for 2026-11");
    expect(answerIds(current.answer)).toEqual([S246_LEASES.endingThisMonth]);
    expect(current.answer.groups[0].notes.join(" ")).toContain("Carried over (1)");
  });
});
