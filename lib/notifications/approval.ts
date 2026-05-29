import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";
import { v7 as uuidv7 } from "uuid";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { readServerConfig, type ServerConfig } from "@/lib/config/server";
import { getAdminFirestore } from "@/lib/firestore/admin";
import type { NotificationLogRecord } from "@/lib/firestore/types";

const COLLECTIONS = {
  notificationLogs: "notification_logs",
} as const;
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

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

export class GmailApiSender implements GmailSender {
  constructor(private readonly auth = new GoogleAuth({ scopes: [GMAIL_SEND_SCOPE] })) {}

  async send(input: {
    html: string;
    recipients: string[];
    sender: string;
    subject: string;
  }) {
    const client = await this.auth.getClient();
    const headers = await client.getRequestHeaders();
    const token = headers.get("Authorization") ?? headers.get("authorization");

    if (!token) {
      throw new Error("Gmail send failed before request: missing auth token.");
    }

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(input.sender)}/messages/send`,
      {
        body: JSON.stringify({ raw: encodeRawMessage(input) }),
        headers: {
          Authorization: String(token),
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );

    if (!response.ok) {
      throw new Error(`Gmail send failed with HTTP ${response.status}.`);
    }
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

  const setupError = notificationSetupError(config);

  if (setupError || !senderAddress || recipients.length === 0 || !config.appBaseUrl) {
    await writeLogSafely(logWriter, {
      ...baseLog,
      error:
        setupError ??
        "Missing approval notification setup: KB_APPROVAL_SENDER, KB_APPROVAL_RECIPIENTS, APP_BASE_URL.",
      status: "Skipped",
    });
    return;
  }

  try {
    await (options.sender ?? new GmailApiSender()).send({
      html: renderApprovalNotificationHtml(actor, item, config),
      recipients,
      sender: senderAddress,
      subject,
    });
    await writeLogSafely(logWriter, {
      ...baseLog,
      status: "Sent",
    });
  } catch (error) {
    await writeLogSafely(logWriter, {
      ...baseLog,
      error: error instanceof Error ? error.message : String(error),
      status: "Failed",
    });
  }
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

function renderApprovalNotificationHtml(
  actor: AuthenticatedUser,
  item: ApprovalNotificationItem,
  config: ServerConfig,
) {
  const queueUrl = `${config.appBaseUrl}/approval-queue`;

  return [
    "<p>A PMI KC KB approval item changed.</p>",
    "<ul>",
    `<li><strong>Space:</strong> ${escapeHtml(item.spaceName)}</li>`,
    `<li><strong>Item:</strong> ${escapeHtml(item.title)}</li>`,
    `<li><strong>Status:</strong> ${escapeHtml(item.status)}</li>`,
    `<li><strong>Changed by:</strong> ${escapeHtml(actor.email)}</li>`,
    "</ul>",
    `<p><a href="${escapeHtml(queueUrl)}">Open Approval Queue</a></p>`,
    "<p>This is an internal notification only. The KB does not send owner, tenant, vendor, or applicant email.</p>",
  ].join("");
}

function encodeRawMessage(input: {
  html: string;
  recipients: string[];
  sender: string;
  subject: string;
}) {
  const rawMessage = [
    `From: ${input.sender}`,
    `To: ${input.recipients.join(", ")}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    input.html,
  ].join("\r\n");

  return Buffer.from(rawMessage, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
