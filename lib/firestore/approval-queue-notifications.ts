import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { isQueueItemTerminal } from "@/lib/approval/queue";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  UpdateApprovalQueueEmailSettingInputSchema,
  type UpdateApprovalQueueEmailSettingInput,
} from "@/lib/firestore/schemas";
import type {
  ApprovalQueueEmailSettingRecord,
  ApprovalQueueItemRecord,
  ApprovalQueueNotificationHealth,
  ApprovalQueueNotificationRecord,
  NotificationLogRecord,
  QueueActivityAction,
  QueueEmailSettingEvent,
  QueueNotificationEvent,
  QueueNotificationRecipientRole,
} from "@/lib/firestore/types";

const COLLECTIONS = {
  emailSettings: "approval_queue_email_settings",
  notificationLogs: "notification_logs",
  notifications: "approval_queue_notifications",
  queueItems: "approval_queue_items",
} as const;

// F-APPR-3: the recipient of last resort for a queue item that has no assignee and no approver. It is
// not a real user id; Admins reach it through their role (canViewNotification), and no single person
// "owns" it, so it never lands in a specific user's "mine only" list.
export const APPROVAL_QUEUE_TRIAGE_UID = "approval-queue-triage";

const DEFAULT_QUEUE_EMAIL_SETTINGS: ApprovalQueueEmailSettingRecord[] = [
  defaultSetting({
    event: "created",
    subject: "[Approval Queue] New item needs review",
    trigger: "A queue item is created for review.",
  }),
  defaultSetting({
    event: "assigned",
    subject: "[Approval Queue] Assignment changed",
    trigger: "A queue item's assignee or required approver changes.",
  }),
  defaultSetting({
    event: "returned_for_revision",
    subject: "[Approval Queue] Item returned for revision",
    trigger: "A queue item is returned with a reason.",
  }),
  defaultSetting({
    event: "unsnoozed",
    subject: "[Approval Queue] Snoozed item is active again",
    trigger: "A snoozed item returns to the active queue.",
  }),
  defaultSetting({
    event: "blocked",
    subject: "[Approval Queue] Item is blocked",
    trigger:
      "A queue item cannot proceed because evidence, permission, or ownership is missing.",
  }),
  defaultSetting({
    event: "unblocked",
    subject: "[Approval Queue] Item is ready again",
    trigger: "A blocked item becomes ready for review.",
  }),
  defaultSetting({
    event: "overdue",
    subject: "[Approval Queue] Item is overdue",
    trigger: "A queue item is past its due date.",
  }),
  defaultSetting({
    event: "closed",
    subject: "[Approval Queue] Item closed",
    trigger: "A queue item is approved, disabled, cancelled, completed, or closed.",
  }),
  defaultSetting({
    emailEnabled: true,
    event: "blocked_overdue_escalation",
    recipientRoles: ["Assignee", "Required approver", "Admin selected"],
    subject: "[Approval Queue] Action required",
    trigger: "An unresolved important Blocked or overdue queue item needs escalation.",
  }),
];

export type QueueNotificationItem = Pick<
  ApprovalQueueItemRecord,
  | "action_needed"
  | "direct_link"
  | "due_date"
  | "id"
  | "process_run_ref"
  | "required_approver_uid"
  | "assignee_uid"
  | "risk"
  | "status"
>;

interface AppendQueueNotificationInput {
  action: QueueActivityAction;
  actor: Pick<AuthenticatedUser, "uid">;
  item: QueueNotificationItem;
  newState?: string;
}

export interface ListApprovalQueueNotificationsOptions {
  itemId?: string;
  limit?: number;
  /**
   * LR-02 (fail-closed default): the reader returns only the caller's OWN notifications unless this is
   * explicitly set. Broad, cross-recipient visibility (the Admin monitoring view) is an opt-in AND is
   * additionally gated on the Admin capability inside the reader, so a caller that forgets to narrow the
   * query can never leak another user's notifications, and a non-Admin can never widen it.
   */
  adminAll?: boolean;
  unreadOnly?: boolean;
}

