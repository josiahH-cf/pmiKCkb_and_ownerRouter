import { randomBytes } from "node:crypto";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertAuthenticatedSender,
  GmailOutgoingMessageSchema,
  hashConfirmationToken,
  hashGmailPayload,
  PrepareGmailMessageSchema,
  type PrepareGmailMessageInput,
} from "@/lib/gmail-hub/contracts";
import type {
  GmailConfirmationRecord,
  GmailStateStore,
} from "@/lib/gmail-hub/state-store";
import {
  createRfcMessageId,
  GmailRuntimeClient,
  GmailRuntimeError,
} from "@/lib/gmail-runtime/client";
import type {
  GmailOutgoingMessage,
  GmailSendResult,
  GmailThreadList,
  GmailThreadView,
} from "@/lib/gmail-runtime/types";

export const GMAIL_HUB_ACTIONS = {
  read: "gmail.mailbox.read",
  draft: "gmail.draft.create",
  send: "gmail.message.send",
  reply: "gmail.thread.reply",
  label: "gmail.label.apply",
} as const;

export interface GmailHubServiceDependencies {
  client: GmailRuntimeClient;
  store: GmailStateStore;
  isActionExecutable(action: string): boolean;
  now?(): number;
  createToken?(): string;
}

export class GmailHubService {
  private readonly now: () => number;
  private readonly createToken: () => string;
  private readonly mailboxEmail: string;

  constructor(
    private readonly actor: AuthenticatedUser,
    private readonly dependencies: GmailHubServiceDependencies,
  ) {
    if (dependencies.client.subject !== actor.email.trim().toLowerCase()) {
      throw new GmailHubError(
        "Gmail client subject did not match the signed-in user.",
        403,
      );
    }
    this.mailboxEmail = dependencies.client.subject;
    this.now = dependencies.now ?? Date.now;
    this.createToken =
      dependencies.createToken ?? (() => randomBytes(32).toString("base64url"));
  }

  async connection() {
    if (!this.canExecute(GMAIL_HUB_ACTIONS.read)) {
      return {
        status: "gated" as const,
        mailboxEmail: this.mailboxEmail,
        reason: "Waiting on Gmail access",
      };
    }
    const profile = await this.dependencies.client.getProfile();
    const mailboxState = await this.dependencies.store.getMailboxState(this.mailboxEmail);
    const nowMs = this.now();
    const pushDegraded = Boolean(
      mailboxState &&
      ((mailboxState.watch_expiration_ms ?? 0) <= nowMs ||
        (mailboxState.last_successful_sync_ms ?? 0) < nowMs - 24 * 60 * 60 * 1000),
    );
    return {
      status: "connected" as const,
      mailboxEmail: profile.emailAddress,
      profile,
      sync: mailboxState
        ? {
            health: pushDegraded ? ("degraded" as const) : mailboxState.health,
            lastSuccessfulSyncMs: mailboxState.last_successful_sync_ms ?? null,
            watchExpirationMs: mailboxState.watch_expiration_ms ?? null,
          }
        : {
            health: "manual" as const,
            lastSuccessfulSyncMs: null,
            watchExpirationMs: null,
          },
    };
  }

  async listThreads(
    options: {
      pageToken?: string;
      q?: string;
    } = {},
  ): Promise<GmailThreadList> {
    this.assertExecutable(GMAIL_HUB_ACTIONS.read);
    return this.dependencies.client.listThreads({
      maxResults: 20,
      labelIds: ["INBOX"],
      q: options.q?.trim() || "in:inbox newer_than:30d",
      ...(options.pageToken ? { pageToken: options.pageToken } : {}),
    });
  }

  async getThread(threadId: string): Promise<GmailThreadView> {
    this.assertExecutable(GMAIL_HUB_ACTIONS.read);
    return this.dependencies.client.getThread(threadId);
  }

