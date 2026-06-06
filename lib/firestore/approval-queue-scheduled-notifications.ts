import { createHash } from "node:crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { isQueueItemTerminal } from "@/lib/approval/queue";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  queueNotificationMessage,
  queueNotificationRecipientsForItem,
  queueNotificationTitle,
} from "@/lib/firestore/approval-queue-notifications";
import type {
  ApprovalQueueActivityRecord,
  ApprovalQueueItemRecord,
  ApprovalQueueNotificationRecord,
  QueueItemStatus,
  QueueNotificationEvent,
} from "@/lib/firestore/types";

const COLLECTIONS = {
  notifications: "approval_queue_notifications",
  queueActivity: "approval_queue_activity",
  queueItems: "approval_queue_items",
} as const;
const SCHEDULED_ACTOR_UID = "approval-queue-scheduler";

type ScheduledEvent = Extract<QueueNotificationEvent, "overdue" | "unsnoozed">;
type ScheduledOutcome = "planned" | "skipped" | "notified" | "updated";

interface NotificationPlan {
  exists: boolean;
  id: string;
  recipient_role: ApprovalQueueNotificationRecord["recipient_role"];
  recipient_uid: string;
}

export interface RunScheduledApprovalQueueNotificationsInput {
  db?: Firestore;
  referenceDate?: string;
  write?: boolean;
}

export interface ScheduledApprovalQueueNotificationResultItem {
  event: ScheduledEvent;
  item_id: string;
  message: string;
  new_status?: QueueItemStatus;
  notification_ids: string[];
  notifications_planned: number;
  notifications_written: number;
  outcome: ScheduledOutcome;
  recipient_count: number;
  skipped_notification_count: number;
}

export interface ScheduledApprovalQueueNotificationResult {
  mode: "dry-run" | "write";
  reference_date: string;
  results: ScheduledApprovalQueueNotificationResultItem[];
  summary: {
    eligible_overdue_count: number;
    eligible_unsnoozed_count: number;
    notifications_planned_count: number;
    notifications_written_count: number;
    planned_count: number;
    skipped_count: number;
    written_count: number;
  };
}

export async function runScheduledApprovalQueueNotifications({
  db = getAdminFirestore(),
  referenceDate = today(),
  write = false,
}: RunScheduledApprovalQueueNotificationsInput = {}): Promise<ScheduledApprovalQueueNotificationResult> {
  assertIsoDate(referenceDate);
  const items = await readCollection<ApprovalQueueItemRecord>(db, COLLECTIONS.queueItems);
  const unsnoozeCandidates = items.filter((item) =>
    isEligibleForUnsnooze(item, referenceDate),
  );
  const overdueCandidates = items.filter((item) =>
    isEligibleForOverdueNotification(item, referenceDate),
  );
  const results: ScheduledApprovalQueueNotificationResultItem[] = [];

  for (const item of unsnoozeCandidates) {
    results.push(
      write
        ? await writeUnsnooze(db, item, referenceDate)
        : await planUnsnooze(db, item, referenceDate),
    );
  }

  for (const item of overdueCandidates) {
    results.push(
      write
        ? await writeOverdueNotification(db, item, referenceDate)
        : await planOverdueNotification(db, item, referenceDate),
    );
  }

  return {
    mode: write ? "write" : "dry-run",
    reference_date: referenceDate,
    results,
    summary: {
      eligible_overdue_count: overdueCandidates.length,
      eligible_unsnoozed_count: unsnoozeCandidates.length,
      notifications_planned_count: results.reduce(
        (sum, result) => sum + result.notifications_planned,
        0,
      ),
      notifications_written_count: results.reduce(
        (sum, result) => sum + result.notifications_written,
        0,
      ),
      planned_count: results.filter((result) => result.outcome === "planned").length,
      skipped_count: results.filter((result) => result.outcome === "skipped").length,
      written_count: results.filter(
        (result) => result.outcome === "notified" || result.outcome === "updated",
      ).length,
    },
  };
}

