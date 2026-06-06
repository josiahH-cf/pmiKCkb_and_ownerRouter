import { describe, expect, it } from "vitest";
import {
  formatScheduledApprovalQueueNotificationResult,
  parseQueueNotificationsArgs,
} from "@/scripts/run-approval-queue-notifications";
import type { ScheduledApprovalQueueNotificationResult } from "@/lib/firestore/approval-queue-scheduled-notifications";

describe("approval queue scheduled notification CLI", () => {
  it("defaults to dry-run for the provided default date", () => {
    expect(parseQueueNotificationsArgs([], "2026-06-10")).toEqual({
      help: false,
      json: false,
      referenceDate: "2026-06-10",
      write: false,
    });
  });

  it("parses write, dry-run, date, and json flags", () => {
    expect(
      parseQueueNotificationsArgs(
        ["--write", "--date=2026-06-11", "--json"],
        "2026-06-10",
      ),
    ).toEqual({
      help: false,
      json: true,
      referenceDate: "2026-06-11",
      write: true,
    });
    expect(
      parseQueueNotificationsArgs(["--dry-run", "--date", "2026-06-12"], "2026-06-10"),
    ).toEqual({
      help: false,
      json: false,
      referenceDate: "2026-06-12",
      write: false,
    });
  });

  it("rejects invalid combinations, invalid dates, and unknown args", () => {
    expect(() =>
      parseQueueNotificationsArgs(["--write", "--dry-run"], "2026-06-10"),
    ).toThrow(/either --dry-run or --write/);
    expect(() => parseQueueNotificationsArgs(["--date=June-10"], "2026-06-10")).toThrow(
      /YYYY-MM-DD/,
    );
    expect(() => parseQueueNotificationsArgs(["--unknown"], "2026-06-10")).toThrow(
      /Unknown argument/,
    );
  });

  it("formats safe text output without raw payload data", () => {
    const result: ScheduledApprovalQueueNotificationResult = {
      mode: "dry-run",
      reference_date: "2026-06-10",
      results: [
        {
          event: "overdue",
          item_id: "item-1",
          message: "Console overdue notifications would be created.",
          notification_ids: ["notification-1"],
          notifications_planned: 1,
          notifications_written: 0,
          outcome: "planned",
          recipient_count: 1,
          skipped_notification_count: 0,
        },
      ],
      summary: {
        eligible_overdue_count: 1,
        eligible_unsnoozed_count: 0,
        notifications_planned_count: 1,
        notifications_written_count: 0,
        planned_count: 1,
        skipped_count: 0,
        written_count: 0,
      },
    };

    expect(formatScheduledApprovalQueueNotificationResult(result)).toContain(
      "Approval Queue scheduled notifications (dry-run)",
    );
    expect(formatScheduledApprovalQueueNotificationResult(result)).toContain("item-1");
  });
});