  async createDraft(input: PrepareGmailMessageInput) {
    this.assertExecutable(GMAIL_HUB_ACTIONS.draft);
    const payload = await this.buildOutgoingPayload(
      PrepareGmailMessageSchema.parse(input),
    );
    assertAuthenticatedSender(payload, this.mailboxEmail);
    const result = await this.dependencies.client.createDraft(payload);
    return {
      status: "draft_created" as const,
      draftId: result.draftId,
      ...(result.messageId ? { messageId: result.messageId } : {}),
      ...(result.threadId ? { threadId: result.threadId } : {}),
    };
  }

  async prepareSendConfirmation(input: PrepareGmailMessageInput) {
    const parsed = PrepareGmailMessageSchema.parse(input);
    this.assertExecutable(
      parsed.kind === "reply" ? GMAIL_HUB_ACTIONS.reply : GMAIL_HUB_ACTIONS.send,
    );
    const payload = await this.buildOutgoingPayload(parsed);
    assertAuthenticatedSender(payload, this.mailboxEmail);
    const confirmationToken = this.createToken();
    const id = hashConfirmationToken(confirmationToken);
    const nowMs = this.now();
    const record: GmailConfirmationRecord = {
      id,
      actor_uid: this.actor.uid,
      mailbox_email: this.mailboxEmail,
      payload_hash: hashGmailPayload(payload),
      message_id: payload.messageId,
      message_kind: parsed.kind,
      state: "pending",
      expires_at_ms: nowMs + 10 * 60 * 1000,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
    };
    await this.dependencies.store.createConfirmation(record);
    return {
      confirmationToken,
      expiresAt: new Date(record.expires_at_ms).toISOString(),
      payload,
    };
  }

  async sendConfirmed(input: {
    confirmationToken: string;
    payload: GmailOutgoingMessage;
  }): Promise<{ status: "sent"; result: GmailSendResult; duplicate: boolean }> {
    const payload = GmailOutgoingMessageSchema.parse(input.payload);
    assertAuthenticatedSender(payload, this.mailboxEmail);
    this.assertExecutable(
      payload.threadId ? GMAIL_HUB_ACTIONS.reply : GMAIL_HUB_ACTIONS.send,
    );
    const id = hashConfirmationToken(input.confirmationToken);
    const nowMs = this.now();
    const claim = await this.dependencies.store.claimConfirmation({
      id,
      actorUid: this.actor.uid,
      payloadHash: hashGmailPayload(payload),
      nowMs,
    });

    if (claim.status === "sent") {
      return { status: "sent", result: claim.result, duplicate: true };
    }
    if (claim.status === "ambiguous") {
      throw new GmailAmbiguousSendError(
        "The prior send outcome is ambiguous. Reconcile its RFC Message-ID before any new attempt.",
      );
    }
    if (claim.status !== "claimed") {
      throw new GmailHubError(
        claimMessage(claim.status),
        claim.status === "mismatch" ? 403 : 409,
      );
    }

    try {
      const result = await this.dependencies.client.sendMessage(payload);
      await this.dependencies.store.markConfirmationSent({
        id,
        actorUid: this.actor.uid,
        result,
        nowMs: this.now(),
      });
      return { status: "sent", result, duplicate: false };
    } catch (error) {
      const ambiguous = !(error instanceof GmailRuntimeError) || error.ambiguous;
      await this.dependencies.store.markConfirmationOutcome({
        id,
        actorUid: this.actor.uid,
        state: ambiguous ? "ambiguous" : "failed",
        nowMs: this.now(),
      });
      if (ambiguous) {
        throw new GmailAmbiguousSendError(
          "Gmail did not return a definitive send result. No automatic retry was attempted.",
        );
      }
      throw new GmailHubError(
        "Gmail refused the send. The confirmation was consumed.",
        409,
      );
    }
  }

