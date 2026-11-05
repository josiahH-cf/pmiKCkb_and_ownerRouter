import { describe, expect, it } from "vitest";

import { projectCycleSourceDateChange } from "@/lib/lease-renewal/cycle-source-date";
import {
  renewalBatchGroupFor,
  renewalBatchPlacement,
} from "@/lib/lease-renewal/renewal-batch";
import {
  RENTVINE_STATUS_UNAVAILABLE_LABEL,
  isRenewalTargetForMonth,
  projectRenewalTarget,
  renewalTargetLine,
  type RenewalTargetInput,
} from "@/lib/lease-renewal/renewal-target";
import { projectRentvineLeaseStatus } from "@/lib/lease-renewal/rentvine-lease-status";
import {
  S246_LEASES,
  S246_STATUSES,
  S246_WORKING_MONTH,
  loadS246Desk,
  s246Row,
} from "@/tests/helpers/s246-portfolio";

// S246 R-S246-1 / R-S246-12: one renewal target definition, carried by the desk orchestration the
// desk page and the assistant share, read from the RentVine lease status table. Values are
// synthetic.

const active = { state: "active", name: "Active" } as const;
const base: RenewalTargetInput = {
  status: active,
  term: "fixed_term",
  endDateIso: "2026-12-31",
  skipReason: null,
  moveOutInitiated: false,
  staffRecord: null,
  appCompletionCurrent: false,
  cycleSourceDate: null,
  keepWorking: false,
};
const recorded = (dateIso: string, currentIso: string | null) =>
  projectCycleSourceDateChange(
    { kind: "lease_end", dateIso, source: "RentVine lease end" },
    currentIso,
  );

describe("S246 target projection in the shared desk orchestration (ARCH-S246-1)", () => {
  it("ARCH-S246-1: a closed lease ending in the window is carried as not a renewal target with its RentVine status name", async () => {
    const view = await loadS246Desk();
    const closed = s246Row(view, S246_LEASES.closed);
    // The table's own projection of this lease is unchanged by this suite (AC-S246-2).
    expect(closed.disposition).toBe("actionable");
    expect(closed.lifecycle?.category).toBe("upcoming");
    // The orchestration now carries the target verdict, read from the lease status table.
    expect(closed.renewalTarget).toEqual({
      kind: "not_target",
      reason: "rentvine_closed",
      label: "RentVine reports Closed",
      statusUnavailable: false,
      statusName: "Closed",
    });
    expect(s246Row(view, S246_LEASES.pending).renewalTarget).toMatchObject({
      kind: "not_target",
      reason: "rentvine_pending",
      label: "RentVine reports Future",
    });
    expect(s246Row(view, S246_LEASES.activeInMonth).renewalTarget).toEqual({
      kind: "target",
      cycleDateIso: "2026-12-31",
      cycleMonth: S246_WORKING_MONTH,
      statusUnavailable: false,
      keptWorking: false,
      statusName: "Active",
    });
  });

  it("R-S246-1: every loaded lease carries one verdict, including a skipped row the move-out read never evaluates", async () => {
    const view = await loadS246Desk();
    for (const row of view.items) expect(row.renewalTarget, row.id).toBeDefined();
    expect(s246Row(view, S246_LEASES.program).moveOut).toBeUndefined();
    expect(s246Row(view, S246_LEASES.program).renewalTarget).toMatchObject({
      kind: "not_target",
      reason: "program",
      label: "Program lease",
    });
    expect(s246Row(view, S246_LEASES.ownerHold).renewalTarget).toMatchObject({
      reason: "owner_hold",
      label: "Owner-authorized hold",
    });
    expect(s246Row(view, S246_LEASES.moveOut).renewalTarget).toMatchObject({
      reason: "move_out_initiated",
    });
    expect(s246Row(view, S246_LEASES.monthToMonthDue).renewalTarget).toMatchObject({
      reason: "month_to_month",
    });
    expect(s246Row(view, S246_LEASES.completed).renewalTarget).toMatchObject({
      reason: "completed",
    });
    expect(s246Row(view, S246_LEASES.renewedInSource).renewalTarget).toMatchObject({
      reason: "renewed_in_rentvine",
      recordedDateIso: "2026-12-31",
      sourceDateIso: "2027-12-31",
    });
    expect(s246Row(view, S246_LEASES.noEndDate).renewalTarget).toMatchObject({
      reason: "no_end_date",
    });
    // A needs-review term whose end date already passed is still a target for its own month.
    expect(s246Row(view, S246_LEASES.endedWithoutOutcome).renewalTarget).toMatchObject({
      kind: "target",
      cycleMonth: "2026-10",
    });
  });

  it("BEH-S246-5 / AC-S246-5: with the status table unreadable every lease keeps a verdict that excludes none on status", async () => {
    const view = await loadS246Desk({ statuses: "unavailable" });
    expect(view.items).toHaveLength(16);
    for (const row of view.items) {
      expect(row.renewalTarget?.statusUnavailable, row.id).toBe(true);
      if (row.renewalTarget?.kind === "not_target")
        expect(row.renewalTarget.reason, row.id).not.toMatch(/^rentvine_/);
    }
    // The leases RentVine would report closed or pending stay listed as targets by their date.
    for (const id of [S246_LEASES.closed, S246_LEASES.pending])
      expect(s246Row(view, id).renewalTarget).toMatchObject({
        kind: "target",
        cycleMonth: S246_WORKING_MONTH,
        statusUnavailable: true,
      });
  });

  it("R-S246-12: one lease whose status does not resolve stays a target and is labeled", async () => {
    const view = await loadS246Desk();
    expect(s246Row(view, S246_LEASES.statusUnreadable).renewalTarget).toEqual({
      kind: "target",
      cycleDateIso: "2026-12-31",
      cycleMonth: S246_WORKING_MONTH,
      statusUnavailable: true,
      keptWorking: false,
      statusName: null,
    });
    expect(RENTVINE_STATUS_UNAVAILABLE_LABEL).toBe("RentVine status unavailable");
  });
});

