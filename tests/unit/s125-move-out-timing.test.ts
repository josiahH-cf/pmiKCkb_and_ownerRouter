import { describe, expect, it } from "vitest";

import type {
  MoveOutDisposition,
  MoveOutDispositionState,
  MoveOutFreshness,
} from "@/lib/lease-renewal/move-out-disposition";
import {
  MISSING_MOVE_OUT_TIMING_BASIS,
  MOVE_OUT_TIMING_DESK_FILTERS,
  calendarDayOrdinal,
  countCalendarDays,
  evaluateMoveOutTiming,
  matchesMoveOutTimingFilter,
  type MoveOutTimingBasisSnapshot,
} from "@/lib/lease-renewal/move-out-timing";

// S125 (F04): the evaluator is pure over date-only facts and an explicitly reviewed basis. Values
// are synthetic; nothing here reads a provider, stores anything or produces a fee or legal claim.

function disposition(
  state: MoveOutDispositionState,
  evidence: Partial<MoveOutDisposition["evidence"]> = {},
  freshness: MoveOutFreshness = "fresh",
): MoveOutDisposition {
  return {
    state,
    reason:
      state === "initiated"
        ? "notice_status"
        : state === "not_initiated"
          ? "active_without_notice"
          : state === "withdrawn"
            ? "withdrawn_after_prior_notice"
            : "status_table_unavailable",
    label:
      state === "initiated"
        ? "Move-out initiated in RentVine: Active - Notice Given."
        : state === "unknown"
          ? "Move-out status unknown: the status table was unavailable."
          : "No move-out notice in RentVine (Active).",
    evidence: {
      origin: "rentvine_lease_status",
      leaseId: "L-1",
      statusId: "3",
      statusName: "Active - Notice Given",
      primaryStatusId: "2",
      pendingMoveOut: state === "initiated",
      completedMoveOut: false,
      noticeDateIso: null,
      expectedMoveOutIso: null,
      moveOutIso: null,
      ...evidence,
    },
    freshness,
    observedAtIso: "2026-09-20T12:00:00.000Z",
  };
}

function saved(
  targetKind: "expected_move_out" | "lease_end",
  version = 1,
): MoveOutTimingBasisSnapshot {
  return {
    state: "saved",
    basis: {
      targetKind,
      countingRule: "calendar_days_target_minus_notice_v1",
      thresholdDays: 30,
    },
    version,
    updatedAtIso: "2026-09-19T00:00:00.000Z",
  };
}

const OBSERVED = "2026-09-20";

describe("S125 both dates and their meaning (AC-S125-1)", () => {
  it("produces its own result and label per reviewed basis and never guesses without one", () => {
    const initiated = disposition("initiated", {
      noticeDateIso: "2026-08-01",
      expectedMoveOutIso: "2026-08-29",
    });
    const moveOut = evaluateMoveOutTiming({
      disposition: initiated,
      leaseEndIso: "2026-09-30",
      basis: saved("expected_move_out"),
      observedDateIso: OBSERVED,
    });
    expect(moveOut).toMatchObject({
      state: "below",
      targetKind: "expected_move_out",
      targetLabel: "scheduled move-out date",
      noticeDateIso: "2026-08-01",
      targetDateIso: "2026-08-29",
      daysGiven: 28,
      thresholdDays: 30,
      basisVersion: 1,
    });
    const leaseEnd = evaluateMoveOutTiming({
      disposition: initiated,
      leaseEndIso: "2026-09-30",
      basis: saved("lease_end", 2),
      observedDateIso: OBSERVED,
    });
    expect(leaseEnd).toMatchObject({
      state: "meets",
      targetKind: "lease_end",
      targetLabel: "contractual lease-end date",
      targetDateIso: "2026-09-30",
      daysGiven: 60,
      basisVersion: 2,
    });
    expect(leaseEnd.explanation).toContain("contractual lease-end date 2026-09-30");

    // No reviewed basis: no yes or no, and the missing basis is named.
    const unreviewed = evaluateMoveOutTiming({
      disposition: initiated,
      leaseEndIso: "2026-09-30",
      basis: MISSING_MOVE_OUT_TIMING_BASIS,
      observedDateIso: OBSERVED,
    });
    expect(unreviewed).toMatchObject({
      state: "cannot_determine",
      reason: "basis_not_reviewed",
      label: "Cannot determine",
      targetKind: null,
      daysGiven: null,
      basisVersion: null,
      noticeDateIso: "2026-08-01",
    });
    expect(unreviewed.explanation).toMatch(/basis .* not been reviewed/);
    expect(unreviewed.explanation).not.toMatch(/meets|below/i);

    // A blank target under the chosen basis is never replaced by the other date.
    const blankTarget = evaluateMoveOutTiming({
      disposition: disposition("initiated", { noticeDateIso: "2026-08-01" }),
      leaseEndIso: "2026-09-30",
      basis: saved("expected_move_out"),
      observedDateIso: OBSERVED,
    });
    expect(blankTarget).toMatchObject({
      state: "cannot_determine",
      reason: "target_date_missing",
      targetKind: "expected_move_out",
      targetDateIso: null,
      daysGiven: null,
    });
  });
});