  async reconcileSend(confirmationToken: string) {
    this.assertExecutable(GMAIL_HUB_ACTIONS.read);
    const id = hashConfirmationToken(confirmationToken);
    const record = await this.dependencies.store.getConfirmation(id);
    if (!record || record.actor_uid !== this.actor.uid) {
      throw new GmailHubError("Gmail confirmation was not found for this user.", 403);
    }
    if (record.state === "sent" && record.gmail_message_id && record.gmail_thread_id) {
      return {
        status: "sent" as const,
        result: {
          messageId: record.gmail_message_id,
          threadId: record.gmail_thread_id,
          labelIds: [],
        },
      };
    }
    if (record.state !== "ambiguous") {
      throw new GmailHubError("Only an ambiguous send can be reconciled.", 409);
    }
    const result = await this.dependencies.client.findMessageByRfcMessageId(
      record.message_id,
    );
    if (!result) {
      return {
        status: "not_found" as const,
        reason: "No matching RFC Message-ID was found. The send remains blocked.",
      };
    }
    await this.dependencies.store.markConfirmationSent({
      id,
      actorUid: this.actor.uid,
      result,
      nowMs: this.now(),
      reconciled: true,
    });
    return { status: "sent" as const, result };
  }

  async watchMailbox(topicName: string) {
    this.assertExecutable(GMAIL_HUB_ACTIONS.read);
    const watch = await this.dependencies.client.watchMailbox(topicName);
    const nowMs = this.now();
    await this.dependencies.store.saveMailboxState({
      mailbox_email: this.mailboxEmail,
      user_uid: this.actor.uid,
      history_id: watch.historyId,
      watch_expiration_ms: Number(watch.expiration),
      health: "watching",
      updated_at_ms: nowMs,
      last_successful_sync_ms: nowMs,
    });
    return watch;
  }

  async applyThreadLabel(threadId: string, labelName: string) {
    this.assertExecutable(GMAIL_HUB_ACTIONS.label);
    return this.dependencies.client.applyThreadLabel(threadId, labelName);
  }

  private async buildOutgoingPayload(
    input: PrepareGmailMessageInput,
  ): Promise<GmailOutgoingMessage> {
    if (input.kind === "new") {
      return GmailOutgoingMessageSchema.parse({
        from: this.mailboxEmail,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        body: input.body,
        messageId: createRfcMessageId(this.mailboxEmail),
        references: [],
      });
    }

    this.assertExecutable(GMAIL_HUB_ACTIONS.read);
    const thread = await this.dependencies.client.getThread(input.threadId);
    const parent = thread.messages.at(-1);
    if (!parent?.messageId || !parent.subject) {
      throw new GmailHubError(
        "The live Gmail thread has no reply-safe parent headers.",
        409,
      );
    }
    const references = [...new Set([...parent.references, parent.messageId])].slice(-20);
    const replyRecipient = resolveReplyRecipient(parent, this.mailboxEmail);
    return GmailOutgoingMessageSchema.parse({
      from: this.mailboxEmail,
      to: [replyRecipient],
      cc: [],
      bcc: [],
      subject: parent.subject,
      body: input.body,
      messageId: createRfcMessageId(this.mailboxEmail),
      threadId: thread.id,
      inReplyTo: parent.messageId,
      references,
    });
  }

  private canExecute(action: string) {
    return this.dependencies.isActionExecutable(action);
  }

  private assertExecutable(action: string) {
    if (!this.canExecute(action)) {
      throw new GmailHubGateError(action);
    }
  }
}

function resolveReplyRecipient(
  parent: GmailThreadView["messages"][number],
  mailboxEmail: string,
): string {
  const candidates = [parent.from, ...parent.to, ...parent.cc]
    .map(extractEmailAddress)
    .filter((value): value is string => Boolean(value));
  return candidates.find((value) => value !== mailboxEmail) ?? mailboxEmail;
}

function extractEmailAddress(value: string): string | undefined {
  const normalized = value.trim();
  const angle = normalized.match(/<([^<>\s]+@[^<>\s]+)>/);
  const candidate = (angle?.[1] ?? normalized).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+$/.test(candidate) ? candidate : undefined;
}

