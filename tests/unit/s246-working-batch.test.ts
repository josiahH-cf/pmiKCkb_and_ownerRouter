import { describe, expect, it } from "vitest";

import type { RenewalCycleDateDecision } from "@/lib/lease-renewal/cycle-date-decision";
import {
  RENEWAL_BATCH_COUNT_GROUPS,
  RENEWAL_BATCH_GROUPS,
  RENEWAL_BATCH_GROUP_LABELS,
  defaultRenewalBatchMonth,
  orderThisBatch,
  parseRenewalBatchQuery,
  partitionRenewalBatch,
  renewalBatchCountInWords,
  renewalBatchGroupFor,
  renewalBatchPlacement,
  renewalBatchSummary,
  serializeRenewalBatchQuery,
  shiftRenewalBatchMonth,
  validateRenewalBatchContinuation,
  type RenewalBatchGroup,
  type RenewalBatchItem,
  type RenewalBatchPlacement,
} from "@/lib/lease-renewal/renewal-batch";
import {
  projectRenewalBatchRows,
  renewalBatchRowStage,
  renewalBatchRowTags,
} from "@/lib/lease-renewal/renewal-batch-row";
import {
  projectRenewalTarget,
  type RenewalTargetInput,
} from "@/lib/lease-renewal/renewal-target";
import { projectCycleSourceDateChange } from "@/lib/lease-renewal/cycle-source-date";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";
import {
  S246_LEASES,
  S246_READ_TS,
  S246_RENEWED_CYCLE,
  S246_TODAY,
  S246_WORKING_MONTH,
  loadS246Desk,
  s246Manual,
} from "@/tests/helpers/s246-portfolio";

// S246 ARCH-S246-2 / BEH-S246-1 / BEH-S246-2 / AC-S246-1: the working batch is a partition over the
// desk rows the one orchestration loaded. Values are synthetic.

async function batch(options: Parameters<typeof loadS246Desk>[0] = {}) {
  const view = await loadS246Desk(options);
  const rows = projectRenewalBatchRows(view.items, {
    sourceReadAtIso: S246_READ_TS,
    todayIso: S246_TODAY,
  });
  return { view, rows, partition: partitionRenewalBatch(rows, S246_WORKING_MONTH) };
}
const ids = (rows: readonly { leaseId: string }[]) => rows.map((row) => row.leaseId);