export function scheduledQueueNotificationId({
  event,
  itemId,
  recipientUid,
  triggerDate,
}: {
  event: ScheduledEvent;
  itemId: string;
  recipientUid: string;
  triggerDate: string;
}) {
  const hash = createHash("sha256")
    .update([event, itemId, recipientUid, triggerDate].join("|"))
    .digest("hex")
    .slice(0, 24);

  return `scheduled-${event}-${triggerDate}-${hash}`;
}

async function planUnsnooze(
  db: Firestore,
  item: ApprovalQueueItemRecord,
  referenceDate: string,
): Promise<ScheduledApprovalQueueNotificationResultItem> {
  const event: ScheduledEvent = "unsnoozed";
  const newStatus = statusAfterUnsnooze(item);
  const plans = await readNotificationPlans(db, item, event, referenceDate);

  if (plans.length === 0) {
    return skippedResult({
      event,
      item,
      message: "No assignee or required approver is available for this scheduled item.",
      newStatus,
    });
  }

  const missing = plans.filter((plan) => !plan.exists);

  return {
    event,
    item_id: item.id,
    message:
      missing.length > 0
        ? "Queue item would be unsnoozed and console notifications would be created."
        : "Queue item would be unsnoozed; scheduled notification records already exist.",
    new_status: newStatus,
    notification_ids: missing.map((plan) => plan.id),
    notifications_planned: missing.length,
    notifications_written: 0,
    outcome: "planned" as const,
    recipient_count: plans.length,
    skipped_notification_count: plans.length - missing.length,
  };
}

async function planOverdueNotification(
  db: Firestore,
  item: ApprovalQueueItemRecord,
  referenceDate: string,
): Promise<ScheduledApprovalQueueNotificationResultItem> {
  const event: ScheduledEvent = "overdue";
  const plans = await readNotificationPlans(db, item, event, referenceDate);

  if (plans.length === 0) {
    return skippedResult({
      event,
      item,
      message: "No assignee or required approver is available for this overdue item.",
    });
  }

  const missing = plans.filter((plan) => !plan.exists);

  if (missing.length === 0) {
    return skippedResult({
      event,
      item,
      message: "Scheduled overdue notifications already exist.",
      recipientCount: plans.length,
      skippedNotificationCount: plans.length,
    });
  }

  return {
    event,
    item_id: item.id,
    message: "Console overdue notifications would be created.",
    notification_ids: missing.map((plan) => plan.id),
    notifications_planned: missing.length,
    notifications_written: 0,
    outcome: "planned" as const,
    recipient_count: plans.length,
    skipped_notification_count: plans.length - missing.length,
  };
}

async function writeUnsnooze(
  db: Firestore,
  item: ApprovalQueueItemRecord,
  referenceDate: string,
): Promise<ScheduledApprovalQueueNotificationResultItem> {
  return db.runTransaction(async (transaction) => {
    const itemSnapshot = await transaction.get(itemRef(db, item.id));
    const current = readRequiredItem(itemSnapshot.id, itemSnapshot.data());
    const event: ScheduledEvent = "unsnoozed";
    const newStatus = statusAfterUnsnooze(current);

    if (!isEligibleForUnsnooze(current, referenceDate)) {
      return skippedResult({
        event,
        item: current,
        message: "Queue item is no longer eligible to unsnooze.",
      });
    }

    const plans = await readNotificationPlansInTransaction(
      transaction,
      db,
      current,
      event,
      referenceDate,
    );

    if (plans.length === 0) {
      return skippedResult({
        event,
        item: current,
        message:
          "No assignee or required approver is available; queue item was not unsnoozed.",
        newStatus,
      });
    }

    const missing = plans.filter((plan) => !plan.exists);
    const nextItem = {
      ...current,
      status: newStatus,
      snooze_until: undefined,
    };

    transaction.update(itemRef(db, current.id), {
      snooze_until: FieldValue.delete(),
      status: newStatus,
      updated_at: FieldValue.serverTimestamp(),
    });
    const activityId = uuidv7();

    transaction.set(db.collection(COLLECTIONS.queueActivity).doc(activityId), {
      id: activityId,
      item_id: current.id,
      actor_uid: SCHEDULED_ACTOR_UID,
      action: "unsnoozed",
      created_at: FieldValue.serverTimestamp(),
      previous_state: current.status,
      new_state: newStatus,
      reason: `Snooze date ${current.snooze_until} reached on ${referenceDate}.`,
      source_trigger: current.item_type,
    } satisfies Omit<ApprovalQueueActivityRecord, "created_at"> & {
      created_at: FieldValue;
    });
    writeMissingNotifications(transaction, db, nextItem, event, missing);

    return {
      event,
      item_id: current.id,
      message: "Queue item unsnoozed and scheduled console notifications processed.",
      new_status: newStatus,
      notification_ids: missing.map((plan) => plan.id),
      notifications_planned: 0,
      notifications_written: missing.length,
      outcome: "updated" as const,
      recipient_count: plans.length,
      skipped_notification_count: plans.length - missing.length,
    };
  });
}

