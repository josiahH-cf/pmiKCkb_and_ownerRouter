import { describe, expect, it } from "vitest";

import type { RawLease } from "@/lib/integrations/rentvine/client";
import {
  applyLeaseDetailToView,
  leaseViewsFromExport,
  markLeaseDetailUnavailable,
} from "@/lib/integrations/rentvine/lease-mapper";
import {
  addLeaseTermMonths,
  humanizeLeaseTerm,
  leaseTermSourceFingerprint,
  nextLeaseTermReviewIso,
  projectLeaseTerm,
  type LeaseTermReviewFact,
} from "@/lib/lease-renewal/lease-term";
import { classifyRenewalCohort, type DateWindow } from "@/lib/lease-renewal/cohort";

// S103: the lease term is a provider fact (S102's lease detail), never inferred from the dates. All
// values are synthetic; the key names mirror the 2026-09-03 bodyless RentVine discovery.

const TODAY = "2026-08-01";
const AUG_SEP: DateWindow[] = [{ startIso: "2026-08-01", endIso: "2026-09-30" }];

function exportView(
  lease: Record<string, unknown>,
  detail: Record<string, unknown> | "unavailable" | "absent" = {},
): RawLease {
  const [view] = leaseViewsFromExport([
    { lease: { leaseID: 41, ...lease }, unit: { rent: "1000.00" } },
  ]);
  if (detail === "absent") return view;
  if (detail === "unavailable") {
    markLeaseDetailUnavailable(view);
    return view;
  }
  applyLeaseDetailToView(view, {
    leaseID: "41",
    baseRentAmount: 1050,
    rentAmount: 1050,
    isMonthToMonth: "0",
    monthToMonthStartDate: null,
    hasPendingMonthToMonthConversion: false,
    ...detail,
  });
  return view;
}

function review(view: RawLease, fact: Partial<LeaseTermReviewFact>): LeaseTermReviewFact {
  return {
    leaseId: "41",
    term: "fixed_term",
    anchorDateIso: null,
    sourceFingerprint: leaseTermSourceFingerprint(view),
    ...fact,
  };
}

