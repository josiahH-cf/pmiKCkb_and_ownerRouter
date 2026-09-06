import { describe, expect, it } from "vitest";

import { businessDateIso, businessMonth } from "@/lib/lease-renewal/business-calendar";
import { kansasCityMonth } from "@/lib/assistant/intent-registry";

// The desk window, the workspace reference date, the assistant's period parser, and the
// production oracle all read one business calendar (America/Chicago). Before this helper the desk
// derived its window from the UTC date, so for the last evening hours of a month the table showed
// next month's window while the assistant answered for this month.

describe("business calendar (America/Chicago)", () => {
  it("reads the Kansas City calendar day, not the UTC day, across a month end", () => {
    // 2026-10-01T04:30Z is 2026-09-30 23:30 CDT.
    expect(businessDateIso("2026-10-01T04:30:00.000Z")).toBe("2026-09-30");
    expect(businessMonth("2026-10-01T04:30:00.000Z")).toBe("2026-09");
    // 2026-10-01T05:30Z is 2026-10-01 00:30 CDT.
    expect(businessDateIso("2026-10-01T05:30:00.000Z")).toBe("2026-10-01");
    // Standard time: 2026-12-01T05:30Z is 2026-11-30 23:30 CST.
    expect(businessDateIso("2026-12-01T05:30:00.000Z")).toBe("2026-11-30");
    expect(businessDateIso("2026-12-01T06:30:00.000Z")).toBe("2026-12-01");
  });

  it("accepts a Date or epoch milliseconds and refuses an invalid instant", () => {
    expect(businessDateIso(new Date("2026-09-04T12:00:00.000Z"))).toBe("2026-09-04");
    expect(businessDateIso(Date.parse("2026-09-04T12:00:00.000Z"))).toBe("2026-09-04");
    expect(() => businessDateIso("not a date")).toThrow("business_date_invalid");
  });

  it("is the same calendar the assistant's period parser reads", () => {
    for (const instant of [
      "2026-10-01T04:30:00.000Z",
      "2026-10-01T05:30:00.000Z",
      "2026-03-08T07:59:00.000Z",
      "2026-11-01T06:59:00.000Z",
    ]) {
      expect(kansasCityMonth(instant), instant).toBe(businessMonth(instant));
    }
  });
});
