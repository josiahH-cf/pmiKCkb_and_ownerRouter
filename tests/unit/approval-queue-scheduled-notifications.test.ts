import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { runScheduledApprovalQueueNotifications } from "@/lib/firestore/approval-queue-scheduled-notifications";
import type {
  ApprovalQueueActivityRecord,
  ApprovalQueueItemRecord,
  ApprovalQueueNotificationRecord,
} from "@/lib/firestore/types";
import { FakeFirestore } from "../helpers/fake-firestore";

let db: Firestore;
let fakeDb: FakeFirestore;

beforeEach(() => {
  fakeDb = new FakeFirestore();
  db = fakeDb as unknown as Firestore;
});

describe("scheduled approval queue notifications", () => {
  it("plans eligible unsnoozed and overdue notifications without writing in dry-run", async () => {
    seedQueueItem(item({ id: "snoozed-due", snooze_until: "2026-06-09" }));
    seedQueueItem(
      item({
        id: "overdue-ready",
        due_date: "2026-06-01",
        status: "Ready for Approval",
      }),
    );
    seedQueueItem(item({ id: "snoozed-future", snooze_until: "2026-06-20" }));
    seedQueueItem(
      item({
        id: "future-ready",
        due_date: "2026-06-20",
        status: "Ready for Approval",
      }),
    );

    const result = await runScheduledApprovalQueueNotifications({
      db,
      referenceDate: "2026-06-10",
    });

    expect(result).toMatchObject({
      mode: "dry-run",
      reference_date: "2026-06-10",
      summary: {
        eligible_overdue_count: 1,
        eligible_unsnoozed_count: 1,
        notifications_planned_count: 4,
        notifications_written_count: 0,
        planned_count: 2,
        skipped_count: 0,
        written_count: 0,
      },
    });
    expect(readQueueItem("snoozed-due")).toMatchObject({
      snooze_until: "2026-06-09",
      status: "Snoozed",
    });
    expect(collectionDocs("approval_queue_activity")).toHaveLength(0);
    expect(collectionDocs("approval_queue_notifications")).toHaveLength(0);
  });

  it("unsnoozes due items, clears snooze date, writes Activity, and is idempotent", async () => {
    seedQueueItem(item({ id: "snoozed-due", snooze_until: "2026-06-09" }));

    const result = await runScheduledApprovalQueueNotifications({
      db,
      referenceDate: "2026-06-10",
      write: true,
    });

    expect(result.summary).toMatchObject({
      eligible_unsnoozed_count: 1,
      notifications_written_count: 2,
      written_count: 1,
    });
    expect(result.results[0]).toMatchObject({
      event: "unsnoozed",
      item_id: "snoozed-due",
      new_status: "Ready for Approval",
      outcome: "updated",
      recipient_count: 2,
    });
    expect(readQueueItem("snoozed-due")).toMatchObject({
      status: "Ready for Approval",
    });
    expect(readQueueItem("snoozed-due").snooze_until).toBeUndefined();

    const [activity] = collectionDocs<ApprovalQueueActivityRecord>(
      "approval_queue_activity",
    );
    expect(activity).toMatchObject({
      action: "unsnoozed",
      actor_uid: "approval-queue-scheduler",
      item_id: "snoozed-due",
      new_state: "Ready for Approval",
      previous_state: "Snoozed",
    });

    const notifications = collectionDocs<ApprovalQueueNotificationRecord>(
      "approval_queue_notifications",
    );
    expect(notifications).toHaveLength(2);
    expect(notifications.map((notification) => notification.event)).toEqual([
      "unsnoozed",
      "unsnoozed",
    ]);

    const rerun = await runScheduledApprovalQueueNotifications({
      db,
      referenceDate: "2026-06-10",
      write: true,
    });

    expect(rerun.summary).toMatchObject({
      eligible_overdue_count: 0,
      eligible_unsnoozed_count: 0,
      notifications_written_count: 0,
      written_count: 0,
    });
    expect(collectionDocs("approval_queue_activity")).toHaveLength(1);
    expect(collectionDocs("approval_queue_notifications")).toHaveLength(2);
  });

  it("writes one overdue notification set and excludes terminal, due-today, future, missing-date, and snoozed items", async () => {
    seedQueueItem(
      item({
        id: "overdue-ready",
        due_date: "2026-06-01",
        status: "Ready for Approval",
      }),
    );
    seedQueueItem(
      item({
        id: "due-today",
        due_date: "2026-06-10",
        status: "Ready for Approval",
      }),
    );
    seedQueueItem(
      item({
        id: "due-future",
        due_date: "2026-06-11",
        status: "Ready for Approval",
      }),
    );
    seedQueueItem(
      item({
        due_date: undefined,
        id: "no-due-date",
        status: "Ready for Approval",
      }),
    );
    seedQueueItem(
      item({
        due_date: "2026-06-01",
        id: "terminal-approved",
        status: "Approved",
      }),
    );
    seedQueueItem(
      item({
        due_date: "2026-06-01",
        id: "still-snoozed",
        snooze_until: "2026-06-20",
      }),
    );

    const result = await runScheduledApprovalQueueNotifications({
      db,
      referenceDate: "2026-06-10",
      write: true,
    });

    expect(result.summary).toMatchObject({
      eligible_overdue_count: 1,
      eligible_unsnoozed_count: 0,
      notifications_written_count: 2,
      written_count: 1,
    });
    expect(collectionDocs("approval_queue_activity")).toHaveLength(0);
    expect(readQueueItem("overdue-ready")).toMatchObject({
      due_date: "2026-06-01",
      status: "Ready for Approval",
    });

    const notifications = collectionDocs<ApprovalQueueNotificationRecord>(
      "approval_queue_notifications",
    );
    expect(notifications).toHaveLength(2);
    expect(notifications[0]).toMatchObject({
      event: "overdue",
      item_id: "overdue-ready",
      status: "Ready for Approval",
    });

    const rerun = await runScheduledApprovalQueueNotifications({
      db,
      referenceDate: "2026-06-11",
      write: true,
    });

    expect(rerun.summary).toMatchObject({
      eligible_overdue_count: 2,
      notifications_written_count: 2,
      skipped_count: 1,
      written_count: 1,
    });
    expect(
      rerun.results.find((entry) => entry.item_id === "overdue-ready"),
    ).toMatchObject({
      outcome: "skipped",
    });
    expect(collectionDocs("approval_queue_notifications")).toHaveLength(4);
  });

  it("routes missing-ownership unsnoozed items to Blocked and skips items with no recipients", async () => {
    seedQueueItem(
      item({
        id: "missing-approver",
        required_approver_uid: undefined,
        snooze_until: "2026-06-09",
      }),
    );
    seedQueueItem(
      item({
        assignee_uid: undefined,
        id: "no-recipients",
        required_approver_uid: undefined,
        snooze_until: "2026-06-09",
      }),
    );

    const result = await runScheduledApprovalQueueNotifications({
      db,
      referenceDate: "2026-06-10",
      write: true,
    });

    expect(result.summary).toMatchObject({
      eligible_unsnoozed_count: 2,
      notifications_written_count: 1,
      skipped_count: 1,
      written_count: 1,
    });
    expect(readQueueItem("missing-approver")).toMatchObject({
      status: "Blocked",
    });
    expect(readQueueItem("missing-approver").snooze_until).toBeUndefined();
    expect(readQueueItem("no-recipients")).toMatchObject({
      snooze_until: "2026-06-09",
      status: "Snoozed",
    });
    expect(
      result.results.find((entry) => entry.item_id === "no-recipients"),
    ).toMatchObject({
      outcome: "skipped",
      recipient_count: 0,
    });

    const notifications = collectionDocs<ApprovalQueueNotificationRecord>(
      "approval_queue_notifications",
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      event: "unsnoozed",
      item_id: "missing-approver",
      recipient_uid: "editor-1",
      status: "Blocked",
    });
  });

  it("rejects invalid reference dates", async () => {
    await expect(
      runScheduledApprovalQueueNotifications({
        db,
        referenceDate: "June 10",
      }),
    ).rejects.toThrow(/YYYY-MM-DD/);
  });
});