describe("S246 working batch partition (ARCH-S246-2, AC-S246-1)", () => {
  it("BEH-S246-1: on November 5 the batch is December's targets only, with closed and pending leases counted by status name", async () => {
    const { partition } = await batch();
    expect(defaultRenewalBatchMonth(S246_TODAY)).toBe(S246_WORKING_MONTH);
    expect(ids(partition.groups.this_batch)).toEqual([
      S246_LEASES.activeInMonth,
      S246_LEASES.activeInMonthSecond,
      S246_LEASES.statusUnreadable,
    ]);
    // R-S246-3: earlier months without a recorded completion, oldest end date first.
    expect(ids(partition.groups.carried_over)).toEqual([
      S246_LEASES.endedWithoutOutcome,
      S246_LEASES.endingThisMonth,
    ]);
    expect(new Set(ids(partition.groups.not_targets))).toEqual(
      new Set([
        S246_LEASES.closed,
        S246_LEASES.pending,
        S246_LEASES.program,
        S246_LEASES.ownerHold,
        S246_LEASES.noEndDate,
      ]),
    );
    expect(partition.notTargetReasons).toEqual([
      { label: "No end date on file", count: 1 },
      { label: "Owner-authorized hold", count: 1 },
      { label: "Program lease", count: 1 },
      { label: "RentVine reports Closed", count: 1 },
      { label: "RentVine reports Future", count: 1 },
    ]);
    expect(ids(partition.groups.renewed_in_rentvine)).toEqual([
      S246_LEASES.renewedInSource,
    ]);
    expect(ids(partition.groups.month_to_month_reviews)).toEqual([
      S246_LEASES.monthToMonthDue,
    ]);
    expect(ids(partition.groups.non_renewals)).toEqual([S246_LEASES.moveOut]);
    expect(ids(partition.groups.coming_up_later)).toEqual([
      S246_LEASES.activeLater,
      S246_LEASES.monthToMonthLater,
    ]);
    expect(ids(partition.groups.completed)).toEqual([S246_LEASES.completed]);
  });

  it("AC-S246-1 / R-S246-11: each lease lands in exactly one group and the counts sum to the total loaded", async () => {
    const { view, partition } = await batch();
    const placed = RENEWAL_BATCH_GROUPS.flatMap((group) =>
      ids(partition.groups[group]).map((id) => [id, group] as const),
    );
    expect(placed).toHaveLength(view.items.length);
    expect(new Set(placed.map(([id]) => id)).size).toBe(view.items.length);
    expect(
      RENEWAL_BATCH_GROUPS.reduce((sum, group) => sum + partition.counts[group], 0),
    ).toBe(partition.total);
    expect(partition.total).toBe(16);
  });

  it("R-S246-2: Previous month and Next month move the same rows between groups without losing one", async () => {
    const { rows } = await batch();
    const november = partitionRenewalBatch(
      rows,
      shiftRenewalBatchMonth(S246_WORKING_MONTH, -1),
    );
    expect(ids(november.groups.this_batch)).toEqual([S246_LEASES.endingThisMonth]);
    expect(ids(november.groups.carried_over)).toEqual([S246_LEASES.endedWithoutOutcome]);
    const february = partitionRenewalBatch(rows, "2027-02");
    expect(ids(february.groups.this_batch)).toEqual([S246_LEASES.activeLater]);
    expect(february.counts.carried_over).toBe(5);
    for (const partition of [november, february]) expect(partition.total).toBe(16);
    expect(shiftRenewalBatchMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftRenewalBatchMonth("2027-01", -1)).toBe("2026-12");
  });

  it("BEH-S246-5: with the status table unreadable every lease stays listed and labeled, and none is counted closed", async () => {
    const { rows, partition } = await batch({ statuses: "unavailable" });
    expect(partition.total).toBe(16);
    expect(partition.notTargetReasons.map((entry) => entry.label)).not.toContain(
      "RentVine reports Closed",
    );
    for (const row of rows)
      expect(row.statusNote, row.leaseId).toBe("RentVine status unavailable");
    // The leases RentVine would report closed or pending are listed in the batch by their date.
    expect(ids(partition.groups.this_batch)).toEqual(
      expect.arrayContaining([S246_LEASES.closed, S246_LEASES.pending]),
    );
  });

  it("R-S246-12: one lease with an unreadable status stays in its group with the label and the others carry none", async () => {
    const { rows } = await batch();
    const labeled = rows.filter((row) => row.statusNote !== null);
    expect(ids(labeled)).toEqual([S246_LEASES.statusUnreadable]);
    expect(labeled[0].statusNote).toBe("RentVine status unavailable");
    expect(renewalBatchGroupFor(labeled[0].placement, S246_WORKING_MONTH)).toBe(
      "this_batch",
    );
  });
});

