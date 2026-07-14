import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { readServerConfig, type ServerConfig } from "@/lib/config/server";
import { getAdminFirestore } from "@/lib/firestore/admin";
import type { NotificationLogRecord } from "@/lib/firestore/types";

const COLLECTIONS = {
  notificationLogs: "notification_logs",
} as const;

export interface ApprovalNotificationItem {
  entityId: string;
  entityType: "sop" | "template" | "placeholder";
  event: "entered_queue" | "approved" | "resolved" | "returned";
  spaceId: string;
  spaceName: string;
  status: string;
  title: string;
}

export interface GmailSender {
  send(input: {
    html: string;
    recipients: string[];
    sender: string;
    subject: string;
  }): Promise<void>;
}

export interface NotificationLogWriter {
  write(input: Omit<NotificationLogRecord, "created_at" | "id">): Promise<void>;
}

export class FirestoreNotificationLogWriter implements NotificationLogWriter {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async write(input: Omit<NotificationLogRecord, "created_at" | "id">) {
    const id = uuidv7();

    await this.db
      .collection(COLLECTIONS.notificationLogs)
      .doc(id)
      .set({
        id,
        ...stripUndefined(input),
        created_at: FieldValue.serverTimestamp(),
      });
  }
}

export async function notifyApprovalQueueChange(
  actor: AuthenticatedUser,
  item: ApprovalNotificationItem,
  options: {
    config?: ServerConfig;
    logWriter?: NotificationLogWriter;
    sender?: GmailSender;
  } = {},
) {
  const config = options.config ?? readServerConfig();
  const logWriter = options.logWriter ?? new FirestoreNotificationLogWriter();
  const subject = `[${config.kbApprovalLabel}] ${item.spaceName}: ${item.title}`;
  const recipients = config.kbApprovalRecipients;
  const senderAddress = config.kbApprovalSender;
  const baseLog = {
    channel: "Gmail" as const,
    entity_id: item.entityId,
    entity_type: item.entityType,
    event: item.event,
    recipients,
    sender: senderAddress,
    subject,
  };

  if (!config.kbApprovalNotificationsEnabled) {
    return;
  }

  // This legacy hook is event-triggered and therefore cannot satisfy the exact-message,
  // human-confirmed Gmail boundary. Keep the call site observable, but never construct a
  // sender or attempt delivery. Approval attention is in-app only.
  void actor;
  void options.sender;
  await writeLogSafely(logWriter, {
    ...baseLog,
    error:
      "Automatic Gmail approval notifications are disabled by governance; use in-app notifications.",
    status: "Skipped",
  });
}

export function notificationSetupError(config: ServerConfig) {
  const missing = [
    !config.kbApprovalSender ? "KB_APPROVAL_SENDER" : null,
    config.kbApprovalRecipients.length === 0 ? "KB_APPROVAL_RECIPIENTS" : null,
    !config.appBaseUrl ? "APP_BASE_URL" : null,
  ].filter(Boolean);

  return missing.length > 0
    ? `Missing approval notification setup: ${missing.join(", ")}.`
    : null;
}

async function writeLogSafely(
  logWriter: NotificationLogWriter,
  input: Omit<NotificationLogRecord, "created_at" | "id">,
) {
  try {
    await logWriter.write(input);
  } catch (error) {
    console.error(
      error instanceof Error
        ? `Approval notification log failed: ${error.message}`
        : "Approval notification log failed.",
    );
  }
}

function stripUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