export function appendApprovalQueueNotificationsForActivity(
  transaction: Transaction,
  db: Firestore,
  input: AppendQueueNotificationInput,
) {
  const event = queueNotificationEventForActivity(input.action, input.newState);

  if (!event) {
    return;
  }

  const item = input.item;
  const recipients = queueNotificationRecipientsForItem(item);

  for (const recipient of recipients) {
    const id = uuidv7();

    transaction.set(db.collection(COLLECTIONS.notifications).doc(id), {
      id,
      item_id: item.id,
      event,
      recipient_uid: recipient.uid,
      recipient_role: recipient.role,
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
    });
  }
}

export function queueNotificationEventForActivity(
  action: QueueActivityAction,
  newState?: string,
): QueueNotificationEvent | null {
  if (newState === "Blocked") {
    return "blocked";
  }

  switch (action) {
    case "created":
      return "created";
    case "assigned":
      return "assigned";
    case "returned":
      return "returned_for_revision";
    case "unsnoozed":
      return "unsnoozed";
    case "unblocked":
      return "unblocked";
    case "approved":
    case "disabled":
    case "closed":
      return "closed";
    default:
      return null;
  }
}

export function readDefaultApprovalQueueEmailSettings() {
  return structuredClone(DEFAULT_QUEUE_EMAIL_SETTINGS);
}

export async function listApprovalQueueNotifications(
  actor: AuthenticatedUser,
  options: ListApprovalQueueNotificationsOptions = {},
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  const snapshot = await db.collection(COLLECTIONS.notifications).get();
  const limit = options.limit ?? 25;
  // LR-02: recipient-only is the DEFAULT. The broad cross-recipient view is an explicit opt-in that ALSO
  // requires the Admin capability, so a forgotten flag can never leak another user's items and a
  // non-Admin asking for `adminAll` is silently narrowed back to their own.
  const includeAllRecipients =
    options.adminAll === true && can(actor.role, "manageAdmin");

  return snapshot.docs
    .map((doc) => readRecord<ApprovalQueueNotificationRecord>(doc.id, doc.data()))
    .filter((notification) => canViewNotification(actor, notification))
    .filter((notification) =>
      includeAllRecipients ? true : notification.recipient_uid === actor.uid,
    )
    .filter((notification) =>
      options.itemId ? notification.item_id === options.itemId : true,
    )
    .filter((notification) => (options.unreadOnly ? !notification.read_at : true))
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit);
}

export async function markApprovalQueueNotificationRead(
  actor: AuthenticatedUser,
  notificationId: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");

  await db.runTransaction(async (transaction) => {
    const ref = db.collection(COLLECTIONS.notifications).doc(notificationId);
    const snapshot = await transaction.get(ref);
    const notification = readRequiredNotification(snapshot.id, snapshot.data());

    if (notification.recipient_uid !== actor.uid) {
      throw new EditableLayerError(
        "Only the notification recipient can mark this notification read.",
        403,
      );
    }

    if (notification.read_at) {
      return;
    }

    transaction.update(ref, {
      read_at: FieldValue.serverTimestamp(),
    });
  });

  const updated = await db
    .collection(COLLECTIONS.notifications)
    .doc(notificationId)
    .get();
  return readRequiredNotification(updated.id, updated.data());
}

export async function listApprovalQueueEmailSettings(
  actor: AuthenticatedUser,
  db = getAdminFirestore(),
) {
  assertAdmin(actor, "Only Admins can view approval queue email settings.");
  const snapshot = await db.collection(COLLECTIONS.emailSettings).get();
  const overrides = new Map(
    snapshot.docs.map((doc) => [
      doc.id,
      readRecord<ApprovalQueueEmailSettingRecord>(doc.id, doc.data()),
    ]),
  );

  return readDefaultApprovalQueueEmailSettings().map((setting) => ({
    ...setting,
    ...stripUndefined(overrides.get(setting.id) ?? {}),
    id: setting.id,
    event_type: setting.event_type,
  }));
}