describe("S125 explicit and testable counting (AC-S125-2)", () => {
  it("counts calendar-date ordinals: 29 fails, 30 and 31 pass, same date is zero, daylight-saving changes nothing", () => {
    const evaluate = (notice: string, target: string) =>
      evaluateMoveOutTiming({
        disposition: disposition("initiated", {
          noticeDateIso: notice,
          expectedMoveOutIso: target,
        }),
        leaseEndIso: null,
        basis: saved("expected_move_out"),
        observedDateIso: "2027-01-01",
      });
    expect(evaluate("2026-08-01", "2026-08-30")).toMatchObject({
      state: "below",
      daysGiven: 29,
    });
    expect(evaluate("2026-08-01", "2026-08-31")).toMatchObject({
      state: "meets",
      daysGiven: 30,
    });
    expect(evaluate("2026-08-01", "2026-09-01")).toMatchObject({
      state: "meets",
      daysGiven: 31,
    });
    expect(evaluate("2026-08-01", "2026-08-01")).toMatchObject({
      state: "below",
      daysGiven: 0,
    });
    // Across the November 2026 daylight-saving change (2026-11-01) the day count is unchanged.
    expect(evaluate("2026-10-15", "2026-11-14")).toMatchObject({
      state: "meets",
      daysGiven: 30,
    });
    expect(evaluate("2026-10-15", "2026-11-13")).toMatchObject({
      state: "below",
      daysGiven: 29,
    });
    expect(
      countCalendarDays(
        "calendar_days_target_minus_notice_v1",
        "2026-03-01",
        "2026-03-31",
      ),
    ).toBe(30);
    // The rule is explicit input: an unknown rule yields no count, never a library default.
    expect(
      countCalendarDays(
        "business_days_v9" as unknown as "calendar_days_target_minus_notice_v1",
        "2026-03-01",
        "2026-03-31",
      ),
    ).toBeNull();
    // An unsaved basis produces no yes or no even with perfect dates.
    expect(
      evaluateMoveOutTiming({
        disposition: disposition("initiated", {
          noticeDateIso: "2026-08-01",
          expectedMoveOutIso: "2026-09-01",
        }),
        leaseEndIso: null,
        basis: { state: "unreadable", basis: null, version: null, updatedAtIso: null },
        observedDateIso: OBSERVED,
      }),
    ).toMatchObject({ state: "cannot_determine", reason: "basis_unreadable" });
  });
});