function seedQueueItem(record: ApprovalQueueItemRecord) {
  fakeDb.seed(
    `approval_queue_items/${record.id}`,
    record as unknown as Record<string, unknown>,
  );
}

function readQueueItem(id: string) {
  return fakeDb.store.get(
    `approval_queue_items/${id}`,
  ) as unknown as ApprovalQueueItemRecord;
}

function collectionDocs<T>(collection: string) {
  const prefix = `${collection}/`;

  return Array.from(fakeDb.store.entries())
    .filter(([path]) => path.startsWith(prefix))
    .map(([, data]) => data as unknown as T)
    .sort((left, right) =>
      String((left as { id?: string }).id ?? "").localeCompare(
        String((right as { id?: string }).id ?? ""),
      ),
    );
}

function item(overrides: Partial<ApprovalQueueItemRecord> = {}): ApprovalQueueItemRecord {
  const id = overrides.id ?? "queue-item-1";

  return {
    action_needed: "Review the scheduled approval item.",
    assignee_uid: "editor-1",
    audience_group: "Dan/Admin decisions",
    created_at: "2026-06-01T00:00:00.000Z",
    direct_link: `/approval-queue?item_id=${id}`,
    id,
    item_type: "ApprovalPackage",
    process_run_ref: { id: `run-${id}`, label: `Lease Renewal - ${id}` },
    required_approver_uid: "approver-1",
    risk: "Medium",
    source_trigger_key: `run-${id}:scheduled`,
    status: "Snoozed",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}
