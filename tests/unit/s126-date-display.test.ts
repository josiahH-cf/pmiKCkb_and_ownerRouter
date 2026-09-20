import { describe, expect, it } from "vitest";

import {
  DATE_INVALID_LABEL,
  DATE_UNAVAILABLE_LABEL,
  MONTH_INVALID_LABEL,
  TIMESTAMP_INVALID_LABEL,
  describeCalendarDate,
  formatBusinessTimestamp,
  formatCalendarDate,
  formatCalendarDateRange,
  formatCalendarMonth,
  parseCalendarDate,
} from "@/lib/date-display";
import {
  applyRenewalDeskQueryV2,
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  parseRenewalDeskQueryV2,
  serializeRenewalDeskQueryV2,
  type RenewalDeskV2Item,
} from "@/lib/lease-renewal/desk-query-v2";

// S126 (F06): one presentation convention over canonical dates. Date-only values never pass through
// a time zone; timestamps keep their instant and an explicit business zone; missing and invalid
// values read as explicit labels. Nothing here stores, sends or rewrites anything.

describe("S126 one visible convention (AC-S126-1)", () => {
  it("renders a canonical calendar date as MM/DD/YYYY and a month as its name and year", () => {
    expect(formatCalendarDate("2026-10-01")).toBe("10/01/2026");
    expect(formatCalendarDate("2026-12-31")).toBe("12/31/2026");
    expect(formatCalendarDate("2027-01-01")).toBe("01/01/2027");
    expect(describeCalendarDate("2026-10-01")).toEqual({
      state: "date",
      iso: "2026-10-01",
      label: "10/01/2026",
    });
    expect(formatCalendarMonth("2026-09")).toBe("September 2026");
    expect(formatCalendarDateRange("2026-08-01", "2026-09-30")).toBe(
      "08/01/2026 through 09/30/2026",
    );
  });
});

describe("S126 date-only values stay date-only (AC-S126-2)", () => {
  it("shows the identical calendar day for leap days, year boundaries and daylight-saving dates without consulting any zone", () => {
    expect(formatCalendarDate("2028-02-29")).toBe("02/29/2028");
    expect(formatCalendarDate("2026-03-08")).toBe("03/08/2026");
    expect(formatCalendarDate("2026-11-01")).toBe("11/01/2026");
    expect(formatCalendarDate("2026-01-01")).toBe("01/01/2026");
    expect(formatCalendarDate("2025-12-31")).toBe("12/31/2025");
    // The parse is pure string and UTC arithmetic: the result never depends on the host zone.
    expect(parseCalendarDate("2026-03-08")).toEqual({ year: 2026, month: 3, day: 8 });
    // A true instant keeps its instant and names its zone; the calendar date is the business one.
    expect(formatBusinessTimestamp("2026-03-08T07:30:00.000Z")).toBe(
      "03/08/2026, 1:30 AM CST",
    );
    expect(formatBusinessTimestamp("2026-03-08T08:30:00.000Z")).toBe(
      "03/08/2026, 3:30 AM CDT",
    );
    expect(formatBusinessTimestamp("2026-11-01T06:30:00.000Z")).toBe(
      "11/01/2026, 1:30 AM CDT",
    );
    expect(formatBusinessTimestamp("2026-11-01T07:30:00.000Z")).toBe(
      "11/01/2026, 1:30 AM CST",
    );
    // A date-only value at midnight UTC is never rendered as the previous evening in Chicago.
    expect(formatCalendarDate("2026-10-01")).toBe("10/01/2026");
  });
});