describe("S246 renewed in RentVine (BEH-S246-2, R-S246-5)", () => {
  const decision: RenewalCycleDateDecision = {
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
  };

  it("offers confirm and close with both dates and completes nothing by itself", async () => {
    const { rows, partition } = await batch();
    const row = rows.find((entry) => entry.leaseId === S246_LEASES.renewedInSource)!;
    // The row names the work record version it was projected from; a confirmation is bound to it.
    const shown = s246Manual().get(S246_LEASES.renewedInSource)!;
    expect(row.sourceRenewal).toEqual({
      recordedDateIso: "2026-12-31",
      sourceDateIso: "2027-12-31",
      recordedLabel: "12/31/2026",
      sourceLabel: "12/31/2027",
      cycleId: S246_RENEWED_CYCLE,
      revision: shown.revision,
    });
    expect(shown.cycleId).toBe(S246_RENEWED_CYCLE);
    expect(partition.counts.completed).toBe(1);
    expect(ids(partition.groups.this_batch)).not.toContain(S246_LEASES.renewedInSource);
  });

  it("declining keeps the lease in the batch of the cycle staff recorded", async () => {
    const { rows, partition } = await batch({
      decisions: new Map([[S246_LEASES.renewedInSource, decision]]),
    });
    expect(partition.counts.renewed_in_rentvine).toBe(0);
    expect(ids(partition.groups.this_batch)).toContain(S246_LEASES.renewedInSource);
    const row = rows.find((entry) => entry.leaseId === S246_LEASES.renewedInSource)!;
    expect(row.dateLabel).toBe("Ends 12/31/2026");
    expect(row.dateNote).toMatch(/^RentVine now reports 12\/31\/2027/);
  });

  it("a decision made for another cycle or another RentVine date is not current, so the lease asks again", async () => {
    for (const stale of [
      { ...decision, sourceDateIso: "2027-11-30" },
      { ...decision, recordedDateIso: "2026-11-30" },
      { ...decision, cycleId: "8e3f4051-6273-4d84-9e95-0f1a2b3c4d5e" },
    ]) {
      const { partition } = await batch({
        decisions: new Map([[S246_LEASES.renewedInSource, stale]]),
      });
      expect(ids(partition.groups.renewed_in_rentvine)).toEqual([
        S246_LEASES.renewedInSource,
      ]);
    }
  });

  it("recording staff completion moves the lease out of the open groups", async () => {
    const manual = s246Manual();
    manual.set(
      S246_LEASES.renewedInSource,
      planRenewalWorkspaceAction(
        manual.get(S246_LEASES.renewedInSource)!,
        { kind: "complete", source: "RentVine lease end 2027-12-31" },
        {
          actorUid: "synthetic-operator",
          recordedAt: "2026-11-05T17:00:00.000Z",
          eventId: "111-complete",
        },
      ),
    );
    const { partition } = await batch({ manual });
    for (const group of ["this_batch", "carried_over", "renewed_in_rentvine"] as const)
      expect(ids(partition.groups[group])).not.toContain(S246_LEASES.renewedInSource);
    // The completed cycle is history; the lease is now dated by the lease end RentVine reports.
    expect(ids(partition.groups.coming_up_later)).toContain(S246_LEASES.renewedInSource);
    expect(partition.total).toBe(16);
  });
});