describe("S246 RentVine lease status fact (R-S246-12)", () => {
  const table = { status: "available", statuses: S246_STATUSES } as const;
  it("reads active, pending and closed from the documented primary status, never from the name", () => {
    expect(projectRentvineLeaseStatus({ leaseStatusID: "2" }, table)).toEqual(active);
    expect(projectRentvineLeaseStatus({ leaseStatusID: 3 }, table)).toEqual({
      state: "closed",
      name: "Closed",
    });
    expect(projectRentvineLeaseStatus({ leaseStatusID: "1" }, table)).toEqual({
      state: "pending",
      name: "Future",
    });
    // A notice status is still an active lease; the move-out flag is read elsewhere.
    expect(projectRentvineLeaseStatus({ leaseStatusID: "4" }, table)).toEqual({
      state: "active",
      name: "Notice Given",
    });
  });
  it("is unavailable, never closed, when the table, the lease status or its primary status cannot be read", () => {
    expect(
      projectRentvineLeaseStatus({ leaseStatusID: "3" }, { status: "unavailable" }),
    ).toEqual({ state: "unavailable", cause: "status_table_unavailable", name: null });
    expect(projectRentvineLeaseStatus({}, table)).toEqual({
      state: "unavailable",
      cause: "lease_status_missing",
      name: null,
    });
    expect(projectRentvineLeaseStatus({ leaseStatusID: "99" }, table)).toEqual({
      state: "unavailable",
      cause: "status_unresolved",
      name: null,
    });
    expect(projectRentvineLeaseStatus({ leaseStatusID: "5" }, table)).toEqual({
      state: "unavailable",
      cause: "primary_status_unreadable",
      name: "Unmapped",
    });
  });
});