describe("S126 storage, filters and sort keys are untouched (AC-S126-3)", () => {
  it("leaves canonical query dates byte-identical and the chronological order unchanged across year ends", () => {
    const state = {
      ...DEFAULT_RENEWAL_DESK_QUERY_V2,
      from: "2026-12-31",
      through: "2027-01-01",
      endDate: "2026-12-31",
    };
    const serialized = serializeRenewalDeskQueryV2(state);
    expect(serialized).toContain("from=2026-12-31");
    expect(serialized).toContain("through=2027-01-01");
    expect(serialized).toContain("endDate=2026-12-31");
    expect(serialized).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    const parsed = parseRenewalDeskQueryV2(new URLSearchParams(serialized));
    expect(parsed.from).toBe("2026-12-31");
    expect(parsed.through).toBe("2027-01-01");

    const item = (id: string, endDateIso: string | null): RenewalDeskV2Item => ({
      id,
      queryKeys: {
        normalizedLeaseId: id,
        normalizedSearchText: id,
        endDateIso,
        endMonth: endDateIso ? endDateIso.slice(0, 7) : null,
        normalizedOwners: [],
        normalizedTenants: [],
        workflowStepId: null,
        workflowStepIndex: null,
        waitingOn: "not_waiting",
        dueState: "not_due",
        dueAtIso: null,
        sourceConflictCount: 0,
        leaseTerm: "fixed_term",
        nextReviewIso: null,
      },
      identity: { address: { label: id }, property: null },
      retention: { state: "window" },
      guidance: {
        currentBaseRent: null,
        rentVerification: { state: "verified" },
        overallStatus: "ready",
        urgencyRank: 3,
        isBlocked: false,
      },
    });
    const rows = [
      item("jan", "2027-01-01"),
      item("dec", "2026-12-31"),
      item("none", null),
      item("feb", "2027-02-01"),
    ];
    const ordered = applyRenewalDeskQueryV2(
      rows,
      { ...DEFAULT_RENEWAL_DESK_QUERY_V2, sort: "end_date", direction: "asc" },
      () => false,
    ).items.map((row) => row.id);
    // 12/31 sorts before 01/01 of the next year because the typed date, not "12" versus "01", is compared.
    expect(ordered).toEqual(["dec", "jan", "feb", "none"]);
  });
});

describe("S126 unknown and invalid dates are distinct and explicit (AC-S126-5)", () => {
  it("never renders zero, the epoch, today or Invalid Date for missing or malformed input", () => {
    for (const missing of [null, undefined, "", "   "]) {
      expect(formatCalendarDate(missing)).toBe(DATE_UNAVAILABLE_LABEL);
      expect(describeCalendarDate(missing)).toEqual({
        state: "unavailable",
        label: DATE_UNAVAILABLE_LABEL,
      });
    }
    expect(formatCalendarDate(null, "Needs Verification")).toBe("Needs Verification");
    for (const bad of [
      "2026-02-30",
      "2026-02-29",
      "2026-13-01",
      "2026-00-10",
      "04/05/2026",
      "2026-4-5",
      "2026-08-01T00:00:00Z",
      "0",
      "1970-01-01x",
      "not a date",
    ]) {
      expect(formatCalendarDate(bad), bad).toBe(DATE_INVALID_LABEL);
      expect(describeCalendarDate(bad), bad).toEqual({
        state: "invalid",
        original: bad,
        label: DATE_INVALID_LABEL,
      });
      expect(parseCalendarDate(bad), bad).toBeNull();
    }
    // Month and timestamp inputs follow the same discipline.
    expect(formatCalendarMonth("2026-13")).toBe(MONTH_INVALID_LABEL);
    expect(formatCalendarMonth("September 2026")).toBe(MONTH_INVALID_LABEL);
    expect(formatCalendarMonth(null)).toBe(DATE_UNAVAILABLE_LABEL);
    expect(formatBusinessTimestamp("yesterday")).toBe(TIMESTAMP_INVALID_LABEL);
    expect(formatBusinessTimestamp(null)).toBe(DATE_UNAVAILABLE_LABEL);
    expect(formatBusinessTimestamp("")).toBe(DATE_UNAVAILABLE_LABEL);
    // No rendering ever equals the epoch or a bare "Invalid Date".
    expect(formatBusinessTimestamp("garbage")).not.toMatch(/1970|Invalid Date/);
  });
});
