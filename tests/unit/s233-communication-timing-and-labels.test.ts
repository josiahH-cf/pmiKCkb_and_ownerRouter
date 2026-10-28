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
  describeWorkerHealth,
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

  it("names why a check failed, since when, and a mailbox sync failure as not checked this run", () => {
    const failed = (
      reason:
        | "read_failed"
        | "thread_too_large"
        | "mailbox_sync_failed"
        | "source_unavailable",
    ) =>
      describeSequenceObservation(
        {
          checkedAtMs: now - 10 * 60_000,
          state: "unavailable",
          historyId: null,
          reason,
          unavailableSinceMs: now - 3 * 3_600_000,
        },
        now,
      );
    const held =
      "Unavailable for 3 h (last attempt 10 min ago); scheduled sends are held until it reads cleanly";
    expect(failed("read_failed")).toBe(
      `Incoming could not be read cleanly: a linked Gmail thread could not be read. ${held}`,
    );
    expect(failed("thread_too_large")).toBe(
      `Incoming could not be read cleanly: a linked Gmail thread is over the 50-message or 100,000-character read limit. ${held}`,
    );
    expect(failed("source_unavailable")).toBe(
      `Incoming could not be read cleanly: the lease source or recipient facts could not be read. ${held}`,
    );
    expect(failed("mailbox_sync_failed")).toBe(
      `Incoming not checked this run: the staff mailbox sync failed, so it was not checked this run. ${held}`,
    );
  });
});

describe("S233 worker health on the hub (R-S233-5)", () => {
  const now = Date.parse("2026-11-02T15:42:00.000Z");
  const due = (ms: number) => new Date(ms).toISOString().slice(11, 16);
  it("states the last run with its counts, the oldest past-due message and the oldest check", () => {
    expect(
      describeWorkerHealth(
        {
          lastRun: {
            startedAtMs: now - 4 * 60_000,
            finishedAtMs: now - 3 * 60_000,
            running: false,
            counts: { inspected: 12, sent: 1, held: 2, failures: 1, notChecked: 1 },
          },
          complete: true,
          oldestPastDue: { dueAtMs: now - 25 * 60_000, lagMs: 25 * 60_000 },
          oldestObservation: { checkedAtMs: now - 8 * 60_000, ageMs: 8 * 60_000 },
          neverChecked: 2,
        },
        now,
        due,
      ),
    ).toEqual([
      "Worker: last run finished 3 min ago (12 checked, 1 sent, 2 held, 1 failures, 1 not checked this run).",
      "Oldest past-due message: due 15:17; not yet sent (25 min late).",
      "Oldest incoming check: 8 min ago; 2 not checked yet.",
    ]);
    expect(
      describeWorkerHealth(
        {
          lastRun: null,
          complete: false,
          oldestPastDue: null,
          oldestObservation: null,
          neverChecked: 0,
        },
        now,
        due,
      ),
    ).toEqual([
      "Worker: no run recorded yet.",
      "No scheduled message is past due.",
      "No open communication needs an incoming check.",
      "Counts cover the first open communications read; more are open.",
    ]);
    expect(
      describeWorkerHealth(
        {
          lastRun: {
            startedAtMs: now - 60_000,
            finishedAtMs: null,
            running: true,
            counts: {},
          },
          complete: true,
          oldestPastDue: null,
          oldestObservation: null,
          neverChecked: 1,
        },
        now,
        due,
      ),
    ).toEqual([
      "Worker: a run is in progress (started 1 min ago).",
      "No scheduled message is past due.",
      "Incoming not checked yet for 1 communication.",
    ]);
    // A run whose lease ran out before it finished is a stopped run, never "no run recorded".
    expect(
      describeWorkerHealth(
        {
          lastRun: {
            startedAtMs: now - 3 * 60 * 60_000,
            finishedAtMs: null,
            running: false,
            counts: {},
          },
          complete: true,
          oldestPastDue: null,
          oldestObservation: null,
          neverChecked: 0,
        },
        now,
        due,
      )[0],
    ).toBe("Worker: the last run started 3 h ago and did not finish.");
  });
});