export async function updateApprovalQueueEmailSetting(
  actor: AuthenticatedUser,
  settingId: string,
  input: UpdateApprovalQueueEmailSettingInput,
  db = getAdminFirestore(),
) {
  assertAdmin(actor, "Only Admins can update approval queue email settings.");
  const base = readDefaultApprovalQueueEmailSettings().find(
    (setting) => setting.id === settingId,
  );

  if (!base) {
    throw new EditableLayerError("Approval queue email setting was not found.", 404);
  }

  const parsed = UpdateApprovalQueueEmailSettingInputSchema.parse(input);
  const existingSnapshot = await db
    .collection(COLLECTIONS.emailSettings)
    .doc(settingId)
    .get();
  const existing = existingSnapshot.data()
    ? readRecord<ApprovalQueueEmailSettingRecord>(
        existingSnapshot.id,
        existingSnapshot.data()!,
      )
    : base;
  const record = {
    ...existing,
    ...stripUndefined(parsed),
    id: base.id,
    event_type: base.event_type,
    updated_at: FieldValue.serverTimestamp(),
    updated_by_uid: actor.uid,
  };

  await db.collection(COLLECTIONS.emailSettings).doc(settingId).set(record);

  const saved = await db.collection(COLLECTIONS.emailSettings).doc(settingId).get();
  return readRecord<ApprovalQueueEmailSettingRecord>(saved.id, saved.data()!);
}

export async function readApprovalQueueNotificationHealth({
  actor,
  db = getAdminFirestore(),
  referenceDate = today(),
}: {
  actor: AuthenticatedUser;
  db?: Firestore;
  referenceDate?: string;
}) {
  assertAdmin(actor, "Only Admins can view approval queue notification health.");
  const [items, notificationLogs, settings] = await Promise.all([
    readCollection<ApprovalQueueItemRecord>(db, COLLECTIONS.queueItems),
    readCollection<NotificationLogRecord>(db, COLLECTIONS.notificationLogs),
    listApprovalQueueEmailSettings(actor, db),
  ]);

  return buildApprovalQueueNotificationHealth({
    items,
    notificationLogs,
    referenceDate,
    settings,
  });
}

export function buildApprovalQueueNotificationHealth({
  items,
  notificationLogs,
  referenceDate = today(),
  settings,
}: {
  items: ApprovalQueueItemRecord[];
  notificationLogs: NotificationLogRecord[];
  referenceDate?: string;
  settings: ApprovalQueueEmailSettingRecord[];
}): ApprovalQueueNotificationHealth {
  const activeItems = items.filter((item) => !isQueueItemTerminal(item.status));
  const staleOverdueItems = activeItems.filter(
    (item) => Boolean(item.due_date) && item.due_date! < referenceDate,
  );
  const blockedItems = activeItems.filter((item) => item.status === "Blocked");
  const blockedHighRiskItems = blockedItems.filter(
    (item) => item.risk === "High" || item.risk === "Blocked",
  );
  const failedLogs = notificationLogs
    .filter((log) => log.status === "Failed")
    .sort((left, right) => (right.created_at ?? "").localeCompare(left.created_at ?? ""));
  const disabledEventTypes = settings
    .filter((setting) => !setting.email_enabled)
    .map((setting) => setting.event_type);
  // v1 is in-app only (D7): Gmail delivery is hard-disabled, so the email channel is never a setup
  // problem to fix and never a reason the queue "needs action". Any historical delivery failure is
  // still surfaced, and blocked/overdue items still drive attention on their own merits.
  const actionRequiredReasons = [
    failedLogs.length > 0 ? "At least one approval notification delivery failed." : null,
    blockedHighRiskItems.length > 0
      ? `${blockedHighRiskItems.length} blocked queue item(s) need Admin review.`
      : null,
  ].filter((reason): reason is string => Boolean(reason));
  const needsAttentionReasons = [
    staleOverdueItems.length > 0
      ? `${staleOverdueItems.length} active queue item(s) are overdue.`
      : null,
    blockedItems.length > blockedHighRiskItems.length
      ? `${blockedItems.length - blockedHighRiskItems.length} blocked queue item(s) need triage.`
      : null,
  ].filter((reason): reason is string => Boolean(reason));
  const status =
    actionRequiredReasons.length > 0
      ? "Action Required"
      : needsAttentionReasons.length > 0
        ? "Needs Attention"
        : "Healthy";
  const lastFailure = failedLogs.at(0);

  return {
    action_required_reasons: actionRequiredReasons,
    blocked_high_risk_count: blockedHighRiskItems.length,
    blocked_item_count: blockedItems.length,
    disabled_event_types: disabledEventTypes,
    failed_delivery_count: failedLogs.length,
    last_failure: lastFailure
      ? stripUndefined({
          created_at: lastFailure.created_at,
          error: lastFailure.error,
          subject: lastFailure.subject,
        })
      : undefined,
    needs_attention_reasons: needsAttentionReasons,
    queue_email_status: "In-App Only",
    stale_overdue_count: staleOverdueItems.length,
    status,
  };
}