export async function processGmailPushNotification(input: {
  messageId: string;
  mailboxEmail: string;
  historyId: string;
  store: GmailStateStore;
  client: GmailRuntimeClient;
  now?: () => number;
}) {
  const maxHistoryPages = 5;
  const now = input.now ?? Date.now;
  const nowMs = now();
  const mailboxState = await input.store.getMailboxState(input.mailboxEmail);
  if (!mailboxState || input.client.subject !== input.mailboxEmail) {
    throw new GmailHubError("Gmail push mailbox is not registered.", 403);
  }
  const claim = await input.store.claimPush({
    messageId: input.messageId,
    mailboxEmail: input.mailboxEmail,
    historyId: input.historyId,
    nowMs,
  });
  if (claim === "duplicate") return { status: "duplicate" as const, addedCount: 0 };

  try {
    let pageToken: string | undefined;
    let cursor = mailboxState.history_id;
    let addedCount = 0;
    for (let page = 0; page < maxHistoryPages; page += 1) {
      const result = await input.client.listHistory({
        startHistoryId: mailboxState.history_id,
        ...(pageToken ? { pageToken } : {}),
        maxResults: 100,
      });
      addedCount += result.messagesAdded.length;
      cursor = result.historyId;
      pageToken = result.nextPageToken;
      if (!pageToken) break;
    }
    if (pageToken) {
      return await boundedMailboxResync(input, now);
    }
    await input.store.completePush({
      messageId: input.messageId,
      mailboxEmail: input.mailboxEmail,
      historyId: cursor,
      addedCount,
      mode: "history",
      nowMs: now(),
    });
    return { status: "processed" as const, addedCount, historyId: cursor };
  } catch (error) {
    if (error instanceof GmailRuntimeError && error.status === 404) {
      try {
        return await boundedMailboxResync(input, now);
      } catch (resyncError) {
        await input.store.failPush({ messageId: input.messageId, nowMs: now() });
        throw resyncError;
      }
    }
    await input.store.failPush({ messageId: input.messageId, nowMs: now() });
    throw error;
  }
}

async function boundedMailboxResync(
  input: {
    messageId: string;
    mailboxEmail: string;
    store: GmailStateStore;
    client: GmailRuntimeClient;
  },
  now: () => number,
) {
  const [profile, list] = await Promise.all([
    input.client.getProfile(),
    input.client.listThreads({
      maxResults: 20,
      labelIds: ["INBOX"],
      q: "in:inbox newer_than:30d",
    }),
  ]);
  await input.store.completePush({
    messageId: input.messageId,
    mailboxEmail: input.mailboxEmail,
    historyId: profile.historyId,
    addedCount: list.threads.length,
    mode: "bounded_resync",
    nowMs: now(),
  });
  return {
    status: "bounded_resync" as const,
    addedCount: list.threads.length,
    historyId: profile.historyId,
  };
}

export class GmailHubError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 409 | 503,
  ) {
    super(message);
    this.name = "GmailHubError";
  }
}

export class GmailHubGateError extends GmailHubError {
  constructor(readonly action: string) {
    super(`Gmail action ${action} is not approved for production execution.`, 503);
    this.name = "GmailHubGateError";
  }
}

export class GmailAmbiguousSendError extends GmailHubError {
  constructor(message: string) {
    super(message, 409);
    this.name = "GmailAmbiguousSendError";
  }
}

function claimMessage(status: "expired" | "mismatch" | "in_progress" | "failed") {
  const messages = {
    expired: "The Gmail confirmation expired. Review the exact message again.",
    mismatch: "The Gmail confirmation does not match this user and exact payload.",
    in_progress: "This Gmail confirmation is already being processed.",
    failed: "This Gmail confirmation was already consumed by a failed attempt.",
  } as const;
  return messages[status];
}
