import { createHash, randomBytes } from "node:crypto";
import { v7 as uuidv7 } from "uuid";

import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { DRAFT_BANNER } from "@/lib/constants";
import {
  ApplyGmailLabelSchema,
  assertAuthenticatedSender,
  GmailOutgoingMessageSchema,
  hashConfirmationToken,
  hashGmailPayload,
  type PrepareGmailMessageInput,
  WorkflowPrepareGmailMessageSchema,
  type WorkflowPrepareGmailMessageInput,
} from "@/lib/gmail-hub/contracts";
import type {
  GmailConfirmationRecord,
  GmailStateStore,
} from "@/lib/gmail-hub/state-store";
import { gmailMailboxKey } from "@/lib/gmail-hub/state-store";
import {
  communicationsRetentionFields,
  GMAIL_CONFIRMATION_USABILITY_MS,
} from "@/lib/gmail-hub/retention-policy";
import {
  workflowActionContextKey,
  type WorkflowCommunicationContext,
  type WorkflowCommunicationLink,
} from "@/lib/gmail-hub/workflow-context";
import {
  createRfcMessageId,
  GmailRuntimeClient,
  GmailRuntimeError,
} from "@/lib/gmail-runtime/client";
import type {
  GmailOutgoingMessage,
  GmailSendResult,
  GmailThreadView,
} from "@/lib/gmail-runtime/types";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { validatePreviewPayload } from "@/lib/integrations/preview-payload";

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
  workflowLinkTtlDays?: number;
  isApprovedWorkflowTemplate?(context: WorkflowCommunicationContext): boolean;
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

  async listCommunications(): Promise<WorkflowCommunicationLink[]> {
    this.assertExecutable(GMAIL_HUB_ACTIONS.read);
    const nowMs = this.now();
    return (
      await this.dependencies.store.listCommunicationLinks(this.mailboxEmail)
    ).filter(
      (link) =>
        link.actor_uid === this.actor.uid &&
        hasSpaceAccess(this.actor, link.lane) &&
        link.expires_at_ms > nowMs,
    );
  }

  async linkExistingThread(input: {
    context: WorkflowCommunicationContext;
    threadId: string;
    reason: string;
  }) {
    this.assertExecutable(GMAIL_HUB_ACTIONS.read);
    this.assertContextAction(input.context, GMAIL_HUB_ACTIONS.read);
    if (!input.reason.trim()) {
      throw new GmailHubError("A reason is required to link a Gmail thread.", 409);
    }
    // The targeted read proves the opaque id belongs to this signed-in mailbox. Its content is returned
    // transiently by Gmail but is neither logged nor persisted by the link operation.
    const thread = await this.dependencies.client.getThread(input.threadId);
    await this.saveCommunicationLink(input.context, {
      threadId: thread.id,
      status: "linked",
      reasonHash: hashOperationalReason(input.reason),
    });
    return { status: "linked" as const, threadId: thread.id };
  }

  async getThread(
    threadId: string,
    context: WorkflowCommunicationContext,
  ): Promise<GmailThreadView> {
    this.assertExecutable(GMAIL_HUB_ACTIONS.read);
    this.assertContextAction(context, GMAIL_HUB_ACTIONS.read);
    await this.assertLinkedThread(threadId, context);
    return this.dependencies.client.getThread(threadId);
  }

  async createDraft(input: WorkflowPrepareGmailMessageInput) {
    this.assertExecutable(GMAIL_HUB_ACTIONS.draft);
    const parsed = WorkflowPrepareGmailMessageSchema.parse(input);
    this.assertContextAction(parsed.context, GMAIL_HUB_ACTIONS.draft);
    if (parsed.message.kind !== "reply" || !parsed.context.templateRef) {
      throw new GmailHubError(
        "Workflow Gmail drafts require a linked thread and approved template reference.",
        409,
      );
    }
    this.assertApprovedTemplate(parsed.context);
    await this.assertLinkedThread(parsed.message.threadId, parsed.context);
    assertRegistryPreview(GMAIL_HUB_ACTIONS.draft, {
      thread_ref: parsed.message.threadId,
      workflow_context: workflowActionContextKey(parsed.context),
      template_ref: parsed.context.templateRef,
      draft_body: parsed.message.body,
      draft_banner_present: parsed.message.body.startsWith(DRAFT_BANNER),
    });
    const payload = await this.buildOutgoingPayload(parsed.message, parsed.context);
    assertAuthenticatedSender(payload, this.mailboxEmail);
    const result = await this.dependencies.client.createDraft(payload);
    await this.saveCommunicationLink(parsed.context, {
      draftId: result.draftId,
      messageId: result.messageId,
      threadId: result.threadId ?? parsed.message.threadId,
      status: "draft_created",
    });
    return {
      status: "draft_created" as const,
      draftId: result.draftId,
      ...(result.messageId ? { messageId: result.messageId } : {}),
      ...(result.threadId ? { threadId: result.threadId } : {}),
    };
  }

  async prepareSendConfirmation(input: WorkflowPrepareGmailMessageInput) {
    const parsed = WorkflowPrepareGmailMessageSchema.parse(input);
    if (parsed.message.kind !== "reply" || !parsed.context.templateRef) {
      throw new GmailHubError(
        "New-message sending is not exposed by Workflow Communications; use an approved unsent workflow draft.",
        409,
      );
    }
    this.assertExecutable(GMAIL_HUB_ACTIONS.reply);
    this.assertContextAction(parsed.context, GMAIL_HUB_ACTIONS.reply);
    this.assertApprovedTemplate(parsed.context);
    const payload = await this.buildOutgoingPayload(parsed.message, parsed.context);
    assertAuthenticatedSender(payload, this.mailboxEmail);
    assertRegistryPreview(GMAIL_HUB_ACTIONS.reply, {
      workflow_context: workflowActionContextKey(parsed.context),
      template_ref: parsed.context.templateRef,
      from: payload.from,
      recipients: [...payload.to, ...payload.cc, ...payload.bcc].join(", "),
      subject: payload.subject,
      body: payload.body,
      thread_ref: payload.threadId,
      rfc_message_id: payload.messageId,
    });
    const confirmationToken = this.createToken();
    const id = hashConfirmationToken(confirmationToken);
    const nowMs = this.now();
    const record: GmailConfirmationRecord = {
      id,
      actor_uid: this.actor.uid,
      mailbox_email: this.mailboxEmail,
      payload_hash: hashGmailPayload(payload),
      message_id: payload.messageId,
      message_kind: parsed.message.kind,
      workflow_context_key: workflowActionContextKey(parsed.context),
      workflow_lane: parsed.context.lane,
      workflow_entity_type: parsed.context.entityType,
      workflow_entity_id: parsed.context.entityId,
      workflow_purpose: parsed.context.purpose,
      template_ref: parsed.context.templateRef,
      state: "pending",
      usable_until_ms: nowMs + GMAIL_CONFIRMATION_USABILITY_MS,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
      ...communicationsRetentionFields("confirmation", nowMs),
    };
    await this.dependencies.store.createConfirmation(record);
    return {
      context: parsed.context,
      confirmationToken,
      expiresAt: new Date(record.usable_until_ms).toISOString(),
      payload,
    };
  }

  async sendConfirmed(input: {
    context: WorkflowCommunicationContext;
    confirmationToken: string;
    payload: GmailOutgoingMessage;
  }): Promise<{ status: "sent"; result: GmailSendResult; duplicate: boolean }> {
    const payload = GmailOutgoingMessageSchema.parse(input.payload);
    assertAuthenticatedSender(payload, this.mailboxEmail);
    if (!payload.threadId) {
      throw new GmailHubError("Workflow Communications sends linked replies only.", 409);
    }
    this.assertExecutable(GMAIL_HUB_ACTIONS.reply);
    this.assertContextAction(input.context, GMAIL_HUB_ACTIONS.reply);
    const linked = await this.assertLinkedThread(payload.threadId, input.context);
    const id = hashConfirmationToken(input.confirmationToken);
    const nowMs = this.now();
    const claim = await this.dependencies.store.claimConfirmation({
      id,
      actorUid: this.actor.uid,
      payloadHash: hashGmailPayload(payload),
      workflowContextKey: workflowActionContextKey(input.context),
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
      await this.dependencies.store.saveCommunicationLink({
        ...linked,
        status: "sent",
        gmail_message_id: result.messageId,
        gmail_thread_id: result.threadId,
        updated_at_ms: this.now(),
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

  async reconcileSend(confirmationToken: string, context: WorkflowCommunicationContext) {
    this.assertExecutable(GMAIL_HUB_ACTIONS.read);
    this.assertContextAction(context, GMAIL_HUB_ACTIONS.reply);
    const id = hashConfirmationToken(confirmationToken);
    const record = await this.dependencies.store.getConfirmation(id);
    if (
      !record ||
      record.actor_uid !== this.actor.uid ||
      record.workflow_context_key !== workflowActionContextKey(context)
    ) {
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

  async applyThreadLabel(
    threadId: string,
    input: {
      context: WorkflowCommunicationContext;
      label: string;
      reason: string;
      ruleRef: string;
    },
  ) {
    const parsed = ApplyGmailLabelSchema.parse(input);
    this.assertExecutable(GMAIL_HUB_ACTIONS.label);
    this.assertContextAction(parsed.context, GMAIL_HUB_ACTIONS.label);
    const linked = await this.assertLinkedThread(threadId, parsed.context);
    assertRegistryPreview(GMAIL_HUB_ACTIONS.label, {
      thread_ref: threadId,
      workflow_context: workflowActionContextKey(parsed.context),
      suggested_label: parsed.label,
      rule_ref: parsed.ruleRef,
      reason: parsed.reason,
    });
    const result = await this.dependencies.client.applyThreadLabel(
      threadId,
      parsed.label,
    );
    await this.dependencies.store.appendWorkflowActionAudit({
      actorUid: this.actor.uid,
      mailboxEmail: this.mailboxEmail,
      communicationId: linked.id,
      context: parsed.context,
      action: "label_applied",
      threadId,
      label: parsed.label,
      ruleRef: parsed.ruleRef,
      reasonHash: hashOperationalReason(parsed.reason),
      nowMs: this.now(),
    });
    return result;
  }

  private async buildOutgoingPayload(
    input: PrepareGmailMessageInput,
    context: WorkflowCommunicationContext,
  ): Promise<GmailOutgoingMessage> {
    if (input.kind === "new") {
      throw new GmailHubError(
        "Generic new-message compose is outside the Workflow Communications boundary.",
        409,
      );
    }

    this.assertExecutable(GMAIL_HUB_ACTIONS.read);
    await this.assertLinkedThread(input.threadId, context);
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

  private assertContextAction(context: WorkflowCommunicationContext, expected: string) {
    if (context.actionKey !== expected) {
      throw new GmailHubError(
        `Workflow Gmail context must declare action ${expected}.`,
        409,
      );
    }
    if (!hasSpaceAccess(this.actor, context.lane)) {
      throw new GmailHubError(
        "This user cannot access the referenced workflow space.",
        403,
      );
    }
  }

  private assertApprovedTemplate(context: WorkflowCommunicationContext) {
    if (!this.dependencies.isApprovedWorkflowTemplate?.(context)) {
      throw new GmailHubError(
        "That workflow reply template is not approved for production use.",
        409,
      );
    }
  }

  private async assertLinkedThread(
    threadId: string,
    context: WorkflowCommunicationContext,
  ): Promise<WorkflowCommunicationLink> {
    const link = await this.dependencies.store.findCommunicationLink({
      mailboxEmail: this.mailboxEmail,
      threadId,
      context,
    });
    if (!link || link.expires_at_ms <= this.now()) {
      throw new GmailHubError(
        "That Gmail thread is not linked to the authorized workflow context.",
        403,
      );
    }
    return link;
  }

  private async saveCommunicationLink(
    context: WorkflowCommunicationContext,
    result: {
      draftId?: string;
      messageId?: string;
      threadId?: string;
      status: WorkflowCommunicationLink["status"];
      reasonHash?: string;
    },
  ) {
    this.requireWorkflowLinkTtlDays();
    const nowMs = this.now();
    await this.dependencies.store.saveCommunicationLink({
      id: uuidv7(),
      actor_uid: this.actor.uid,
      mailbox_key: gmailMailboxKey(this.mailboxEmail),
      lane: context.lane,
      entity_type: context.entityType,
      entity_id: context.entityId,
      purpose: context.purpose,
      origin_action_key: context.actionKey,
      source_refs: context.sourceRefs,
      reason_hash: result.reasonHash,
      template_ref: context.templateRef,
      reply_policy_ref: context.replyPolicyRef,
      draft_id: result.draftId,
      gmail_message_id: result.messageId,
      gmail_thread_id: result.threadId,
      status: result.status,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
      ...communicationsRetentionFields("workflow_link", nowMs),
    });
  }

  private requireWorkflowLinkTtlDays(): number {
    const days = this.dependencies.workflowLinkTtlDays;
    if (days !== undefined && days !== 365) {
      throw new GmailHubError(
        "Workflow communication retention must use the approved 365-day v1.0 policy.",
        409,
      );
    }
    return 365;
  }
}

function hashOperationalReason(reason: string) {
  return createHash("sha256").update(reason.trim(), "utf8").digest("hex");
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
    const addedRefs = new Map<string, { id: string; threadId: string }>();
    for (let page = 0; page < maxHistoryPages; page += 1) {
      const result = await input.client.listHistory({
        startHistoryId: mailboxState.history_id,
        ...(pageToken ? { pageToken } : {}),
        maxResults: 100,
      });
      addedCount += result.messagesAdded.length;
      for (const ref of result.messagesAdded)
        addedRefs.set(`${ref.threadId}:${ref.id}`, ref);
      cursor = result.historyId;
      pageToken = result.nextPageToken;
      if (!pageToken) break;
    }
    if (pageToken) {
      return await boundedMailboxResync(input, now);
    }
    const linked = await input.store.findCommunicationLinksByThreadIds({
      mailboxEmail: input.mailboxEmail,
      threadIds: [...new Set([...addedRefs.values()].map((ref) => ref.threadId))],
    });
    let matchedCount = 0;
    for (const link of linked) {
      const newest = [...addedRefs.values()].find(
        (ref) => ref.threadId === link.gmail_thread_id,
      );
      if (!newest) continue;
      if (newest.id === link.gmail_message_id) continue;
      if (
        (await input.store.markCommunicationAttention({
          linkId: link.id,
          messageId: newest.id,
          nowMs: now(),
        })) === "updated"
      ) {
        matchedCount += 1;
      }
    }
    await input.store.completePush({
      messageId: input.messageId,
      mailboxEmail: input.mailboxEmail,
      historyId: cursor,
      addedCount,
      matchedCount,
      mode: "history",
      nowMs: now(),
    });
    return {
      status: "processed" as const,
      addedCount,
      matchedCount,
      historyId: cursor,
    };
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
  // Expired history cannot justify scanning the recent inbox. Advance to the current cursor and
  // surface zero workflow attention; linked threads will be checked by subsequent incremental events.
  const profile = await input.client.getProfile();
  await input.store.completePush({
    messageId: input.messageId,
    mailboxEmail: input.mailboxEmail,
    historyId: profile.historyId,
    addedCount: 0,
    matchedCount: 0,
    mode: "bounded_resync",
    nowMs: now(),
  });
  return {
    status: "bounded_resync" as const,
    addedCount: 0,
    matchedCount: 0,
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

function assertRegistryPreview(actionKey: string, payload: Record<string, unknown>) {
  const entry = ACTION_REGISTRY_SEED.find((candidate) => candidate.key === actionKey);
  const fields = entry?.preview_payload_schema;
  if (!entry || !fields) {
    throw new GmailHubError(
      `Gmail action ${actionKey} has no governed preview schema.`,
      409,
    );
  }
  const result = validatePreviewPayload(
    fields.map((field) => ({ ...field, required: field.required ?? false })),
    payload,
  );
  if (!result.ok) throw new GmailHubError(result.errors.join(" "), 409);
}