function defaultSetting({
  emailEnabled = false,
  event,
  recipientRoles = ["Assignee", "Required approver"],
  subject,
  trigger,
}: {
  emailEnabled?: boolean;
  event: QueueEmailSettingEvent;
  recipientRoles?: QueueNotificationRecipientRole[];
  subject: string;
  trigger: string;
}): ApprovalQueueEmailSettingRecord {
  return {
    cooldown_hours: 0,
    email_enabled: emailEnabled,
    event_type: event,
    id: event,
    recipient_roles: recipientRoles,
    subject_preview: subject,
    trigger_condition: trigger,
    updated_at: "default",
  };
}

export function queueNotificationRecipientsForItem(item: QueueNotificationItem) {
  const recipients: Array<{
    role: QueueNotificationRecipientRole;
    uid: string;
  }> = [];

  if (item.assignee_uid) {
    recipients.push({ role: "Assignee", uid: item.assignee_uid });
  }

  if (item.required_approver_uid && item.required_approver_uid !== item.assignee_uid) {
    recipients.push({
      role: "Required approver",
      uid: item.required_approver_uid,
    });
  }

  // F-APPR-3: an item with neither an assignee nor an approver (a Blocked-on-creation item) would
  // otherwise notify no one and sit silently unowned. Route it to the shared Admin triage recipient
  // so someone always sees it. Admins can view every triage notification (see canViewNotification);
  // the sentinel uid keeps it out of any single person's "mine" list because it belongs to no one yet.
  if (recipients.length === 0) {
    recipients.push({ role: "Admin selected", uid: APPROVAL_QUEUE_TRIAGE_UID });
  }

  return recipients;
}

export function queueNotificationTitle(
  event: QueueNotificationEvent,
  item: QueueNotificationItem,
) {
  const label: Record<QueueNotificationEvent, string> = {
    assigned: "Assignment changed",
    blocked: "Blocked item",
    closed: "Queue item closed",
    created: "New queue item",
    overdue: "Overdue queue item",
    returned_for_revision: "Returned for revision",
    unblocked: "Ready again",
    unsnoozed: "Active again",
  };

  return `${label[event]}: ${item.process_run_ref.label}`;
}

export function queueNotificationMessage(
  event: QueueNotificationEvent,
  item: QueueNotificationItem,
) {
  const prefix: Record<QueueNotificationEvent, string> = {
    assigned: "Review the updated assignment.",
    blocked: "This item needs triage before it can move forward.",
    closed: "No action is needed unless the underlying facts change.",
    created: "Review the requested approval action.",
    overdue: "This item is past its due date.",
    returned_for_revision: "Review the return reason and revise the item.",
    unblocked: "The blocker was cleared and the item is ready again.",
    unsnoozed: "The snooze period ended and the item is active again.",
  };

  return `${prefix[event]} Action needed: ${item.action_needed}`;
}

function canViewNotification(
  actor: AuthenticatedUser,
  notification: ApprovalQueueNotificationRecord,
) {
  return actor.role === "Admin" || notification.recipient_uid === actor.uid;
}

async function readCollection<T>(db: Firestore, collection: string) {
  const snapshot = await db.collection(collection).get();
  return snapshot.docs.map((doc) => readRecord<T>(doc.id, doc.data()));
}

function readRecord<T>(id: string, data: Record<string, unknown>) {
  return normalizeFirestoreValue({ id, ...data }) as T;
}

function readRequiredNotification(id: string, data: Record<string, unknown> | undefined) {
  if (!data) {
    throw new EditableLayerError("Approval Queue notification was not found.", 404);
  }

  return readRecord<ApprovalQueueNotificationRecord>(id, data);
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

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for approval queue notifications.",
      403,
    );
  }
}

function assertAdmin(actor: AuthenticatedUser, message: string) {
  if (!can(actor.role, "manageAdmin")) {
    throw new EditableLayerError(message, 403);
  }
}

function stripUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