describe("S246 one short row (R-S246-7) and its seams", () => {
  it("a batch row carries address, tenants, end date, one stage line, one next step and at most three tags", async () => {
    const { rows } = await batch();
    const row = rows.find((entry) => entry.leaseId === S246_LEASES.activeInMonth)!;
    expect(row.address).toContain("Sample St");
    expect(row.tenants).toEqual(["Avery Example"]);
    expect(row.dateLabel).toBe("Ends 12/31/2026");
    // S247 R-S247-3 replaces this seam with the one stage projection: a lease with nothing
    // recorded whose current rent still needs a check stands at the path's first open step.
    expect(row.stageLine).toBe(
      "Verifying lease and rent, waiting on the PMI KC team, nothing recorded yet",
    );
    expect(row.nextStep).toEqual({
      label: "Check the numbers",
      stepId: "check-numbers",
      controlId: null,
    });
    expect(row.tags.length).toBeLessThanOrEqual(3);
    expect(row.canOpen).toBe(true);
    const ended = rows.find(
      (entry) => entry.leaseId === S246_LEASES.endedWithoutOutcome,
    )!;
    expect(ended.dateLabel).toBe("Ended 10/31/2026");
    // A classification label is context, never a next step. S247: the next step is the lease's
    // current path step, the same one its page and the assistant name.
    expect(ended.nextStep.label).toBe("Check the numbers");
    expect(ended.nextStep.stepId).toBe("check-numbers");
    const review = rows.find((entry) => entry.leaseId === S246_LEASES.monthToMonthDue)!;
    expect(review.dateLabel).toBe("Review due 12/10/2026");
  });

  it("the stage line says who the lease waits on and since when from the staff record", () => {
    const state = planRenewalWorkspaceAction(
      emptyRenewalWorkspace("101", S246_RENEWED_CYCLE, {
        kind: "lease_end",
        dateIso: "2026-12-31",
        source: "RentVine lease end",
      }),
      { kind: "activity", activity: "owner_outreach", outcome: "done", source: "Call" },
      {
        actorUid: "synthetic-operator",
        recordedAt: "2026-11-03T15:00:00.000Z",
        eventId: "101-outreach",
      },
    );
    const stage = renewalBatchRowStage(
      {
        guidance: {
          currentBaseRent: 1200,
          currentBaseRentSource: "RentVine",
          rentVerification: {
            state: "needs_verification",
            verifiedByResolutionDiffers: false,
            destination: { kind: "none" },
          },
          overallStatus: "waiting",
          urgencyRank: 2,
          isBlocked: false,
          blockers: [],
          action: {
            kind: "waiting",
            label: "Record owner response",
            destination: {
              kind: "workspace_phase",
              stepId: "owner-decision",
              controlId: "renewal-manual-owner_response",
            },
          },
        },
        manualProgress: {
          step: { id: "owner-decision", label: "Owner decision", index: 1 },
          complete: false,
          nextActivity: "owner_response",
          waitingParty: "owner",
          nonRenewal: false,
          pendingSourceUpdates: 0,
          label: "Manual work in progress",
        } as never,
        staffRecordedAtIso: state.activities.owner_outreach!.recordedAt,
      },
      S246_READ_TS,
    );
    expect(stage.stageLine).toMatch(/^Waiting on the owner since 11\/03\/2026/);
    expect(stage.nextStep.label).toBe("Record owner response");
    expect(stage.needsCheck).toBe(false);
  });

  it("tags show only what exists today and never more than three", () => {
    expect(renewalBatchRowTags({}, { needsCheck: false, checkDetail: null })).toEqual([]);
    expect(
      renewalBatchRowTags(
        {
          renewalPricing: {
            authority: { covered: true, reason: "Recorded standing owner authority." },
          } as never,
        },
        { needsCheck: true, checkDetail: "Both facts." },
      ).map((tag) => tag.label),
    ).toEqual(["Standing agreement", "Needs a check"]);
  });

  it("the order inside This batch is decided in one function", () => {
    const item = (key: string, sortDateIso: string | null): RenewalBatchItem => ({
      key,
      placement: { kind: "dated", dateIso: sortDateIso ?? "2026-12-31" },
      sortDateIso,
      sortLabel: key,
    });
    expect(
      orderThisBatch([
        item("c", "2026-12-31"),
        item("a", "2026-12-31"),
        item("b", "2026-12-15"),
      ]).map((entry) => entry.key),
    ).toEqual(["b", "a", "c"]);
  });
});