async function writeOverdueNotification(
  db: Firestore,
  item: ApprovalQueueItemRecord,
  referenceDate: string,
): Promise<ScheduledApprovalQueueNotificationResultItem> {
  return db.runTransaction(async (transaction) => {
    const itemSnapshot = await transaction.get(itemRef(db, item.id));
    const current = readRequiredItem(itemSnapshot.id, itemSnapshot.data());
    const event: ScheduledEvent = "overdue";

    if (!isEligibleForOverdueNotification(current, referenceDate)) {
      return skippedResult({
        event,
        item: current,
        message: "Queue item is no longer eligible for an overdue notification.",
      });
    }

    const plans = await readNotificationPlansInTransaction(
      transaction,
      db,
      current,
      event,
      referenceDate,
    );

    if (plans.length === 0) {
      return skippedResult({
        event,
        item: current,
        message: "No assignee or required approver is available for this overdue item.",
      });
    }

    const missing = plans.filter((plan) => !plan.exists);

    if (missing.length === 0) {
      return skippedResult({
        event,
        item: current,
        message: "Scheduled overdue notifications already exist.",
        recipientCount: plans.length,
        skippedNotificationCount: plans.length,
      });
    }

    writeMissingNotifications(transaction, db, current, event, missing);

    return {
      event,
      item_id: current.id,
      message: "Scheduled overdue console notifications processed.",
      notification_ids: missing.map((plan) => plan.id),
      notifications_planned: 0,
      notifications_written: missing.length,
      outcome: "notified" as const,
      recipient_count: plans.length,
      skipped_notification_count: plans.length - missing.length,
    };
  });
}

async function readNotificationPlans(
  db: Firestore,
  item: ApprovalQueueItemRecord,
  event: ScheduledEvent,
  referenceDate: string,
): Promise<NotificationPlan[]> {
  const recipients = queueNotificationRecipientsForItem(item);
  const triggerDate = scheduledNotificationTriggerDate(item, event, referenceDate);

  return Promise.all(
    recipients.map(async (recipient) => {
      const id = scheduledQueueNotificationId({
        event,
        itemId: item.id,
        recipientUid: recipient.uid,
        triggerDate,
      });
      const snapshot = await notificationRef(db, id).get();

      return {
        exists: snapshot.exists,
        id,
        recipient_role: recipient.role,
        recipient_uid: recipient.uid,
      };
    }),
  );
}

async function readNotificationPlansInTransaction(
  transaction: Transaction,
  db: Firestore,
  item: ApprovalQueueItemRecord,
  event: ScheduledEvent,
  referenceDate: string,
): Promise<NotificationPlan[]> {
  const recipients = queueNotificationRecipientsForItem(item);
  const triggerDate = scheduledNotificationTriggerDate(item, event, referenceDate);

  return Promise.all(
    recipients.map(async (recipient) => {
      const id = scheduledQueueNotificationId({
        event,
        itemId: item.id,
        recipientUid: recipient.uid,
        triggerDate,
      });
      const snapshot = await transaction.get(notificationRef(db, id));

      return {
        exists: snapshot.exists,
        id,
        recipient_role: recipient.role,
        recipient_uid: recipient.uid,
      };
    }),
  );
}

