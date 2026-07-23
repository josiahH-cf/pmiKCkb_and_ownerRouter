import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listSupportReports: vi.fn() }));
vi.mock("@/lib/firestore/support-reports", () => ({
  listSupportReports: mocks.listSupportReports,
}));

import {
  buildSupportSignals,
  countSupportAttention,
  gatherSupportAttention,
  isSupportFollowUpDue,
} from "@/lib/attention/support-lane";

const NOW = "2026-07-23T12:00:00.000Z";
const admin = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};

afterEach(() => vi.clearAllMocks());

describe("isSupportFollowUpDue", () => {
  it("flags a `new` report older than one day and an `acknowledged` report older than three days", () => {
    expect(
      isSupportFollowUpDue(
        { status: "new", created_at: "2026-07-21T00:00:00.000Z" },
        NOW,
      ),
    ).toBe(true);
    expect(
      isSupportFollowUpDue(
        { status: "acknowledged", created_at: "2026-07-18T00:00:00.000Z" },
        NOW,
      ),
    ).toBe(true);
  });

  it("does not flag fresh reports or a resolved report", () => {
    // `new`, ~half a day old.
    expect(
      isSupportFollowUpDue(
        { status: "new", created_at: "2026-07-23T02:00:00.000Z" },
        NOW,
      ),
    ).toBe(false);
    // `acknowledged`, ~2 days old (< 3).
    expect(
      isSupportFollowUpDue(
        { status: "acknowledged", created_at: "2026-07-21T12:00:00.000Z" },
        NOW,
      ),
    ).toBe(false);
    // resolved is never due, however old.
    expect(
      isSupportFollowUpDue(
        { status: "resolved", created_at: "2020-01-01T00:00:00.000Z" },
        NOW,
      ),
    ).toBe(false);
    // A non-parseable timestamp is never a false alarm.
    expect(isSupportFollowUpDue({ status: "new", created_at: "not-a-date" }, NOW)).toBe(
      false,
    );
  });
});

describe("buildSupportSignals (value-free — AC-S39-3)", () => {
  const reports = [
    { status: "new" as const, created_at: "2026-07-23T06:00:00.000Z" },
    { status: "new" as const, created_at: "2026-07-20T00:00:00.000Z" }, // also follow-up due
    { status: "acknowledged" as const, created_at: "2026-07-01T00:00:00.000Z" }, // follow-up due
    { status: "resolved" as const, created_at: "2026-07-01T00:00:00.000Z" },
  ];

  it("emits a new + a follow-up signal with exactly the six whitelisted keys, no per-report value", () => {
    const signals = buildSupportSignals(reports, NOW);
    expect(signals.map((s) => s.signal_key)).toEqual([
      "support:new",
      "support:follow_up_due",
    ]);
    for (const signal of signals) {
      expect(Object.keys(signal).sort()).toEqual([
        "detail",
        "href",
        "label",
        "lane",
        "severity",
        "signal_key",
      ]);
      expect(signal.lane).toBe("support");
      expect(signal.href).toBe("/admin");
      // Never a reporter identity, description, element hint, or route value — the signal is counts only.
      const serialized = JSON.stringify(signal);
      expect(serialized).not.toMatch(/reporter|description|element|uid/i);
    }
    // The counts are the real integers (2 new, 2 follow-up due).
    expect(signals[0].detail).toContain("2 new");
    expect(signals[1].detail).toContain("2 report");
  });

  it("emits no signals when nothing is new and nothing is due", () => {
    expect(
      buildSupportSignals(
        [{ status: "resolved" as const, created_at: "2026-07-22T00:00:00.000Z" }],
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("gatherSupportAttention (single-gather interlock — AC-S39-2)", () => {
  it("returns signals AND counts derived from the SAME read, so hub and panel cannot diverge", async () => {
    mocks.listSupportReports.mockResolvedValue([
      { id: "r1", status: "new", created_at: "2026-07-23T06:00:00.000Z" },
      { id: "r2", status: "acknowledged", created_at: "2026-07-01T00:00:00.000Z" },
    ]);
    const attention = await gatherSupportAttention(admin, { now: NOW });

    expect(attention.newCount).toBe(1);
    expect(attention.followUpDueCount).toBe(1);
    // The follow-up signal's count equals followUpDueCount (the badge and the hub read this one gather).
    const followUp = attention.signals.find(
      (s) => s.signal_key === "support:follow_up_due",
    );
    expect(followUp?.detail).toContain(`${attention.followUpDueCount} report`);
    // Equivalence with the pure counter over the same inputs (no separate ad-hoc counting).
    expect(
      countSupportAttention(
        [
          { status: "new", created_at: "2026-07-23T06:00:00.000Z" },
          { status: "acknowledged", created_at: "2026-07-01T00:00:00.000Z" },
        ],
        NOW,
      ),
    ).toEqual({ newCount: 1, followUpDueCount: 1 });
  });

  it("degrades to empty (never throws) when the support read fails", async () => {
    mocks.listSupportReports.mockRejectedValue(new Error("firestore down"));
    await expect(gatherSupportAttention(admin, { now: NOW })).resolves.toEqual({
      signals: [],
      newCount: 0,
      followUpDueCount: 0,
    });
  });
});