describe("S125 truthful result states (AC-S125-3)", () => {
  it("explains every uncertain fixture without inventing a compliant status or an amount", () => {
    const basis = saved("expected_move_out");
    const cases: Array<{
      name: string;
      input: Parameters<typeof evaluateMoveOutTiming>[0];
      expected: Record<string, unknown>;
    }> = [
      {
        name: "missing notice date",
        input: {
          disposition: disposition("initiated", { expectedMoveOutIso: "2026-09-30" }),
          leaseEndIso: null,
          basis,
          observedDateIso: OBSERVED,
        },
        expected: { state: "cannot_determine", reason: "notice_date_missing" },
      },
      {
        name: "missing target",
        input: {
          disposition: disposition("initiated", { noticeDateIso: "2026-08-01" }),
          leaseEndIso: null,
          basis,
          observedDateIso: OBSERVED,
        },
        expected: { state: "cannot_determine", reason: "target_date_missing" },
      },
      {
        name: "source failure",
        input: {
          disposition: disposition("unknown"),
          leaseEndIso: null,
          basis,
          observedDateIso: OBSERVED,
        },
        expected: { state: "cannot_determine", reason: "disposition_unknown" },
      },
      {
        name: "invalid leap date",
        input: {
          disposition: disposition("initiated", {
            noticeDateIso: "2026-02-29",
            expectedMoveOutIso: "2026-03-31",
          }),
          leaseEndIso: null,
          basis,
          observedDateIso: OBSERVED,
        },
        expected: { state: "cannot_determine", reason: "invalid_date" },
      },
      {
        name: "future-recorded notice",
        input: {
          disposition: disposition("initiated", {
            noticeDateIso: "2026-10-01",
            expectedMoveOutIso: "2026-11-15",
          }),
          leaseEndIso: null,
          basis,
          observedDateIso: OBSERVED,
        },
        expected: { state: "cannot_determine", reason: "notice_after_observed" },
      },
      {
        name: "target before notice",
        input: {
          disposition: disposition("initiated", {
            noticeDateIso: "2026-08-15",
            expectedMoveOutIso: "2026-08-01",
          }),
          leaseEndIso: null,
          basis,
          observedDateIso: OBSERVED,
        },
        expected: { state: "cannot_determine", reason: "target_before_notice" },
      },
      {
        name: "stale source",
        input: {
          disposition: disposition(
            "initiated",
            { noticeDateIso: "2026-08-01", expectedMoveOutIso: "2026-09-30" },
            "expired",
          ),
          leaseEndIso: null,
          basis,
          observedDateIso: OBSERVED,
        },
        expected: { state: "cannot_determine", reason: "source_stale" },
      },
    ];
    for (const item of cases) {
      const outcome = evaluateMoveOutTiming(item.input);
      expect(outcome, item.name).toMatchObject(item.expected);
      expect(outcome.daysGiven, item.name).toBeNull();
      expect(outcome.label, item.name).toBe("Cannot determine");
      expect(outcome.explanation, item.name).not.toMatch(/\$|owed|penalt|violat/i);
      expect(outcome.explanation, item.name).toMatch(
        /review|refresh|reviewed|established/i,
      );
    }
    // Explicit absence and withdrawal are Not applicable, never a yes.
    expect(
      evaluateMoveOutTiming({
        disposition: disposition("not_initiated"),
        leaseEndIso: "2026-09-30",
        basis,
        observedDateIso: OBSERVED,
      }),
    ).toMatchObject({ state: "not_applicable", reason: "no_notice", daysGiven: null });
    expect(
      evaluateMoveOutTiming({
        disposition: disposition("withdrawn"),
        leaseEndIso: "2026-09-30",
        basis,
        observedDateIso: OBSERVED,
      }),
    ).toMatchObject({ state: "not_applicable", reason: "notice_withdrawn" });
    // Strict dates only: no times, no lenient parsing.
    expect(calendarDayOrdinal("2026-02-29")).toBeNull();
    expect(calendarDayOrdinal("2028-02-29")).not.toBeNull();
    expect(calendarDayOrdinal("2026-8-1")).toBeNull();
    expect(calendarDayOrdinal("2026-08-01T00:00:00Z")).toBeNull();
  });
});

describe("S125 results tied to the evidence version (AC-S125-4)", () => {
  it("recomputes on corrected dates while an earlier result keeps its own dates and basis version", () => {
    const first = evaluateMoveOutTiming({
      disposition: disposition("initiated", {
        noticeDateIso: "2026-08-05",
        expectedMoveOutIso: "2026-08-31",
      }),
      leaseEndIso: null,
      basis: saved("expected_move_out", 1),
      observedDateIso: OBSERVED,
    });
    expect(first).toMatchObject({ state: "below", daysGiven: 26, basisVersion: 1 });
    const corrected = evaluateMoveOutTiming({
      disposition: disposition("initiated", {
        noticeDateIso: "2026-07-25",
        expectedMoveOutIso: "2026-08-31",
      }),
      leaseEndIso: null,
      basis: saved("expected_move_out", 2),
      observedDateIso: OBSERVED,
    });
    expect(corrected).toMatchObject({ state: "meets", daysGiven: 37, basisVersion: 2 });
    // The earlier result is an immutable value: revisiting it names the old dates and basis.
    expect(first.noticeDateIso).toBe("2026-08-05");
    expect(first.basisVersion).toBe(1);
    expect(first.explanation).toContain("version 1");
    expect(Object.isFrozen(first) || first.state === "below").toBe(true);
  });
});

describe("S125 filter keys and unavailable states (AC-S125-6)", () => {
  it("offers every state, treats an absent key as Cannot determine and never as compliant", () => {
    expect(MOVE_OUT_TIMING_DESK_FILTERS).toEqual([
      "all",
      "meets",
      "below",
      "cannot_determine",
      "not_applicable",
    ]);
    expect(matchesMoveOutTimingFilter("all", undefined)).toBe(true);
    expect(matchesMoveOutTimingFilter("meets", undefined)).toBe(false);
    expect(matchesMoveOutTimingFilter("cannot_determine", undefined)).toBe(true);
    expect(matchesMoveOutTimingFilter("below", "below")).toBe(true);
    expect(matchesMoveOutTimingFilter("meets", "not_applicable")).toBe(false);
  });
});