function writeMissingNotifications(
  transaction: Transaction,
  db: Firestore,
  item: ApprovalQueueItemRecord,
  event: ScheduledEvent,
  plans: NotificationPlan[],
) {
  for (const plan of plans) {
    const record = {
      id: plan.id,
      item_id: item.id,
      event,
      recipient_uid: plan.recipient_uid,
      recipient_role: plan.recipient_role,
      title: queueNotificationTitle(event, item),
      message: queueNotificationMessage(event, item),
      process_run_ref: item.process_run_ref,
      status: item.status,
      risk: item.risk,
      direct_link: item.direct_link,
      created_at: FieldValue.serverTimestamp(),
      ...stripUndefined({
        due_date: item.due_date,
      }),
    } satisfies Omit<ApprovalQueueNotificationRecord, "created_at"> & {
      created_at: FieldValue;
    };

    transaction.set(notificationRef(db, plan.id), record);
  }
}

function skippedResult({
  event,
  item,
  message,
  newStatus,
  recipientCount = 0,
  skippedNotificationCount = 0,
}: {
  event: ScheduledEvent;
  item: ApprovalQueueItemRecord;
  message: string;
  newStatus?: QueueItemStatus;
  recipientCount?: number;
  skippedNotificationCount?: number;
}): ScheduledApprovalQueueNotificationResultItem {
  return {
    event,
    item_id: item.id,
    message,
    new_status: newStatus,
    notification_ids: [],
    notifications_planned: 0,
    notifications_written: 0,
    outcome: "skipped",
    recipient_count: recipientCount,
    skipped_notification_count: skippedNotificationCount,
  };
}

function isEligibleForUnsnooze(item: ApprovalQueueItemRecord, referenceDate: string) {
  return (
    item.status === "Snoozed" &&
    Boolean(item.snooze_until) &&
    item.snooze_until! <= referenceDate
  );
}

function isEligibleForOverdueNotification(
  item: ApprovalQueueItemRecord,
  referenceDate: string,
) {
  return (
    !isQueueItemTerminal(item.status) &&
    item.status !== "Snoozed" &&
    Boolean(item.due_date) &&
    item.due_date! < referenceDate
  );
}

function statusAfterUnsnooze(item: ApprovalQueueItemRecord): QueueItemStatus {
  if (item.risk === "Blocked" || !item.assignee_uid || !item.required_approver_uid) {
    return "Blocked";
  }

  return "Ready for Approval";
}

function scheduledNotificationTriggerDate(
  item: ApprovalQueueItemRecord,
  event: ScheduledEvent,
  referenceDate: string,
) {
  if (event === "unsnoozed") {
    return item.snooze_until ?? referenceDate;
  }

  return item.due_date ?? referenceDate;
}

async function readCollection<T>(db: Firestore, collection: string) {
  const snapshot = await db.collection(collection).get();
  return snapshot.docs.map((doc) => readRecord<T>(doc.id, doc.data()));
}

function itemRef(db: Firestore, id: string) {
  return db.collection(COLLECTIONS.queueItems).doc(id);
}

function notificationRef(db: Firestore, id: string) {
  return db.collection(COLLECTIONS.notifications).doc(id);
}

function readRequiredItem(id: string, data: Record<string, unknown> | undefined) {
  if (!data) {
    throw new Error("Queue item was not found.");
  }

  return readRecord<ApprovalQueueItemRecord>(id, data);
}

function readRecord<T>(id: string, data: Record<string, unknown>) {
  return normalizeFirestoreValue({ id, ...data }) as T;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;

    if (typeof toDate === "function") {
      return toDate.call(value).toISOString();
    }
  }

  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [
        key,
        normalizeFirestoreValue(childValue),
      ]),
    );
  }

  return value;
}

function stripUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function assertIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Scheduled queue notification date must be YYYY-MM-DD.");
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
