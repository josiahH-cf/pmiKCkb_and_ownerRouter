import { describe, expect, it } from "vitest";
import {
  CommunicationScheduleSchema,
  firstOccurrence,
  nextOccurrence,
  resolveWallTime,
} from "@/lib/gmail-hub/schedule-calendar";
const schedule = {
  firstDate: "2026-10-10",
  time: "09:30",
  timeZone: "America/Chicago",
  everyDays: 2,
  endDate: null,
  sendLimit: null,
};
describe("S189/S192 actual calendar occurrences", () => {
  it("rejects invalid runtime values and a newly approved past first time", () => {
    expect(() => firstOccurrence(schedule, Date.parse("2026-10-11T00:00Z"))).toThrow(
      /future/,
    );
    for (const change of [
      { everyDays: 0 },
      { firstDate: "2026-02-30" },
      { time: "24:00" },
      { timeZone: "invented/zone" },
      { sendLimit: 0 },
      { endDate: "2026-10-09" },
    ])
      expect(
        CommunicationScheduleSchema.safeParse({ ...schedule, ...change }).success,
      ).toBe(false);
  });
  it("discloses the earlier repeated-time instant and advances gaps to the first valid minute", () => {
    expect(resolveWallTime("2026-11-01", "01:30", "America/Chicago")).toMatchObject({
      instantMs: Date.parse("2026-11-01T06:30Z"),
      adjustment: "earlier_overlap",
    });
    expect(resolveWallTime("2027-03-14", "02:30", "America/Chicago")).toMatchObject({
      instantMs: Date.parse("2027-03-14T08:00Z"),
      resolvedTime: "03:00",
      adjustment: "gap_forward",
    });
    expect(resolveWallTime("2026-10-10", "09:30", "Asia/Kolkata").instantMs).toBe(
      Date.parse("2026-10-10T04:00Z"),
    );
  });
  it("uses local calendar days across DST and schedules once after a delayed send", () => {
    const s = { ...schedule, everyDays: 1 };
    expect(nextOccurrence(s, Date.parse("2026-10-31T14:30Z"), 1)).toBe(
      Date.parse("2026-11-01T15:30Z"),
    );
    expect(nextOccurrence(schedule, Date.parse("2026-10-20T18:00Z"), 1)).toBe(
      Date.parse("2026-10-22T14:30Z"),
    );
  });
  it("counts only confirmed sends including the initial send; end date is inclusive", () => {
    expect(
      nextOccurrence({ ...schedule, sendLimit: 1 }, Date.parse("2026-10-10T14:30Z"), 1),
    ).toBeNull();
    expect(
      nextOccurrence(
        { ...schedule, endDate: "2026-10-12" },
        Date.parse("2026-10-10T14:30Z"),
        1,
      ),
    ).toBe(Date.parse("2026-10-12T14:30Z"));
    expect(
      nextOccurrence(
        { ...schedule, endDate: "2026-10-11" },
        Date.parse("2026-10-10T14:30Z"),
        1,
      ),
    ).toBeNull();
    expect(nextOccurrence({ ...schedule, everyDays: null }, Date.now(), 1)).toBeNull();
  });
});