describe("addLeaseTermMonths / nextLeaseTermReviewIso", () => {
  it("adds whole months and clamps to the last day of the target month", () => {
    expect(addLeaseTermMonths("2025-09-15", 12)).toBe("2026-09-15");
    expect(addLeaseTermMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(addLeaseTermMonths("2025-12-31", 12)).toBe("2026-12-31");
    expect(addLeaseTermMonths("not-a-date", 12)).toBeNull();
  });

  it("derives the annual review from an anchor and stays null without one", () => {
    expect(nextLeaseTermReviewIso("2025-09-15")).toBe("2026-09-15");
    expect(nextLeaseTermReviewIso(null)).toBeNull();
  });
});

describe("projectLeaseTerm — provider evidence decides the term (ARCH-S103-1)", () => {
  it("reads an exact month-to-month signal, with the provider start date as the anchor", () => {
    const view = exportView(
      { endDate: "2026-08-31" },
      { isMonthToMonth: "1", monthToMonthStartDate: "2025-09-15" },
    );
    expect(projectLeaseTerm(view, null, { referenceDateIso: TODAY })).toMatchObject({
      term: "month_to_month",
      reason: "provider_month_to_month",
      evidence: "provider_detail",
      anchorDateIso: "2025-09-15",
      anchorSource: "provider_month_to_month_start",
      nextReviewIso: "2026-09-15",
      reviewState: "scheduled",
    });
  });

  it("reads an exact fixed-term signal with a current end date", () => {
    const view = exportView({ startDate: "2025-09-01", endDate: "2026-08-31" });
    expect(projectLeaseTerm(view, null, { referenceDateIso: TODAY })).toMatchObject({
      term: "fixed_term",
      reason: "provider_fixed_term",
      startDateIso: "2025-09-01",
      endDateIso: "2026-08-31",
      anchorDateIso: null,
      nextReviewIso: null,
      reviewState: "not_applicable",
    });
  });

  it("routes an expired end date to needs_review instead of a silent fixed term", () => {
    const view = exportView({ endDate: "2026-06-30" });
    expect(projectLeaseTerm(view, null, { referenceDateIso: TODAY })).toMatchObject({
      term: "needs_review",
      reason: "expired_end_date",
    });
  });

  it("routes a missing end date, a pending conversion, and a contradicted signal to needs_review", () => {
    expect(
      projectLeaseTerm(exportView({}), null, { referenceDateIso: TODAY }),
    ).toMatchObject({ term: "needs_review", reason: "missing_end_date" });
    expect(
      projectLeaseTerm(
        exportView({ endDate: "2026-08-31" }, { hasPendingMonthToMonthConversion: true }),
        null,
        { referenceDateIso: TODAY },
      ),
    ).toMatchObject({
      term: "needs_review",
      reason: "pending_month_to_month_conversion",
    });
    expect(
      projectLeaseTerm(
        exportView({ endDate: "2026-08-31" }, { monthToMonthStartDate: "2025-09-15" }),
        null,
        { referenceDateIso: TODAY },
      ),
    ).toMatchObject({ term: "needs_review", reason: "signal_contradicts_dates" });
  });

  it("keeps an unreadable lease detail at needs_review", () => {
    expect(
      projectLeaseTerm(exportView({ endDate: "2026-08-31" }, "unavailable"), null, {
        referenceDateIso: TODAY,
      }),
    ).toMatchObject({ term: "needs_review", reason: "detail_unavailable" });
  });

  it("falls back to the export's own signal while the exact signal is unreadable", () => {
    // Losing the detail read must never let a lease that describes itself as month-to-month
    // re-enter the monthly cohort.
    expect(
      projectLeaseTerm(
        exportView({ endDate: "2026-08-31", leaseType: "Month to Month" }, "unavailable"),
        null,
        { referenceDateIso: TODAY },
      ),
    ).toMatchObject({
      term: "month_to_month",
      reason: "legacy_month_to_month",
      evidence: "legacy_signal",
    });
  });

  it("uses the legacy heuristic only for a flat fixture that never received a detail", () => {
    const flat: RawLease = {
      leaseID: 9,
      endDate: "2026-08-31",
      leaseType: "Month to Month",
    };
    expect(projectLeaseTerm(flat, null, { referenceDateIso: TODAY })).toMatchObject({
      term: "month_to_month",
      evidence: "legacy_signal",
    });
    // The same heuristic key on an enriched view never overrides the exact provider signal.
    const enriched = exportView({ endDate: "2026-08-31", leaseType: "Month to Month" });
    expect(projectLeaseTerm(enriched, null, { referenceDateIso: TODAY }).term).toBe(
      "fixed_term",
    );
  });
});

describe("projectLeaseTerm — recorded term review (ARCH-S103-2)", () => {
  it("lets a current review resolve an unclear lease and supply the anchor", () => {
    const view = exportView({ endDate: "2026-08-31" }, "unavailable");
    const recorded = review(view, {
      term: "month_to_month",
      anchorDateIso: "2025-09-15",
    });
    expect(projectLeaseTerm(view, recorded, { referenceDateIso: TODAY })).toMatchObject({
      term: "month_to_month",
      reason: "recorded_month_to_month",
      evidence: "recorded_review",
      anchorDateIso: "2025-09-15",
      anchorSource: "recorded_review",
      nextReviewIso: "2026-09-15",
      recordedReviewStale: false,
    });
    expect(
      projectLeaseTerm(view, review(view, { term: "fixed_term" }), {
        referenceDateIso: TODAY,
      }),
    ).toMatchObject({ term: "fixed_term", reason: "recorded_fixed_term" });
  });

  it("marks a drifted review stale and returns to needs_review", () => {
    const seen = exportView({ endDate: "2026-08-31" }, "unavailable");
    const recorded = review(seen, {
      term: "month_to_month",
      anchorDateIso: "2025-09-15",
    });
    const changed = exportView({ endDate: "2026-10-31" }, "unavailable");
    expect(
      projectLeaseTerm(changed, recorded, { referenceDateIso: TODAY }),
    ).toMatchObject({
      term: "needs_review",
      reason: "detail_unavailable",
      recordedReviewStale: true,
      anchorDateIso: null,
    });
  });

  it("never lets a recorded fixed term override an exact provider month-to-month signal (AC-S103-2)", () => {
    const view = exportView({ endDate: "2026-08-31" }, { isMonthToMonth: "1" });
    const recorded = review(view, { term: "fixed_term" });
    expect(projectLeaseTerm(view, recorded, { referenceDateIso: TODAY })).toMatchObject({
      term: "month_to_month",
      reason: "provider_month_to_month",
    });
  });

  it("changes the fingerprint when a term-bearing fact changes and not when rent changes", () => {
    const base = exportView({ endDate: "2026-08-31" });
    const sameTermFacts = exportView({ endDate: "2026-08-31" }, { baseRentAmount: 2000 });
    const differentSignal = exportView(
      { endDate: "2026-08-31" },
      { isMonthToMonth: "1" },
    );
    expect(leaseTermSourceFingerprint(sameTermFacts)).toBe(
      leaseTermSourceFingerprint(base),
    );
    expect(leaseTermSourceFingerprint(differentSignal)).not.toBe(
      leaseTermSourceFingerprint(base),
    );
    expect(leaseTermSourceFingerprint(base)).toMatch(/^ltf1_[a-f0-9]{64}$/);
  });
});

describe("classifyRenewalCohort — periodic review disposition (BEH-S103-1)", () => {
  const monthToMonth = exportView(
    { leaseID: 7003, endDate: "2026-08-31" },
    { isMonthToMonth: "1", monthToMonthStartDate: "2025-09-15" },
  );
  const fixed = exportView({ leaseID: 4821, endDate: "2026-08-31" });

  it("keeps a month-end fixed-term lease actionable and moves month-to-month to periodic_review", () => {
    const cohort = classifyRenewalCohort([fixed, monthToMonth], {
      windows: AUG_SEP,
      referenceDateIso: TODAY,
    });
    expect(cohort.classifications.map((c) => c.disposition)).toEqual([
      "actionable",
      "periodic_review",
    ]);
    expect(cohort.classifications[0].term).toBe("fixed_term");
    expect(cohort.classifications[1].term).toBe("month_to_month");
    expect(cohort.classifications[1].reason).toBe("month_to_month");
    expect(cohort.periodicReview).toHaveLength(1);
    expect(cohort.skipped).toHaveLength(0);
    expect(cohort.summary.periodicReview).toBe(1);
  });

  it("keeps the month-to-month lease out of the monthly cohort in two consecutive months", () => {
    for (const window of [
      { startIso: "2026-08-01", endIso: "2026-08-31" },
      { startIso: "2026-09-01", endIso: "2026-09-30" },
    ]) {
      const cohort = classifyRenewalCohort([monthToMonth], {
        windows: [window],
        referenceDateIso: TODAY,
      });
      expect(cohort.actionable).toHaveLength(0);
      expect(cohort.classifications[0].disposition).toBe("periodic_review");
    }
  });

  it("keeps the owner-authorized and program skip reasons unchanged", () => {
    const cohort = classifyRenewalCohort(
      [
        { leaseID: 1, endDate: "2026-09-30", note: "Owner authorized to let it renew" },
        { leaseID: 2, endDate: "2026-08-31", program: "PadSplit" },
      ],
      { windows: AUG_SEP, referenceDateIso: TODAY },
    );
    expect(cohort.classifications.map((c) => c.reason)).toEqual([
      "owner_authorized",
      "program",
    ]);
    expect(cohort.skipped).toHaveLength(2);
    expect(cohort.periodicReview).toHaveLength(0);
  });

  it("routes a provider-reported unclear term to review instead of the monthly cohort", () => {
    const pending = exportView(
      { leaseID: 5001, endDate: "2026-08-31" },
      { hasPendingMonthToMonthConversion: true },
    );
    const contradicted = exportView(
      { leaseID: 5002, endDate: "2026-08-31" },
      { monthToMonthStartDate: "2025-09-15" },
    );
    const cohort = classifyRenewalCohort([pending, contradicted], {
      windows: AUG_SEP,
      referenceDateIso: TODAY,
    });
    expect(cohort.actionable).toHaveLength(0);
    expect(cohort.classifications.map((c) => [c.disposition, c.reason])).toEqual([
      ["review", "term_needs_review"],
      ["review", "term_needs_review"],
    ]);
  });

  it("leaves an unreadable detail in its date-driven place rather than emptying the worklist", () => {
    const unreadable = exportView(
      { leaseID: 5003, endDate: "2026-08-31" },
      "unavailable",
    );
    const cohort = classifyRenewalCohort([unreadable], {
      windows: AUG_SEP,
      referenceDateIso: TODAY,
    });
    expect(cohort.classifications[0]).toMatchObject({
      disposition: "actionable",
      term: "needs_review",
    });
  });

  it("carries the term projection so a caller never reclassifies from dates", () => {
    const cohort = classifyRenewalCohort([monthToMonth], {
      windows: AUG_SEP,
      referenceDateIso: TODAY,
    });
    expect(cohort.classifications[0].termProjection).toMatchObject({
      term: "month_to_month",
      nextReviewIso: "2026-09-15",
      reviewState: "scheduled",
    });
  });
});

describe("humanizeLeaseTerm", () => {
  it("labels each term for the desk and workspace", () => {
    expect(humanizeLeaseTerm("fixed_term")).toBe("Fixed-term");
    expect(humanizeLeaseTerm("month_to_month")).toBe("Month-to-month");
    expect(humanizeLeaseTerm("needs_review")).toBe("Needs review");
  });
});
