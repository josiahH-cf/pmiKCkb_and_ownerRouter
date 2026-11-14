// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LeasePacketReadiness } from "@/components/lease-renewal/LeasePacketReadiness";
import {
  displayDateReplacer,
  formatBusinessDate,
  formatWallClock,
  formatZonedTimestamp,
} from "@/lib/date-display";
import {
  describeNextDue,
  describeResumeTiming,
  describeScheduledFor,
  describeWallTimeAdjustment,
  formatZonedInstant,
  resolveWallTime,
} from "@/lib/gmail-hub/schedule-calendar";
import { formatCentralTime } from "@/lib/lease-documents/returned-state-view";

// S283 R-S283-1, ARCH-S283-1, BEH-S283-1 and AC-S283-1: every listed rendering uses the settled
// shapes of lib/date-display.ts: a date reads MM/DD/YYYY and an instant "MM/DD/YYYY, h:mm AM CDT"
// with its zone named. Date and time inputs keep their native value formats. Synthetic instants
// only: one in standard time and one in daylight time.

afterEach(cleanup);

const ZONE = "America/Chicago";
const STANDARD = Date.parse("2026-11-13T15:00:00.000Z"); // 9:00 AM CST
const DAYLIGHT = Date.parse("2026-10-20T15:00:00.000Z"); // 10:00 AM CDT
const SETTLED_INSTANT = /^\d{2}\/\d{2}\/\d{4}, \d{1,2}:\d{2} (AM|PM) (CST|CDT)$/;

/** The renderings S283 lists, by file. */
const LISTED = [
  "components/lease-renewal/RenewalPreparedMessage.tsx",
  "components/lease-renewal/RenewalOfferAnswers.tsx",
  "components/lease-renewal/RenewalMessagePreparation.tsx",
  "components/lease-renewal/LeasePacketReadiness.tsx",
  "components/lease-renewal/RenewalManualWorkspace.tsx",
  "components/gmail-hub/CommunicationComposer.tsx",
  "components/gmail-hub/WorkflowCommunicationsHub.tsx",
  "lib/gmail-hub/schedule-calendar.ts",
  "lib/lease-documents/returned-state-view.ts",
] as const;

describe("ARCH-S283-1 the listed renderings call the shared date helpers", () => {
  it("ARCH-S283-1 no listed file formats a date or an instant directly", () => {
    for (const file of LISTED) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/toLocale(Date|Time)?String\(/);
      expect(source, file).not.toMatch(/month:\s*"(short|long|numeric)"/);
      expect(source, file).not.toMatch(/dateStyle:|timeStyle:/);
      // A formatter fed a re-serialized instant (the starting state's worker-health line).
      expect(source, file).not.toMatch(
        /format\w*\(\s*new Date\([^)]*\)\.toISOString\(\)/,
      );
      // The starting state's "Scheduled for 2026-11-13 at 09:00 Central" message.
      expect(source, file).not.toMatch(
        /Scheduled for \$\{scheduleDate\} at \$\{scheduleTime\}/,
      );
      expect(source, file).not.toMatch(/\} Central`/);
    }
  });

  it("ARCH-S283-1 the zoned formatter delegates to lib/date-display.ts", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/gmail-hub/schedule-calendar.ts"),
      "utf8",
    );
    expect(source).toContain('from "@/lib/date-display"');
    expect(source).toMatch(/return formatZonedTimestamp\(ms, timeZone\)/);
  });
});

describe("BEH-S283-1 and AC-S283-1 the settled shapes, in standard and daylight time", () => {
  it("BEH-S283-1 a scheduled message reads Scheduled for 11/13/2026, 9:00 AM CST", () => {
    const instant = resolveWallTime("2026-11-13", "09:00", ZONE).instantMs;
    expect(instant).toBe(STANDARD);
    expect(describeScheduledFor(instant, ZONE)).toBe(
      "Scheduled for 11/13/2026, 9:00 AM CST",
    );
  });

  it("AC-S283-1 every instant names its zone in both seasons", () => {
    expect(formatZonedInstant(STANDARD, ZONE)).toBe("11/13/2026, 9:00 AM CST");
    expect(formatZonedInstant(DAYLIGHT, ZONE)).toBe("10/20/2026, 10:00 AM CDT");
    expect(formatZonedTimestamp(DAYLIGHT)).toBe("10/20/2026, 10:00 AM CDT");
    for (const ms of [STANDARD, DAYLIGHT])
      expect(formatZonedInstant(ms, ZONE)).toMatch(SETTLED_INSTANT);
    expect(formatZonedTimestamp(Number.NaN)).toBe("Invalid timestamp");
  });

  it("AC-S283-1 next due, resume timing and a repeated wall time use the settled shapes", () => {
    expect(describeNextDue(STANDARD, ZONE, STANDARD - 60_000)).toBe(
      "Next: 11/13/2026, 9:00 AM CST",
    );
    expect(
      describeResumeTiming(
        { nextDueAtMs: DAYLIGHT, confirmedCount: 1, authorization: null },
        DAYLIGHT - 60_000,
      ),
    ).toContain("due 10/20/2026, 10:00 AM CDT");
    expect(describeWallTimeAdjustment("2026-11-01", "01:30", ZONE)).toMatch(
      /^11\/01\/2026, 1:30 AM happens twice/,
    );
    expect(formatWallClock("2026-11-01", "13:05")).toBe("11/01/2026, 1:05 PM");
    expect(formatWallClock("2026-11-01", "00:00")).toBe("11/01/2026, 12:00 AM");
  });

  it("AC-S283-1 an offer's day reads MM/DD/YYYY in the business zone", () => {
    expect(formatBusinessDate("2026-11-09T15:00:00.000Z")).toBe("11/09/2026");
    // 02:00 UTC on Nov 10 is still Nov 9 in Central time.
    expect(formatBusinessDate("2026-11-10T02:00:00.000Z")).toBe("11/09/2026");
    expect(formatBusinessDate("2026-11-09")).toBe("11/09/2026");
    expect(formatBusinessDate(null, "an unknown date")).toBe("an unknown date");
  });

  it("AC-S283-1 Documents' instants read in the settled shape with the zone", () => {
    expect(formatCentralTime("2026-10-20T15:00:00.000Z")).toBe(
      "10/20/2026, 10:00 AM CDT",
    );
    expect(formatCentralTime("2026-11-13T15:00:00.000Z")).toBe("11/13/2026, 9:00 AM CST");
    expect(formatCentralTime("not a time")).toBeNull();
    render(
      <LeasePacketReadiness
        context={{
          state: "current",
          label: "Renewal extension",
          observedAt: "2026-11-13T15:00:00.000Z",
          basis: [],
          missing: [],
          saved: "No saved packet snapshot; this current view writes nothing.",
        }}
        rows={[]}
      />,
    );
    expect(
      screen.getByText("Current facts checked 11/13/2026, 9:00 AM CST."),
    ).toBeVisible();
  });

  it("AC-S283-1 the staff activity record shows its dates and instants in the settled shapes", () => {
    const shown = JSON.stringify(
      {
        kind: "owner_response",
        effectiveDate: "2027-01-01",
        occurredAt: "2026-11-13T15:00:00.000Z",
        note: "Synthetic note 2026-11-13 stays as typed",
      },
      displayDateReplacer,
      2,
    );
    expect(shown).toContain('"effectiveDate": "01/01/2027"');
    expect(shown).toContain('"occurredAt": "11/13/2026, 9:00 AM CST"');
    expect(shown).toContain('"note": "Synthetic note 2026-11-13 stays as typed"');
    expect(shown).not.toMatch(/T15:00:00/);
  });
});
