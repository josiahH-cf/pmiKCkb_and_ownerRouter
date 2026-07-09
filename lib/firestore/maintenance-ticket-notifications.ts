// PII-free maintenance-ticket notifications (console overhaul Slice 3b). The lifecycle notification
// twin for the maintenance ticket queue: when a ticket's status changes or it is assigned to another
// user, one notification lands for the ticket's assignee, written INSIDE the same atomic ticket
// transaction (never a separate best-effort write) so the audit twins commit together.
//
// GOVERNANCE: app-plane bookkeeping gated at the `read` capability for reads. The notification body
// is PII-FREE: only the event, the ticket status, the ticket id, and a `/maintenance` href; never a
// summary, unit label/address, reporter, or assignee identity. There is no email channel here and no
// send; the framework is in-app only. Timestamps are ISO strings (no serverTimestamp) so the writer
// is deterministic and unit-testable against a simple fake as well as the real Admin SDK.

import type { Firestore, Transaction } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { MaintenanceTicketStatus } from "@/lib/maintenance/ticket-model";

export const MAINTENANCE_TICKET_NOTIFICATION_COLLECTION =
  "maintenance_ticket_notifications";

export type MaintenanceTicketNotificationEvent =
  | "assigned"
  | "status_changed"
  | "closed"
  | "reopened";

export interface MaintenanceTicketNotificationRecord {
  id: string;
  ticket_id: string;
  event: MaintenanceTicketNotificationEvent;
  recipient_uid: string;
  title: string;
  message: string;
  ticket_status: MaintenanceTicketStatus;
  href: string;
  read_at?: string;
  created_at: string;
}

export interface AppendMaintenanceTicketNotificationInput {
  ticketId: string;
  event: MaintenanceTicketNotificationEvent;
  /** The ticket's current assignee. Empty/undefined means nobody to notify. */
  recipientUid?: string;
  actorUid: string;
  ticketStatus: MaintenanceTicketStatus;
  createdAt: string;
}

export interface ListMaintenanceTicketNotificationsOptions {
  unreadOnly?: boolean;
  limit?: number;
}

const NOTIFICATION_TITLES: Record<MaintenanceTicketNotificationEvent, string> = {
  assigned: "Maintenance ticket assigned",
  status_changed: "Maintenance ticket updated",
  closed: "Maintenance ticket closed",
  reopened: "Maintenance ticket reopened",
};

const NOTIFICATION_MESSAGES: Record<MaintenanceTicketNotificationEvent, string> = {
  assigned: "A maintenance ticket was assigned to you.",
  status_changed: "A maintenance ticket you are assigned was updated.",
  closed: "A maintenance ticket you are assigned was closed.",
  reopened: "A maintenance ticket you are assigned was reopened.",
};

// Queue exactly one PII-free notification for the ticket's assignee inside the caller's transaction.
// No-op when there is no assignee OR the assignee is the actor who made the change (no self-notify),
// so a ticket owner acting on their own ticket never notifies themselves.
export function appendMaintenanceTicketNotification(
  transaction: Transaction,
  db: Firestore,
  input: AppendMaintenanceTicketNotificationInput,
): void {
  const recipient = input.recipientUid?.trim();

  if (!recipient || recipient === input.actorUid) {
    return;
  }

  const id = uuidv7();
  const record: MaintenanceTicketNotificationRecord = {
    id,
    ticket_id: input.ticketId,
    event: input.event,
    recipient_uid: recipient,
    title: NOTIFICATION_TITLES[input.event],
    message: NOTIFICATION_MESSAGES[input.event],
    ticket_status: input.ticketStatus,
    href: "/maintenance",
    created_at: input.createdAt,
  };

  transaction.set(
    db.collection(MAINTENANCE_TICKET_NOTIFICATION_COLLECTION).doc(id),
    record,
  );
}

export async function listMaintenanceTicketNotifications(
  actor: AuthenticatedUser,
  options: ListMaintenanceTicketNotificationsOptions = {},
  db: Firestore = getAdminFirestore(),
): Promise<MaintenanceTicketNotificationRecord[]> {
  assertCan(actor, "read");
  const snapshot = await db.collection(MAINTENANCE_TICKET_NOTIFICATION_COLLECTION).get();
  const limit = options.limit ?? 25;

  return snapshot.docs
    .map((doc) => readRecord<MaintenanceTicketNotificationRecord>(doc.id, doc.data()))
    .filter((notification) => notification.recipient_uid === actor.uid)
    .filter((notification) => (options.unreadOnly ? !notification.read_at : true))
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit);
}

export async function markMaintenanceTicketNotificationRead(
  actor: AuthenticatedUser,
  notificationId: string,
  db: Firestore = getAdminFirestore(),
): Promise<MaintenanceTicketNotificationRecord> {
  assertCan(actor, "read");
  const ref = db
    .collection(MAINTENANCE_TICKET_NOTIFICATION_COLLECTION)
    .doc(notificationId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      throw new EditableLayerError("That notification does not exist.", 404);
    }
    const notification = readRecord<MaintenanceTicketNotificationRecord>(
      snapshot.id,
      snapshot.data()!,
    );
    if (notification.recipient_uid !== actor.uid) {
      throw new EditableLayerError(
        "Only the notification recipient can mark this notification read.",
        403,
      );
    }
    if (notification.read_at) {
      return notification;
    }
    const updated: MaintenanceTicketNotificationRecord = {
      ...notification,
      read_at: nowIso(),
    };
    transaction.set(ref, updated);
    return updated;
  });
}

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for maintenance-ticket notifications.",
      403,
    );
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function readRecord<T>(id: string, data: Record<string, unknown>): T {
  return normalizeFirestoreValue({ ...data, id }) as T;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      return (toDate.call(value) as Date).toISOString();
    }
  }
  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeFirestoreValue(child)]),
    );
  }
  return value;
}
