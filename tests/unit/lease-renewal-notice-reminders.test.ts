import { describe, expect, it } from "vitest";

import { DEFAULT_NOTICE_RULE_SET } from "@/lib/lease-renewal/notice-rules";
import {
  planNoticeReminders,
  type NoticeReminderLeaseFacts,
} from "@/lib/lease-renewal/notice-reminders";

const RULE_SET = DEFAULT_NOTICE_RULE_SET; // deadline: 15th of the month before lease end

const leases: NoticeReminderLeaseFacts[] = [
  // ends Aug 31 -> notice due 2026-07-15
  {
    leaseId: "L-due-soon",
    label: "4821 Maple Ct, Unit 4",
    leaseEndDateIso: "2026-08-31",
    renewalLetterSentIso: null,
    tenantResponded: false,
  },
  // ends Jul 31 -> notice due 2026-06-15 (overdue as of ref)
  {
    leaseId: "L-overdue",
    label: "1207 Walnut St, Unit 2",
    leaseEndDateIso: "2026-07-31",
    renewalLetterSentIso: null,
    tenantResponded: false,
  },
  // letter sent, no response, past 10-day interval -> follow-up due
  {
    leaseId: "L-followup",
    label: "318 Cedar Ave, Unit 7",
    leaseEndDateIso: "2026-09-30",
    renewalLetterSentIso: "2026-07-01",
    tenantResponded: false,
  },
  // ends far out -> scheduled, no reminder
  {
    leaseId: "L-quiet",
    label: "12 Elm Ct, Unit 9",
    leaseEndDateIso: "2026-12-31",
    renewalLetterSentIso: null,
    tenantResponded: false,
  },
];

describe("planNoticeReminders", () => {
  it("emits reminders only for the actionable statuses, with the right kinds and dates", () => {
    const plan = planNoticeReminders({
      leases,
      ruleSet: RULE_SET,
      referenceDateIso: "2026-07-14",
    });
    expect(plan.summary).toEqual({
      notice_due_soon: 1,
      notice_overdue: 1,
      follow_up_due: 1,
    });
    const byId = new Map(plan.reminders.map((reminder) => [reminder.leaseId, reminder]));
    expect(byId.get("L-due-soon")?.kind).toBe("notice_due_soon");
    expect(byId.get("L-due-soon")?.dueByIso).toBe("2026-07-15");
    expect(byId.get("L-overdue")?.kind).toBe("notice_overdue");
    expect(byId.get("L-followup")?.kind).toBe("follow_up_due");
    expect(byId.get("L-followup")?.dueByIso).toBe("2026-07-11");
    expect(byId.has("L-quiet")).toBe(false);
  });

  it("produces stable dedupe keys (idempotent across identical runs)", () => {
    const first = planNoticeReminders({
      leases,
      ruleSet: RULE_SET,
      referenceDateIso: "2026-07-14",
    });
    const second = planNoticeReminders({
      leases,
      ruleSet: RULE_SET,
      referenceDateIso: "2026-07-14",
    });
    expect(first.reminders.map((r) => r.dedupeKey)).toEqual(
      second.reminders.map((r) => r.dedupeKey),
    );
    expect(new Set(first.reminders.map((r) => r.dedupeKey)).size).toBe(
      first.reminders.length,
    );
  });

  it("never emits a reminder for a lease with no end date", () => {
    const plan = planNoticeReminders({
      leases: [
        {
          leaseId: "L-noend",
          label: "unknown",
          leaseEndDateIso: null,
          renewalLetterSentIso: null,
          tenantResponded: false,
        },
      ],
      ruleSet: RULE_SET,
      referenceDateIso: "2026-07-14",
    });
    expect(plan.reminders).toHaveLength(0);
  });
});