describe("S246 counts reconcile for any portfolio (R-S246-11)", () => {
  // A small seeded generator, so a failure names its seed and reproduces exactly.
  function generator(seed: number) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }
  const pick = <T>(next: () => number, values: readonly T[]): T =>
    values[Math.floor(next() * values.length)];

  it("every generated lease is in exactly one group and the counts sum to the total, for every working month", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const next = generator(seed);
      const size = 1 + Math.floor(next() * 60);
      const rows: (RenewalBatchItem & { leaseId: string })[] = [];
      for (let index = 0; index < size; index += 1) {
        const endDateIso = pick(next, [
          null,
          "2026-09-30",
          "2026-10-31",
          "2026-11-30",
          "2026-12-15",
          "2026-12-31",
          "2027-01-31",
          "2027-06-30",
        ]);
        const recordedIso = pick(next, [null, "2026-10-31", "2026-12-31", "2027-12-31"]);
        const input: RenewalTargetInput = {
          status: pick(next, [
            { state: "active", name: "Active" },
            { state: "closed", name: "Closed" },
            { state: "pending", name: "Future" },
            { state: "unavailable", cause: "status_table_unavailable", name: null },
          ] as const),
          term: pick(next, ["fixed_term", "needs_review", "month_to_month"] as const),
          endDateIso,
          skipReason: pick(next, [
            null,
            null,
            null,
            "owner_authorized",
            "program",
          ] as const),
          moveOutInitiated: next() < 0.1,
          staffRecord: pick(next, [
            null,
            { complete: false, nonRenewal: false },
            { complete: true, nonRenewal: false },
            { complete: false, nonRenewal: true },
            { complete: true, nonRenewal: true },
          ]),
          appCompletionCurrent: next() < 0.05,
          cycleSourceDate: recordedIso
            ? projectCycleSourceDateChange(
                { kind: "lease_end", dateIso: recordedIso, source: "RentVine lease end" },
                endDateIso,
              )
            : null,
          keepWorking: next() < 0.3,
        };
        const placement: RenewalBatchPlacement = renewalBatchPlacement({
          renewalTarget: projectRenewalTarget(input),
          endDateIso,
          retention: {
            state: pick(next, [
              "window",
              "outside",
              "periodic_review",
              "needs_verification",
              "tracked_incomplete",
              "ended_without_outcome",
            ]),
          },
        });
        rows.push({
          key: `lease-${index}`,
          leaseId: `lease-${index}`,
          placement,
          sortDateIso: endDateIso,
          sortLabel: `lease-${index}`,
        });
      }
      for (const month of ["2026-10", "2026-11", "2026-12", "2027-01", "2027-07"]) {
        const partition = partitionRenewalBatch(rows, month);
        const seen = new Map<string, RenewalBatchGroup>();
        for (const group of RENEWAL_BATCH_GROUPS)
          for (const row of partition.groups[group]) {
            expect(seen.has(row.key), `seed ${seed} ${month} ${row.key}`).toBe(false);
            seen.set(row.key, group);
          }
        expect(seen.size, `seed ${seed} ${month}`).toBe(size);
        expect(
          RENEWAL_BATCH_GROUPS.reduce((sum, group) => sum + partition.counts[group], 0),
          `seed ${seed} ${month}`,
        ).toBe(size);
        expect(
          partition.notTargetReasons.reduce((sum, entry) => sum + entry.count, 0),
        ).toBe(partition.counts.not_targets);
      }
    }
  });
});

describe("S246 working month in words and the batch address (R-S246-2)", () => {
  it("states the month and the count in words", () => {
    expect(renewalBatchSummary("2026-12", 5)).toBe(
      "Five leases ending in December 2026 need renewal work.",
    );
    expect(renewalBatchSummary("2026-12", 1)).toBe(
      "One lease ending in December 2026 needs renewal work.",
    );
    expect(renewalBatchSummary("2027-01", 0)).toBe(
      "No leases ending in January 2027 need renewal work.",
    );
    expect(renewalBatchCountInWords(20)).toBe("Twenty");
    expect(renewalBatchCountInWords(21)).toBe("21");
  });

  it("uses the exact group labels staff read", () => {
    expect(RENEWAL_BATCH_GROUP_LABELS).toMatchObject({
      this_batch: "This batch",
      carried_over: "Carried over",
      not_targets: "Not renewal targets",
      renewed_in_rentvine: "Renewed in RentVine, confirm and close",
      month_to_month_reviews: "Month-to-month reviews due",
      non_renewals: "Non-renewals to hand off",
      coming_up_later: "Coming up later",
    });
  });

  it("reads and writes only its own two keys and refuses anything else as a return value", () => {
    expect(parseRenewalBatchQuery({})).toEqual({ month: null, group: null });
    expect(
      parseRenewalBatchQuery(new URLSearchParams("batch=2027-01&group=not_targets")),
    ).toEqual({ month: "2027-01", group: "not_targets" });
    expect(parseRenewalBatchQuery({ batch: "2026-13", group: "this_batch" })).toEqual({
      month: null,
      group: null,
    });
    for (const group of RENEWAL_BATCH_COUNT_GROUPS)
      expect(
        validateRenewalBatchContinuation(
          serializeRenewalBatchQuery({ month: "2026-12", group }),
        ),
      ).toBe(`batch=2026-12&group=${group}`);
    expect(validateRenewalBatchContinuation("group=completed")).toBe("group=completed");
    for (const refused of [
      "",
      "v=2",
      "batch=2026-12&v=2",
      "group=not_targets&batch=2026-12",
      "batch=2026-12&batch=2027-01",
      "batch=2026-12#x",
      "?batch=2026-12",
      "batch=//elsewhere.example",
      null,
      undefined,
    ])
      expect(validateRenewalBatchContinuation(refused), String(refused)).toBeNull();
  });
});
