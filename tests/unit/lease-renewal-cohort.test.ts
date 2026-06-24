import { describe, expect, it } from "vitest";
import {
  classifyRenewalCohort,
  isMonthEnd,
  selectActionableLeases,
  toCohortIsoDate,
  type DateWindow,
} from "@/lib/lease-renewal/cohort";
import type { RawLease } from "@/lib/integrations/rentvine/client";

// Aug/Sep "end of month" batch — what Dan filters for in Rentvine.
const AUG_SEP: DateWindow[] = [{ startIso: "2026-08-01", endIso: "2026-09-30" }];

describe("toCohortIsoDate", () => {
  it("accepts ISO and US month-first dates, rejects junk", () => {
    expect(toCohortIsoDate("2026-08-31")).toBe("2026-08-31");
    expect(toCohortIsoDate("8/31/2026")).toBe("2026-08-31");
    expect(toCohortIsoDate("9/1/26")).toBe("2026-09-01");
    expect(toCohortIsoDate("")).toBeNull();
    expect(toCohortIsoDate(null)).toBeNull();
    expect(toCohortIsoDate("month-to-month")).toBeNull();
  });
});

describe("isMonthEnd", () => {
  it("recognizes the last calendar day of the month", () => {
    expect(isMonthEnd("2026-08-31")).toBe(true);
    expect(isMonthEnd("2026-09-30")).toBe(true);
    expect(isMonthEnd("2026-02-28")).toBe(true); // non-leap February
    expect(isMonthEnd("2026-10-10")).toBe(false);
    expect(isMonthEnd("2026-09-29")).toBe(false);
  });
});

describe("classifyRenewalCohort", () => {
  const leases: RawLease[] = [
    { leaseID: 1, endDate: "2026-08-31" }, // actionable
    { leaseID: 2, endDate: "2026-08-31", isMonthToMonth: true }, // skip: m2m (truthy)
    { leaseID: 3, endDate: "2026-09-30", leaseType: "Month to Month" }, // skip: m2m (type)
    { leaseID: 4, endDate: "2026-09-30", note: "Owner authorized to let it renew" }, // skip: owner
    { leaseID: 5, endDate: "2026-08-31", program: "PadSplit" }, // skip: program
    { leaseID: 6 }, // review: no end date
    { leaseID: 7, endDate: "2026-12-31" }, // out of window
  ];

  const cohort = classifyRenewalCohort(leases, { windows: AUG_SEP });

  it("classifies 1:1 with input order", () => {
    expect(cohort.classifications).toHaveLength(leases.length);
    expect(cohort.classifications.map((c) => c.disposition)).toEqual([
      "actionable",
      "skip",
      "skip",
      "skip",
      "skip",
      "review",
      "out_of_window",
    ]);
  });

  it("attaches the right reasons", () => {
    const byId = new Map(cohort.classifications.map((c) => [c.leaseId, c]));
    expect(byId.get("1")?.reason).toBe("actionable");
    expect(byId.get("2")?.reason).toBe("month_to_month");
    expect(byId.get("3")?.reason).toBe("month_to_month");
    expect(byId.get("4")?.reason).toBe("owner_authorized");
    expect(byId.get("5")?.reason).toBe("program");
    expect(byId.get("6")?.reason).toBe("no_end_date");
    expect(byId.get("7")?.reason).toBe("out_of_window");
  });

  it("summarizes the buckets", () => {
    expect(cohort.summary).toMatchObject({
      total: 7,
      actionable: 1,
      skipped: 4, // m2m + m2m + owner + program
      needsReview: 1,
      outOfWindow: 1,
    });
    expect(cohort.skipped).toHaveLength(4);
    expect(cohort.summary.skipped).toBe(4);
    expect(cohort.summary.byReason.month_to_month).toBe(2);
  });

  it("only the standard month-end fixed lease is actionable", () => {
    expect(cohort.actionable.map((c) => c.leaseId)).toEqual(["1"]);
  });
});

describe("off-cycle dates surface for review (never silently bucketed)", () => {
  it("flags a mid-month end date inside the window as off_cycle_date", () => {
    const leases: RawLease[] = [
      { leaseID: 10, endDate: "2026-10-10" }, // the date Dan says he has missed before
      { leaseID: 11, endDate: "2026-10-31" }, // month-end -> actionable
    ];
    const cohort = classifyRenewalCohort(leases, {
      windows: [{ startIso: "2026-10-01", endIso: "2026-10-31" }],
    });
    const byId = new Map(cohort.classifications.map((c) => [c.leaseId, c]));
    expect(byId.get("10")?.disposition).toBe("review");
    expect(byId.get("10")?.reason).toBe("off_cycle_date");
    expect(byId.get("11")?.disposition).toBe("actionable");
  });
});

describe("skip signals take precedence over the date checks", () => {
  it("skips a month-to-month lease even when its end date is out of the window", () => {
    const leases: RawLease[] = [
      { leaseID: 20, endDate: "2026-12-31", isMonthToMonth: true },
    ];
    const cohort = classifyRenewalCohort(leases, { windows: AUG_SEP });
    expect(cohort.classifications[0].disposition).toBe("skip");
    expect(cohort.classifications[0].reason).toBe("month_to_month");
  });

  it("skips a program lease even when it has no resolvable end date", () => {
    const leases: RawLease[] = [{ leaseID: 21, program: "PadSplit" }];
    const cohort = classifyRenewalCohort(leases, { windows: AUG_SEP });
    expect(cohort.classifications[0].disposition).toBe("skip");
    expect(cohort.classifications[0].reason).toBe("program");
  });
});

describe("selectActionableLeases", () => {
  it("keeps only actionable leases, preserving order", () => {
    const leases: RawLease[] = [
      { leaseID: 1, endDate: "2026-08-31" },
      { leaseID: 2, endDate: "2026-08-31", isMonthToMonth: true },
      { leaseID: 3, endDate: "2026-09-30" },
    ];
    const cohort = classifyRenewalCohort(leases, { windows: AUG_SEP });
    const selected = selectActionableLeases(leases, cohort);
    expect(selected.map((l) => l.leaseID)).toEqual([1, 3]);
  });

  it("is deterministic for the same input + windows", () => {
    const leases: RawLease[] = [{ leaseID: 1, endDate: "2026-08-31" }];
    const a = classifyRenewalCohort(leases, { windows: AUG_SEP });
    const b = classifyRenewalCohort(leases, { windows: AUG_SEP });
    expect(a).toEqual(b);
  });
});
