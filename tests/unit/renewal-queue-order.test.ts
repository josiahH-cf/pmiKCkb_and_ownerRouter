import { describe, expect, it } from "vitest";

import { buildRenewalAttention } from "@/lib/lease-renewal/attention";
import {
  compareLeaseEndDate,
  type DeskLeaseSummary,
} from "@/lib/lease-renewal/desk-model";

// S70 — renewal queue integrity. Before this slice there was NO sort anywhere in the queue path
// (zero sort/localeCompare in RenewalDesk.tsx, live-desk.ts, cohort.ts), so the queue inherited
// RentVine export row order while the attention fold directly above it DID sort by end date.
//
// All fixtures are synthetic.

function lease(overrides: Partial<DeskLeaseSummary> = {}): DeskLeaseSummary {
  return {
    id: "lease-1",
    addressLabel: "1 Sample St",
    tenantNameLabel: "Resident",
    endDateIso: "2026-09-01",
    disposition: "actionable",
    reason: "in_window",
    reasonLabel: "In the renewal window",
    stageIndex: 0,
    stageLabel: "Data check",
    nextAction: "Review the data check",
    openConflicts: 0,
    ...overrides,
  } as DeskLeaseSummary;
}

describe("AC-S70-1 — one ordering, soonest lease end first", () => {
  it("sorts deliberately shuffled rows into non-decreasing end-date order", () => {
    const shuffled = [
      lease({ id: "c", endDateIso: "2026-12-01" }),
      lease({ id: "a", endDateIso: "2026-09-01" }),
      lease({ id: "d", endDateIso: "2027-01-15" }),
      lease({ id: "b", endDateIso: "2026-10-05" }),
    ];

    const ordered = [...shuffled].sort(compareLeaseEndDate).map((l) => l.id);
    expect(ordered).toEqual(["a", "b", "c", "d"]);
  });

  it("sorts a lease with no end date last rather than first", () => {
    const rows = [
      lease({ id: "none", endDateIso: null }),
      lease({ id: "soon", endDateIso: "2026-09-01" }),
    ];
    expect([...rows].sort(compareLeaseEndDate).map((l) => l.id)).toEqual([
      "soon",
      "none",
    ]);
  });

  it("breaks ties on the stable id so the order does not shuffle between reloads", () => {
    const rows = [
      lease({ id: "zulu", endDateIso: "2026-09-01" }),
      lease({ id: "alpha", endDateIso: "2026-09-01" }),
      lease({ id: "mike", endDateIso: "2026-09-01" }),
    ];
    const first = [...rows].sort(compareLeaseEndDate).map((l) => l.id);
    const second = [...rows]
      .reverse()
      .sort(compareLeaseEndDate)
      .map((l) => l.id);
    expect(first).toEqual(["alpha", "mike", "zulu"]);
    expect(second).toEqual(first);
  });

  it("is a total order: comparing a row with itself is zero", () => {
    const only = lease({ id: "x", endDateIso: "2026-09-01" });
    expect(compareLeaseEndDate(only, only)).toBe(0);
    expect(
      compareLeaseEndDate(lease({ endDateIso: null }), lease({ endDateIso: null })),
    ).toBe(0);
  });
});

describe("AC-S70-2 — the fold and the queue share one comparator", () => {
  // The fold is a FILTERED subset and sorts by urgency band FIRST, so the two lists do not render
  // identical sequences in general. What must hold is that within one urgency band, the fold orders
  // by the same end-date rule the queue uses -- so the two can never disagree about which of two
  // comparable leases is more urgent by date.
  it("orders same-urgency fold entries by the same end-date rule as the queue", () => {
    const rows = [
      lease({
        id: "later",
        addressLabel: "2 Sample St",
        endDateIso: "2026-12-01",
        openConflicts: 1,
      }),
      lease({
        id: "sooner",
        addressLabel: "1 Sample St",
        endDateIso: "2026-09-01",
        openConflicts: 1,
      }),
    ];

    const fold = buildRenewalAttention(rows, (id) => `/lease/${id}`);
    const queue = [...rows].sort(compareLeaseEndDate).map((l) => l.addressLabel);

    expect(fold.map((item) => item.addressLabel)).toEqual(queue);
  });

  it("still sorts the fold by urgency band before date", () => {
    // A conflicted lease due later outranks a clean lease due sooner in the FOLD -- deliberate, and
    // the reason the fold is a triage list rather than a second copy of the queue.
    const rows = [
      lease({
        id: "clean-soon",
        addressLabel: "1 Sample St",
        endDateIso: "2026-09-01",
        openConflicts: 0,
        stageIndex: 1,
      }),
      lease({
        id: "conflict-late",
        addressLabel: "2 Sample St",
        endDateIso: "2026-12-01",
        openConflicts: 3,
        stageIndex: 1,
      }),
    ];
    const fold = buildRenewalAttention(rows, (id) => `/lease/${id}`);
    expect(fold[0]?.addressLabel).toBe("2 Sample St");
  });
});
