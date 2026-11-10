import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addCalendarDays,
  nextCalendarDay,
  proposeRenewalEnd,
  proposeRenewalStart,
  verifiedLeaseEnd,
  type VerifiedLeaseEnd,
} from "@/lib/lease-renewal/renewal-date-proposal";

// S263 R-S263-1/2 (ARCH-S263-1/2, BEH-S263-1/2, AC-S263-1/2/4): date-only proposals from the
// verified current lease end, and an end only from a known term. Synthetic dates only.

const verified = (endIso: string): VerifiedLeaseEnd =>
  verifiedLeaseEnd({ rentvineEndIso: endIso, sourceReadable: true });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AC-S263-1 the next calendar day", () => {
  it("BEH-S263-1: November 30 proposes December 1 and December 31 proposes January 1 of the next year", () => {
    expect(nextCalendarDay("2026-11-30")).toBe("2026-12-01");
    expect(nextCalendarDay("2026-12-31")).toBe("2027-01-01");
    expect(nextCalendarDay("2028-02-28")).toBe("2028-02-29");
    expect(nextCalendarDay("2028-02-29")).toBe("2028-03-01");
    expect(nextCalendarDay("2027-02-28")).toBe("2027-03-01");
    expect(addCalendarDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(nextCalendarDay("2026-02-30")).toBeNull();
  });

  it("BEH-S263-1: the proposal follows the calendar with no timezone shift", () => {
    vi.stubEnv("TZ", "Pacific/Kiritimati");
    expect(nextCalendarDay("2026-11-30")).toBe("2026-12-01");
    vi.stubEnv("TZ", "America/Chicago");
    expect(nextCalendarDay("2026-11-01")).toBe("2026-11-02");
  });

  it("AC-S263-1: only an ordinary fixed term with a verified end and an empty start gets a suggestion", () => {
    const eligible = {
      leaseEnd: verified("2026-11-30"),
      term: "fixed_term" as const,
      nonRenewal: false,
      startEmpty: true,
    };
    expect(proposeRenewalStart(eligible)).toEqual({
      state: "suggested",
      startIso: "2026-12-01",
      leaseEndIso: "2026-11-30",
      basisFingerprint: "rentvine:2026-11-30",
    });
    expect(proposeRenewalStart({ ...eligible, term: "month_to_month" })).toMatchObject({
      reason: "not_fixed_term",
    });
    expect(proposeRenewalStart({ ...eligible, term: "needs_review" })).toMatchObject({
      reason: "not_fixed_term",
    });
    expect(proposeRenewalStart({ ...eligible, nonRenewal: true })).toMatchObject({
      reason: "non_renewal",
    });
    expect(proposeRenewalStart({ ...eligible, startEmpty: false })).toMatchObject({
      reason: "start_saved",
    });
    for (const leaseEnd of [
      verifiedLeaseEnd({ rentvineEndIso: "2026-11-30", sourceReadable: false }),
      verifiedLeaseEnd({ rentvineEndIso: null, sourceReadable: true }),
      verifiedLeaseEnd({
        rentvineEndIso: "2027-11-30",
        sourceReadable: true,
        recordedLeaseEndIso: "2026-11-30",
      }),
    ])
      expect(proposeRenewalStart({ ...eligible, leaseEnd })).toMatchObject({
        state: "none",
        reason: "unverified_end",
      });
  });

  it("AC-S263-4: a disputed, stale or missing end is not verified and never carries the raw date forward", () => {
    expect(
      verifiedLeaseEnd({
        rentvineEndIso: "2027-11-30",
        sourceReadable: true,
        recordedLeaseEndIso: "2026-11-30",
      }),
    ).toMatchObject({ state: "unverified", reason: "disputed", rawEndIso: "2027-11-30" });
    expect(
      verifiedLeaseEnd({ rentvineEndIso: "2026-11-30", sourceReadable: false }),
    ).toMatchObject({ state: "unverified", reason: "unreadable" });
    // Staff kept working the recorded cycle (S246): that recorded end is the verified one.
    expect(
      verifiedLeaseEnd({
        rentvineEndIso: "2027-11-30",
        sourceReadable: true,
        recordedLeaseEndIso: "2026-11-30",
        keptRecordedCycle: true,
      }),
    ).toMatchObject({ state: "verified", endIso: "2026-11-30", basis: "recorded_cycle" });
  });
});

describe("AC-S263-2 an end only with a known term", () => {
  it("BEH-S263-2: an expressly reviewed one-year term from January 1 proposes December 31", () => {
    expect(
      proposeRenewalEnd("2027-01-01", { months: 12, convention: "inclusive_end" }),
    ).toEqual({ state: "suggested", endIso: "2027-12-31" });
    expect(
      proposeRenewalEnd("2026-12-01", { months: 12, convention: "inclusive_end" }),
    ).toEqual({ state: "suggested", endIso: "2027-11-30" });
  });

  it("BEH-S263-2: an unknown term, an ambiguous month end or a leap anniversary asks for the exact end", () => {
    expect(proposeRenewalEnd("2026-12-01", null).state).toBe("enter");
    expect(
      proposeRenewalEnd("2028-02-29", { months: 12, convention: "inclusive_end" }).state,
    ).toBe("enter");
    expect(
      proposeRenewalEnd("2027-01-31", { months: 1, convention: "inclusive_end" }).state,
    ).toBe("enter");
    expect(
      proposeRenewalEnd(null, { months: 12, convention: "inclusive_end" }).state,
    ).toBe("enter");
  });
});