describe("S246 the one target definition (R-S246-1)", () => {
  it("is a target for exactly the month of its end date", () => {
    const target = projectRenewalTarget(base);
    expect(target).toMatchObject({ kind: "target", cycleMonth: "2026-12" });
    expect(isRenewalTargetForMonth(target, "2026-12")).toBe(true);
    expect(isRenewalTargetForMonth(target, "2026-11")).toBe(false);
    expect(isRenewalTargetForMonth(undefined, "2026-12")).toBe(false);
    expect(projectRenewalTarget({ ...base, term: "needs_review" }).kind).toBe("target");
  });

  it("names one plain reason for every lease that is outside renewal work", () => {
    const reason = (input: Partial<RenewalTargetInput>) => {
      const projection = projectRenewalTarget({ ...base, ...input });
      return projection.kind === "not_target" ? projection.reason : "target";
    };
    expect(reason({ status: { state: "closed", name: "Closed" } })).toBe(
      "rentvine_closed",
    );
    expect(reason({ status: { state: "pending", name: "Future" } })).toBe(
      "rentvine_pending",
    );
    expect(reason({ skipReason: "owner_authorized" })).toBe("owner_hold");
    expect(reason({ skipReason: "program" })).toBe("program");
    expect(reason({ moveOutInitiated: true })).toBe("move_out_initiated");
    expect(reason({ staffRecord: { complete: false, nonRenewal: true } })).toBe(
      "staff_non_renewal",
    );
    expect(reason({ staffRecord: { complete: true, nonRenewal: true } })).toBe(
      "completed",
    );
    expect(reason({ staffRecord: { complete: true, nonRenewal: false } })).toBe(
      "completed",
    );
    expect(reason({ appCompletionCurrent: true })).toBe("completed");
    expect(reason({ term: "month_to_month", endDateIso: null })).toBe("month_to_month");
    expect(reason({ endDateIso: null })).toBe("no_end_date");
    // A closed lease is counted by its status even when a skip marker or a notice also applies.
    expect(
      reason({
        status: { state: "closed", name: "Closed" },
        skipReason: "program",
        moveOutInitiated: true,
      }),
    ).toBe("rentvine_closed");
  });

  it("R-S246-5: a later RentVine lease end asks for a decision and never completes by itself", () => {
    const renewed = recorded("2026-12-31", "2027-12-31");
    const open = { complete: false, nonRenewal: false };
    const asking = projectRenewalTarget({
      ...base,
      endDateIso: "2027-12-31",
      staffRecord: open,
      cycleSourceDate: renewed,
    });
    expect(asking).toMatchObject({
      kind: "not_target",
      reason: "renewed_in_rentvine",
      recordedDateIso: "2026-12-31",
      sourceDateIso: "2027-12-31",
    });
    // Keep working: the lease stays a target of the cycle staff recorded.
    expect(
      projectRenewalTarget({
        ...base,
        endDateIso: "2027-12-31",
        staffRecord: open,
        cycleSourceDate: renewed,
        keepWorking: true,
      }),
    ).toEqual({
      kind: "target",
      cycleDateIso: "2026-12-31",
      cycleMonth: "2026-12",
      statusUnavailable: false,
      keptWorking: true,
      statusName: "Active",
    });
    // Recorded completion closes that cycle; the lease is then dated by its new lease end.
    expect(
      projectRenewalTarget({
        ...base,
        endDateIso: "2027-12-31",
        staffRecord: { complete: true, nonRenewal: false },
        cycleSourceDate: renewed,
      }),
    ).toMatchObject({ kind: "target", cycleMonth: "2027-12", keptWorking: false });
    // An earlier RentVine date is not a renewal; the lease follows the date RentVine reports.
    expect(
      projectRenewalTarget({
        ...base,
        endDateIso: "2026-11-30",
        staffRecord: open,
        cycleSourceDate: recorded("2026-12-31", "2026-11-30"),
      }),
    ).toMatchObject({ kind: "target", cycleMonth: "2026-11" });
  });

  it("a record from an earlier cycle never settles the cycle RentVine reports now", () => {
    // A non-renewal handoff completed on the cycle staff recorded, after which RentVine reports a
    // later lease end on the same lease: the new cycle is a renewal target for its own month.
    expect(
      projectRenewalTarget({
        ...base,
        endDateIso: "2027-12-31",
        staffRecord: { complete: true, nonRenewal: true },
        cycleSourceDate: recorded("2026-12-31", "2027-12-31"),
      }),
    ).toEqual({
      kind: "target",
      cycleDateIso: "2027-12-31",
      cycleMonth: "2027-12",
      statusUnavailable: false,
      keptWorking: false,
      statusName: "Active",
    });
    // The same holds for a non-renewal handoff completed for an earlier periodic review.
    const reviewCycle = projectCycleSourceDateChange(
      {
        kind: "review_date",
        dateIso: "2025-12-10",
        source: "Month-to-month annual review date",
      },
      null,
    );
    expect(
      projectRenewalTarget({
        ...base,
        term: "month_to_month",
        endDateIso: null,
        staffRecord: { complete: true, nonRenewal: true },
        cycleSourceDate: reviewCycle,
        reviewDateIso: "2026-12-10",
      }),
    ).toMatchObject({ kind: "not_target", reason: "month_to_month" });
    // An open non-renewal decision is still a handoff to finish; once it is completed the lease
    // follows the cycle RentVine reports, as above.
    expect(
      projectRenewalTarget({
        ...base,
        endDateIso: "2027-12-31",
        staffRecord: { complete: false, nonRenewal: true },
        cycleSourceDate: recorded("2026-12-31", "2027-12-31"),
      }),
    ).toMatchObject({ kind: "not_target", reason: "staff_non_renewal" });
  });

  it("an earlier RentVine lease end keeps a completion recorded for the same cycle", () => {
    const earlier = recorded("2026-12-31", "2026-11-30");
    const renewal = projectRenewalTarget({
      ...base,
      endDateIso: "2026-11-30",
      staffRecord: { complete: true, nonRenewal: false },
      cycleSourceDate: earlier,
    });
    expect(renewal).toMatchObject({
      kind: "not_target",
      reason: "completed",
      label: "Renewal completed, recorded by staff",
    });
    // The completed lease stays under Completed; it never comes back as carried over.
    expect(
      renewalBatchGroupFor(
        renewalBatchPlacement({
          renewalTarget: renewal,
          endDateIso: "2026-11-30",
          retention: { state: "window" },
        }),
        "2026-12",
      ),
    ).toBe("completed");
    expect(
      projectRenewalTarget({
        ...base,
        endDateIso: "2026-11-30",
        staffRecord: { complete: true, nonRenewal: true },
        cycleSourceDate: earlier,
      }),
    ).toMatchObject({
      reason: "completed",
      label: "Non-renewal handoff completed, recorded by staff",
    });
  });

  it("R-S246-12: an unavailable status keeps the lease a target and marks it", () => {
    expect(
      projectRenewalTarget({
        ...base,
        status: { state: "unavailable", cause: "status_table_unavailable", name: null },
      }),
    ).toMatchObject({ kind: "target", statusUnavailable: true });
  });

  it("a completion recorded for an earlier month-to-month review does not cover the review due now", () => {
    const reviewCycle = (dateIso: string) =>
      projectCycleSourceDateChange(
        { kind: "review_date", dateIso, source: "Month-to-month annual review date" },
        null,
      );
    const monthToMonth: RenewalTargetInput = {
      ...base,
      term: "month_to_month",
      endDateIso: null,
      staffRecord: { complete: true, nonRenewal: false },
    };
    expect(
      projectRenewalTarget({
        ...monthToMonth,
        cycleSourceDate: reviewCycle("2026-12-10"),
        reviewDateIso: "2026-12-10",
      }),
    ).toMatchObject({ reason: "completed" });
    expect(
      projectRenewalTarget({
        ...monthToMonth,
        cycleSourceDate: reviewCycle("2025-12-10"),
        reviewDateIso: "2026-12-10",
      }),
    ).toMatchObject({ reason: "month_to_month" });
  });

  it("each lease page line reads with at most one colon, whatever the reason", () => {
    const inputs: Partial<RenewalTargetInput>[] = [
      {},
      { status: { state: "closed", name: "Closed" } },
      { status: { state: "pending", name: "Future" } },
      { skipReason: "owner_authorized" },
      { skipReason: "program" },
      { moveOutInitiated: true },
      { staffRecord: { complete: false, nonRenewal: true } },
      { staffRecord: { complete: true, nonRenewal: true } },
      { staffRecord: { complete: true, nonRenewal: false } },
      { appCompletionCurrent: true },
      { term: "month_to_month", endDateIso: null },
      { endDateIso: null },
      {
        endDateIso: "2027-12-31",
        staffRecord: { complete: false, nonRenewal: false },
        cycleSourceDate: recorded("2026-12-31", "2027-12-31"),
      },
    ];
    for (const input of inputs) {
      const line = renewalTargetLine(projectRenewalTarget({ ...base, ...input }));
      expect(line.split(":").length - 1, line).toBeLessThanOrEqual(1);
    }
  });

  it("says the same verdict in one line for the lease page", () => {
    expect(renewalTargetLine(projectRenewalTarget(base))).toBe(
      "Renewal target for December 2026",
    );
    expect(
      renewalTargetLine(
        projectRenewalTarget({
          ...base,
          status: { state: "unavailable", cause: "status_unresolved", name: null },
        }),
      ),
    ).toBe("Renewal target for December 2026 · RentVine status unavailable");
    expect(
      renewalTargetLine(
        projectRenewalTarget({ ...base, status: { state: "closed", name: "Closed" } }),
      ),
    ).toBe("Outside the monthly renewal batch: RentVine reports Closed");
    expect(
      renewalTargetLine(projectRenewalTarget({ ...base, term: "month_to_month" })),
    ).toBe("Month-to-month: follows the annual review");
    expect(
      renewalTargetLine(
        projectRenewalTarget({
          ...base,
          endDateIso: "2027-12-31",
          staffRecord: { complete: false, nonRenewal: false },
          cycleSourceDate: recorded("2026-12-31", "2027-12-31"),
        }),
      ),
    ).toBe(
      "Renewed in RentVine, confirm and close: Cycle recorded 12/31/2026; RentVine now reports 12/31/2027",
    );
  });
});
