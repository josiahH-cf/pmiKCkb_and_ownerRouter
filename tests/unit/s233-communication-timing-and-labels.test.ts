import { describe, expect, it } from "vitest";

import {
  describeNextDue,
  describeResumeTiming,
  describeWallTimeAdjustment,
  formatZonedInstant,
} from "@/lib/gmail-hub/schedule-calendar";
import {
  SEQUENCE_PAUSE_CAUSE_LABELS,
  describeSequenceObservation,
} from "@/lib/gmail-hub/communication-state";

// S233 (R-S233-3/5/6/7): Central scheduling with the zone always shown, the Nov 1, 2026 clock
// change stated before scheduling, a visible past-due lag, a disclosed Resume, and one plain
// label per pause cause. Synthetic values only; no mailbox, provider or customer data.

const schedule = {
  firstDate: "2026-10-30",
  time: "09:30",
  timeZone: "America/Chicago",
  everyDays: 7,
  endDate: "2026-12-31",
  sendLimit: 3,
};

describe("S233 named-zone display and clock-change disclosure (R-S233-6)", () => {
  it("shows every instant with its zone", () => {
    expect(
      formatZonedInstant(Date.parse("2026-11-01T06:30:00.000Z"), "America/Chicago"),
    ).toBe("Nov 1, 2026, 1:30 AM CDT");
    expect(
      formatZonedInstant(Date.parse("2026-11-01T07:30:00.000Z"), "America/Chicago"),
    ).toBe("Nov 1, 2026, 1:30 AM CST");
  });

  it("states the repeated 1:30 AM on Nov 1, 2026 uses the first one (CDT)", () => {
    expect(describeWallTimeAdjustment("2026-11-01", "01:30", "America/Chicago")).toBe(
      "Nov 1, 2026, 1:30 AM happens twice in America/Chicago when clocks fall back; this schedule uses the first one, Nov 1, 2026, 1:30 AM CDT.",
    );
  });

  it("states a skipped spring-forward time moves to the next valid minute", () => {
    expect(describeWallTimeAdjustment("2027-03-14", "02:30", "America/Chicago")).toBe(
      "Mar 14, 2027, 2:30 AM does not occur in America/Chicago when clocks spring forward; the message is scheduled for Mar 14, 2027, 3:00 AM CDT.",
    );
  });

  it("states nothing for an ordinary time", () => {
    expect(
      describeWallTimeAdjustment("2026-11-02", "09:30", "America/Chicago"),
    ).toBeNull();
  });
});

describe("S233 past-due visibility and Resume disclosure (R-S233-5/7)", () => {
  const now = Date.parse("2026-11-02T15:42:00.000Z");

  it("names the next due time in the sequence's zone and a past-due lag", () => {
    expect(
      describeNextDue(Date.parse("2026-11-02T16:00:00.000Z"), "America/Chicago", now),
    ).toBe("Next: Nov 2, 2026, 10:00 AM CST");
    expect(
      describeNextDue(Date.parse("2026-11-02T15:30:00.000Z"), "America/Chicago", now),
    ).toBe("Due Nov 2, 2026, 9:30 AM CST; not yet sent (12 min late)");
  });

  it("discloses that a paused sequence sends on the next worker run with its remaining limit", () => {
    expect(
      describeResumeTiming(
        { nextDueAtMs: null, confirmedCount: 1, authorization: { schedule } },
        now,
      ),
    ).toBe(
      "If resumed, the next message is due at once and goes on the communication worker's next run; 2 of 3 sends remain; the schedule ends 12/31/2026. To send at a different time, edit the message and use Schedule instead.",
    );
    expect(
      describeResumeTiming(
        {
          nextDueAtMs: Date.parse("2026-11-06T15:30:00.000Z"),
          confirmedCount: 1,
          authorization: { schedule: { ...schedule, sendLimit: null, endDate: null } },
        },
        now,
      ),
    ).toBe(
      "If resumed, the next message is due Nov 6, 2026, 9:30 AM CST; no send limit is set. To send at a different time, edit the message and use Schedule instead.",
    );
    expect(
      describeResumeTiming(
        { nextDueAtMs: null, confirmedCount: 0, authorization: null },
        now,
      ),
    ).toContain("this is a single reviewed message");
  });
});

describe("S233 distinct pause causes (R-S233-3)", () => {
  it("labels provider refusal, unconfirmed sends, unreadable facts and unexpected senders apart", () => {
    const labels = [
      SEQUENCE_PAUSE_CAUSE_LABELS.provider_refused,
      SEQUENCE_PAUSE_CAUSE_LABELS.send_unconfirmed,
      SEQUENCE_PAUSE_CAUSE_LABELS.source_unavailable,
      SEQUENCE_PAUSE_CAUSE_LABELS.unexpected_sender,
      SEQUENCE_PAUSE_CAUSE_LABELS.authorization_unavailable,
    ];
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of Object.values(SEQUENCE_PAUSE_CAUSE_LABELS)) {
      expect(label).not.toMatch(/_/);
      expect(label).not.toMatch(/\bdelivered\b|\bread by\b|\bopened\b/i);
    }
  });
});

describe("S233 incoming-check freshness (R-S233-4)", () => {
  const now = Date.parse("2026-11-02T15:42:00.000Z");
  it("states the check age and that scheduled sends are held when the check failed", () => {
    expect(describeSequenceObservation(null, now)).toBe("Incoming not checked yet");
    expect(
      describeSequenceObservation(
        { checkedAtMs: now - 3 * 60_000, state: "current", historyId: null },
        now,
      ),
    ).toBe("Incoming checked 3 min ago");
    expect(
      describeSequenceObservation(
        { checkedAtMs: now - 5 * 3_600_000, state: "unavailable", historyId: null },
        now,
      ),
    ).toBe(
      "Incoming could not be fully read (last attempt 5 h ago); scheduled sends are held until it reads cleanly",
    );
  });
});
