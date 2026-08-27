import { createHash, randomBytes } from "node:crypto";
import { v7 as uuidv7 } from "uuid";

import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { DRAFT_BANNER } from "@/lib/constants";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  AmbiguousExecutionError,
  DefinitiveExecutionError,
  executePreparedAction,
  prepareActionExecution,
  type TrustedExecutionContext,
} from "@/lib/execution/service";
import { resolveActionReconciliation } from "@/lib/firestore/action-executions";
import type { GmailLabelEffectStore } from "@/lib/firestore/gmail-label-effects";
import { GMAIL_HUB_ACTIONS } from "@/lib/gmail-hub/action-keys";
import {
  GMAIL_GOVERNED_LABELS,
  GMAIL_LABEL_ERROR_CODES,
  GMAIL_LABEL_IDEMPOTENCY_PRINCIPAL,
  gmailLabelContextHash,
  gmailLabelExecutionId,
  gmailLabelIdempotencyKey,
  gmailLabelMailboxKeyHash,
  gmailLabelPreview,
  gmailLabelResultCode,
  gmailLabelScopeRef,
  governedLabelMutation,
  intendedGovernedLabels,
  observedGovernedLabels,
  sameLabelSet,
  type GmailGovernedLabel,
  type GmailLabelEffectIdentityInput,
  type GmailLabelEffectKind,
  type GmailLabelEffectSnapshot,
} from "@/lib/gmail-hub/label-contract";
import {
  createLiveEffectAttentionEvent,
  emitLiveEffectAttentionSafely,
  emitLiveEffectRequiresAttention,
  type LiveEffectAttentionEmitter,
} from "@/lib/operations/live-effect-attention-log";
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
  GmailMailboxState,
  GmailStateStore,
} from "@/lib/gmail-hub/state-store";
import { gmailMailboxKey } from "@/lib/gmail-hub/state-store";
import {
  communicationsRetentionFields,
  GMAIL_CONFIRMATION_USABILITY_MS,
  isCommunicationsRecordActive,
} from "@/lib/gmail-hub/retention-policy";
import {
  workflowActionContextKey,
  type WorkflowCommunicationContext,
  type WorkflowCommunicationLink,
  type WorkflowCommunicationPurpose,
  type WorkflowCommunicationWaitingOn,
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

export { GMAIL_HUB_ACTIONS };

export interface GmailHubServiceDependencies {
  createClient(subject: string): GmailRuntimeClient;
  store: GmailStateStore;
  assertEffectEnvironment(): void;
  assertRuntimeActionExecutable(action: string): Promise<void>;
  now?(): number;
  createToken?(): string;
  workflowLinkTtlDays?: number;
  isApprovedWorkflowTemplate?(context: WorkflowCommunicationContext): boolean;
  /** Durable companion ledger for the governed label contract. */
  labelEffects?: GmailLabelEffectStore;
  /** Server-owned lane for the A2 projection; only a Live effect may raise attention. */
  dataMode?: "live" | "test";
  /** S20 seams. Production omits these and uses the committed ledger implementations. */
  prepareExecution?: typeof prepareActionExecution;
  executePrepared?: typeof executePreparedAction;
  resolveExecutionReconciliation?: typeof resolveActionReconciliation;
  emitLiveEffectAttention?: LiveEffectAttentionEmitter;
}

/** Bodyless, client-safe projection of one governed label effect. */
export interface GmailLabelEffectResult {
  status: "settled" | "reconciled" | "needs_reconciliation";
  kind: GmailLabelEffectKind;
  executionId: string;
  threadId: string;
  labelName: GmailGovernedLabel;
  labelId: string;
  governedLabels: GmailGovernedLabel[];
  duplicate: boolean;
  /** False when the settled effect's human-readable audit projection could not be written. */
  auditRecorded: boolean;
}

export class GmailHubService {
  private readonly now: () => number;
  private readonly createToken: () => string;
  private readonly mailboxEmail: string;

  constructor(
    private readonly actor: AuthenticatedUser,
    private readonly dependencies: GmailHubServiceDependencies,
  ) {
    this.mailboxEmail = actor.email.trim().toLowerCase();
    this.now = dependencies.now ?? Date.now;
    this.createToken =
      dependencies.createToken ?? (() => randomBytes(32).toString("base64url"));
  }

  async connection() {
    try {
      await this.assertRuntimeExecutable(GMAIL_HUB_ACTIONS.read);
    } catch {
      return {
        status: "gated" as const,
        mailboxEmail: this.mailboxEmail,
        reason: "Waiting on Gmail access",
      };
    }
    const client = this.createClient();
    const profile = await client.getProfile();
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
    await this.assertRuntimeExecutable(GMAIL_HUB_ACTIONS.read);
    const nowMs = this.now();
    return (
      await this.dependencies.store.listCommunicationLinks(this.mailboxEmail)
    ).filter(
      (link) =>
        link.actor_uid === this.actor.uid &&
        hasSpaceAccess(this.actor, link.lane) &&
        isCommunicationsRecordActive(
          "gmail_workflow_communications",
          link.id,
          link,
          nowMs,
        ),
    );
  }

  /**
   * Read-only replacement for the retired continuous watch. One caller-generated UUID is a durable
   * dedupe identity; the provider history cursor can only advance, and no Gmail message or label is
   * changed. A first refresh registers the current cursor without scanning historical inbox data.
   */
  async refreshMailbox(input: { attemptKey: string }) {
    if (!/^[a-f0-9-]{36}$/i.test(input.attemptKey)) {
      throw new GmailHubError("Gmail refresh attempt key is invalid.", 409);
    }
    const client = await this.createRuntimeClient(GMAIL_HUB_ACTIONS.read);
    const profile = await client.getProfile();
    const nowMs = this.now();
    let state = await this.dependencies.store.getMailboxState(this.mailboxEmail);
    if (!state) {
      await this.dependencies.store.saveMailboxState({
        mailbox_email: this.mailboxEmail,
        user_uid: this.actor.uid,
        history_id: profile.historyId,
        last_successful_sync_ms: nowMs,
        health: "connected",
        updated_at_ms: nowMs,
      });
      return {
        status: "initialized" as const,
        addedCount: 0,
        matchedCount: 0,
        historyId: profile.historyId,
      };
    }
    if (state.user_uid !== this.actor.uid && state.user_uid !== "unknown") {
      throw new GmailHubError("Gmail refresh state belongs to another user.", 403);
    }
    if (state.user_uid === "unknown" || state.health === "watching") {
      state = {
        mailbox_email: this.mailboxEmail,
        user_uid: this.actor.uid,
        history_id: state.history_id,
        ...(state.last_successful_sync_ms
          ? { last_successful_sync_ms: state.last_successful_sync_ms }
          : {}),
        health: "connected",
        updated_at_ms: nowMs,
      };
      await this.dependencies.store.saveMailboxState(state);
    }
    return processGmailPushNotification({
      messageId: `manual-${hashWatchBoundary(
        `${this.actor.uid}:${this.mailboxEmail}:${input.attemptKey}`,
      )}`,
      mailboxEmail: this.mailboxEmail,
      historyId: profile.historyId,
      source: "manual",
      store: this.dependencies.store,
      client,
      now: this.now,
    });
  }

  async linkExistingThread(input: {
    context: WorkflowCommunicationContext;
    threadId: string;
    reason: string;
  }) {
    this.assertContextAction(input.context, GMAIL_HUB_ACTIONS.read);
    if (!input.reason.trim()) {
      throw new GmailHubError("A reason is required to link a Gmail thread.", 409);
    }
    const client = await this.createRuntimeClient(GMAIL_HUB_ACTIONS.read);
    // The targeted read proves the opaque id belongs to this signed-in mailbox. Its content is returned
    // transiently by Gmail but is neither logged nor persisted by the link operation.
    const thread = await client.getThread(input.threadId);
    const observation = observeWorkflowThread(
      thread,
      this.mailboxEmail,
      input.context.purpose,
    );
    await this.saveCommunicationLink(input.context, {
      threadId: thread.id,
      status: "linked",
      reasonHash: hashOperationalReason(input.reason),
      ...observation,
    });
    return { status: "linked" as const, threadId: thread.id };
  }

  async getThread(
    threadId: string,
    context: WorkflowCommunicationContext,
  ): Promise<GmailThreadView> {
    this.assertContextAction(context, GMAIL_HUB_ACTIONS.read);
    await this.assertLinkedThread(threadId, context);
    const client = await this.createRuntimeClient(GMAIL_HUB_ACTIONS.read);
    return client.getThread(threadId);
  }

  async createDraft(input: WorkflowPrepareGmailMessageInput) {
    await this.assertRuntimeExecutable(GMAIL_HUB_ACTIONS.draft);
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
    const client = await this.createRuntimeClient(GMAIL_HUB_ACTIONS.draft);
    const result = await client.createDraft(payload);
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
    this.assertContextAction(parsed.context, GMAIL_HUB_ACTIONS.reply);
    this.assertApprovedTemplate(parsed.context);
    const workflowContextKey = workflowActionContextKey(parsed.context);
    const identity = {
      mailboxEmail: this.mailboxEmail,
      lane: parsed.context.lane,
      entityType: parsed.context.entityType,
      entityId: parsed.context.entityId,
      purpose: parsed.context.purpose,
    };
    // Double-send guard: refuse a new send while a PRIOR send for the same COMMUNICATION IDENTITY (this
    // mailbox + lane + entity + purpose — the identity that binds a reply to its thread) is still
    // unresolved: state "ambiguous" (Gmail returned no definitive result) or "sending" (a claim whose
    // outcome was never recorded). Either might already have delivered, so preparing another send risks a
    // second copy. Keyed on the entity identity, NOT the full context key, because the context key folds in
    // caller-supplied source refs a re-prepare can vary to slip past the guard. Reconciling the prior send
    // to a definitive "sent" clears the block.
    const unresolvedSend =
      await this.dependencies.store.findUnresolvedSendForCommunication(identity);
    if (unresolvedSend) {
      // Recovery WITHOUT the one-time confirmation token (which lives only in ephemeral client state and is
      // lost on reload): re-check delivery by the prior send's unique RFC Message-ID. If it DID deliver,
      // record that so the block resolves, then refuse this send as a duplicate. If delivery still cannot
      // be confirmed, keep the block — a not_found may be a still-indexing delivery, so we never
      // auto-conclude "not sent" (that would risk a second copy). The block then clears on its own once
      // delivery is confirmed, or an administrator clears a confirmation that genuinely never sent.
      // This is the same narrow read-only reconciliation as reconcileSend: the persisted unresolved
      // record proves a consumed attempt before the provider is constructed. Runtime suspension must
      // not strand this exact RFC Message-ID readback.
      const client = this.createReadOnlyReconciliationClient();
      const delivered = await client.findMessageByRfcMessageId(unresolvedSend.message_id);
      if (delivered) {
        await this.dependencies.store.markConfirmationSent({
          id: unresolvedSend.id,
          actorUid: unresolvedSend.actor_uid,
          result: delivered,
          nowMs: this.now(),
          reconciled: true,
        });
        throw new GmailAmbiguousSendError(
          "The prior reply for this workflow communication was already delivered. Start again to send a follow-up if that is intended.",
        );
      }
      throw new GmailAmbiguousSendError(
        "A prior send for this workflow communication has an outcome that could not be confirmed yet. It clears once delivery is confirmed; if it never sent, ask an administrator to clear it.",
      );
    }
    await this.assertRuntimeExecutable(GMAIL_HUB_ACTIONS.reply);
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
      workflow_context_key: workflowContextKey,
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
    // Now that this confirmation exists, retire any OTHER still-pending confirmation for the same
    // communication identity so only one pending send is ever claimable. This closes the concurrent-pending
    // window the ambiguous/sending guard above does not cover: two confirmations minted before either
    // resolves (two tabs / two operators / a double-submitted prepare) could otherwise each be sent. It also
    // cleans up the common orphan — a reload loses the first token, and this re-prepare supersedes the
    // stranded pending instead of leaving it live.
    await this.dependencies.store.supersedePendingSendsForCommunication(
      identity,
      id,
      nowMs,
    );
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
    await this.assertRuntimeExecutable(GMAIL_HUB_ACTIONS.reply);
    this.assertContextAction(input.context, GMAIL_HUB_ACTIONS.reply);
    const linked = await this.assertLinkedThread(payload.threadId, input.context);
    // This synchronous assertion is bound to the same immutable server descriptor as the provider
    // factory. It must run before the confirmation claim so Demo, Live-read-only, or an invalid
    // composition cannot strand a no-provider attempt in `sending`.
    this.dependencies.assertEffectEnvironment();
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
    if (claim.status === "sibling_in_flight") {
      // Another send for this same workflow communication is in flight or unresolved. Refuse rather than
      // deliver a possible second copy; the operator reconciles or waits for that send to resolve.
      throw new GmailAmbiguousSendError(
        "Another send for this workflow communication is already in progress or unresolved. Reconcile or wait for it to resolve before sending again.",
      );
    }
    if (claim.status !== "claimed") {
      throw new GmailHubError(
        claimMessage(claim.status),
        claim.status === "mismatch" ? 403 : 409,
      );
    }

    // The runtime gate above is intentionally before the durable claim. Construct the provider only
    // after that claim succeeds, but do not perform a second async suspension read after claiming:
    // a refusal at that point would strand the confirmation in `sending` despite zero provider work.
    const client = this.createClient();
    try {
      const result = await client.sendMessage(payload);
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
    // Both "ambiguous" (no definitive Gmail result) and "sending" (a claim whose outcome was never
    // recorded, e.g. a crash mid-send) are unresolved outcomes that may have delivered — either is
    // reconcilable by its unique RFC Message-ID, so a stuck "sending" is not a permanent block.
    if (record.state !== "ambiguous" && record.state !== "sending") {
      throw new GmailHubError("Only an unresolved send can be reconciled.", 409);
    }
    const client = this.createReadOnlyReconciliationClient();
    const result = await client.findMessageByRfcMessageId(record.message_id);
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

  async watchPreview(topicName: string) {
    await this.assertRuntimeExecutable(GMAIL_HUB_ACTIONS.read);
    assertGmailWatchTopic(topicName);
    const mailboxState = await this.dependencies.store.getMailboxState(this.mailboxEmail);
    return {
      mailboxEmail: this.mailboxEmail,
      topicName,
      currentWatchExpirationMs: mailboxState?.watch_expiration_ms ?? null,
      effect:
        "Start or renew the targeted Gmail push watch for this signed-in mailbox and topic.",
      proposedExpiration:
        "Gmail assigns the new expiration; the exact timestamp is read back after one provider attempt.",
      risk: "Live Gmail watch mutation. It does not send a message or grant cross-mailbox access.",
      reversibility:
        "A later confirmed renewal replaces the expiration; removing the configured watch stops future push delivery.",
    };
  }

  async watchMailbox(input: {
    topicName: string;
    attemptKey: string;
    observedExpirationMs: number | null;
  }) {
    assertGmailWatchTopic(input.topicName);
    if (!/^[a-f0-9-]{36}$/i.test(input.attemptKey)) {
      throw new GmailHubError("Gmail watch attempt key is invalid.", 409);
    }
    const attemptKeyHash = hashWatchBoundary(
      `${this.actor.uid}:${this.mailboxEmail}:${input.attemptKey}`,
    );
    const topicHash = hashWatchBoundary(input.topicName);
    const nowMs = this.now();
    await this.assertRuntimeExecutable(GMAIL_HUB_ACTIONS.read);
    // Refuse before the one-attempt claim. The provider constructor repeats this check as defense in
    // depth, but a constructor-only fence would leave a no-provider attempt durably `claimed`.
    this.dependencies.assertEffectEnvironment();
    const claim = await this.dependencies.store.claimWatchAttempt({
      mailboxEmail: this.mailboxEmail,
      actorUid: this.actor.uid,
      attemptKeyHash,
      topicHash,
      observedExpirationMs: input.observedExpirationMs,
      nowMs,
    });
    if (claim.status === "stale_preview") {
      throw new GmailHubError(
        "Gmail watch state changed after preview. Review the exact effect again.",
        409,
      );
    }
    if (claim.status === "in_progress") {
      throw new GmailHubError(
        "A Gmail watch attempt is already in progress. Do not retry it.",
        409,
      );
    }
    if (claim.status === "ambiguous") {
      throw new GmailAmbiguousWatchError(
        "The prior Gmail watch outcome is ambiguous. Do not retry that attempt key; review current watch health before confirming a new attempt.",
      );
    }
    if (claim.status === "completed") {
      return watchReadback("already_completed", claim.state, attemptKeyHash, topicHash);
    }
    const client = this.createClient();
    try {
      const watch = await client.watchMailbox(input.topicName);
      const expirationMs = Number(watch.expiration);
      if (!Number.isSafeInteger(expirationMs) || expirationMs <= nowMs) {
        throw new GmailAmbiguousWatchError(
          "Gmail returned an invalid watch expiration; the outcome is ambiguous.",
        );
      }
      await this.dependencies.store.completeWatchAttempt({
        mailboxEmail: this.mailboxEmail,
        actorUid: this.actor.uid,
        attemptKeyHash,
        historyId: watch.historyId,
        expirationMs,
        nowMs: this.now(),
      });
    } catch {
      await this.dependencies.store
        .markWatchAttemptAmbiguous({
          mailboxEmail: this.mailboxEmail,
          actorUid: this.actor.uid,
          attemptKeyHash,
          nowMs: this.now(),
        })
        .catch(() => undefined);
      throw new GmailAmbiguousWatchError(
        "The Gmail watch outcome is ambiguous. The one-attempt key is consumed; review current watch health before confirming a new attempt.",
      );
    }
    const readback = await this.dependencies.store.getMailboxState(this.mailboxEmail);
    if (
      !readback ||
      readback.watch_attempt?.attempt_key_hash !== attemptKeyHash ||
      readback.watch_attempt.topic_hash !== topicHash ||
      readback.watch_attempt.state !== "completed"
    ) {
      throw new GmailAmbiguousWatchError(
        "The Gmail watch provider call completed without a matching bodyless readback. Do not retry the consumed attempt key.",
      );
    }
    return watchReadback("completed", readback, attemptKeyHash, topicHash);
  }

  /**
   * Apply one governed label through the canonical S20 one-attempt execution contract.
   *
   * The prior implementation mutated Gmail and then appended an audit row, so a replay, a
   * concurrent confirm, or a crash could apply the effect twice with no durable evidence and no way
   * to restore the thread's prior governed labels. Every ordering below is load-bearing: the
   * environment/gate fences and the label/thread reads happen before the atomic claim so a refusal
   * cannot strand a claimed attempt, and the provider mutation happens only after the claim so a
   * duplicate request cannot reach Gmail.
   */
  async applyThreadLabel(
    threadId: string,
    input: {
      context: WorkflowCommunicationContext;
      label: string;
      reason: string;
      ruleRef: string;
    },
  ) {
    return this.runGovernedLabelEffect("apply", threadId, input);
  }

  /**
   * Restore the governed label set the thread held before a settled `apply`.
   *
   * This is the correction path named by the action's rollback contract. It is a separate immutable
   * identity, so it earns its own single attempt, and it removes the applied label only when the
   * captured pre-effect set did not already contain it.
   */
  async restoreThreadLabel(
    threadId: string,
    input: {
      context: WorkflowCommunicationContext;
      label: string;
      reason: string;
      ruleRef: string;
    },
  ) {
    return this.runGovernedLabelEffect("restore", threadId, input);
  }

  private async runGovernedLabelEffect(
    kind: GmailLabelEffectKind,
    threadId: string,
    input: {
      context: WorkflowCommunicationContext;
      label: string;
      reason: string;
      ruleRef: string;
    },
  ): Promise<GmailLabelEffectResult> {
    const parsed = ApplyGmailLabelSchema.parse(input);
    this.assertContextAction(parsed.context, GMAIL_HUB_ACTIONS.label);
    const linked = await this.assertLinkedThread(threadId, parsed.context);
    // The link is the authoritative source binding. A context whose source refs drift from the
    // linked record is not the reviewed target, so it never reaches provider construction.
    this.assertLinkedSourceRefs(linked, parsed.context);

    const identity = {
      mailboxEmail: this.mailboxEmail,
      context: parsed.context,
      threadId,
      label: parsed.label,
      ruleRef: parsed.ruleRef,
      kind,
    } as const;
    const preview = gmailLabelPreview({
      context: parsed.context,
      threadId,
      label: parsed.label,
      ruleRef: parsed.ruleRef,
      reason: parsed.reason,
    });
    assertRegistryPreview(GMAIL_HUB_ACTIONS.label, preview);
    const contextHash = gmailLabelContextHash({ ...identity, linkId: linked.id });
    const executionId = gmailLabelExecutionId(identity);

    // A settled effect for this exact target is duplicate evidence for ANY operator, including one
    // who cannot read the other operator's S20 record. Returning it here is what keeps a second
    // confirmation from becoming either a second mutation or an opaque ownership error.
    const settled = await this.labelEffects().get(executionId);
    if (settled?.state === "settled" && settled.contextHash === contextHash) {
      return this.labelResult(settled, true, true);
    }

    // Fence Demo, Live-read-only, and a malformed descriptor before any provider construction, and
    // before the ledger records an intent it must not be able to execute.
    this.dependencies.assertEffectEnvironment();
    await this.assertRuntimeExecutable(GMAIL_HUB_ACTIONS.label);

    // Read phase. Resolving the governed label is deliberately a lookup, never a creation: label
    // creation is a second provider mutation and would otherwise hide inside this one claim.
    const client = this.createClient();
    const governed = await client.resolveExistingUserLabels(GMAIL_GOVERNED_LABELS);
    const target = governed.get(parsed.label);
    if (!target) {
      throw new GmailHubError(
        `The governed label "${parsed.label}" is not provisioned in this mailbox. Create it in Gmail, then apply it again.`,
        409,
      );
    }
    const governedById = new Map(
      [...governed.entries()].map(([name, label]) => [label.id, name]),
    );
    // For `apply` the restoration anchor is the set observed right now. For `restore` it is the set
    // captured before the ORIGINAL apply — reading it live would see the label the app just added
    // and conclude the thread always carried it, turning the correction into a no-op.
    const anchor =
      kind === "apply"
        ? observedGovernedLabels(await client.getThreadLabelIds(threadId), governedById)
        : await this.priorSetFromSettledApply({ ...identity, kind: "apply" });

    const execution = await this.prepareLabelExecution({
      contextHash,
      executionId,
      identity,
      linked,
      preview,
    });

    // The one attempt is already consumed. Reconcile read-only; never mutate a second time.
    if (execution.attempt_count === 1 && execution.state === "Succeeded") {
      const snapshot = await this.requireLabelSnapshot(executionId);
      return this.labelResult(snapshot, true, true);
    }
    if (
      execution.attempt_count === 1 &&
      (execution.state === "Needs reconciliation" || execution.state === "Executing")
    ) {
      return this.reconcileLabelEffect(executionId, threadId, governedById);
    }

    const snapshot = await this.labelEffects().persistPrepared(this.actor, {
      schemaVersion: 1,
      s20ExecutionId: executionId,
      actionKey: GMAIL_HUB_ACTIONS.label,
      kind,
      actorUid: this.actor.uid,
      mailboxKeyHash: gmailLabelMailboxKeyHash(this.mailboxEmail),
      linkId: linked.id,
      threadId,
      label: parsed.label,
      labelId: target.id,
      ruleRef: parsed.ruleRef,
      reasonHash: hashOperationalReason(parsed.reason),
      previewHash: hashExecutionPreview(preview),
      contextHash,
      priorGovernedLabelIds: [...anchor.ids],
      priorGovernedLabels: [...anchor.names],
      dataMode: this.labelDataMode(),
      createdAt: new Date(this.now()).toISOString(),
    });

    const intended = intendedGovernedLabels(snapshot);
    const outcome = await this.executePreparedLabelAction({
      contextHash,
      executionId,
      governedById,
      intended,
      preview,
      snapshot,
      threadId,
      trustedContext: this.labelTrustedContext(),
    });

    if (outcome.execution.state !== "Succeeded" || !outcome.result) {
      // The durable terminal transition already committed inside executePreparedAction. Emit the
      // value-free A2 line exactly once, from here, after that commit — never from the executor.
      await this.emitLabelAttention(
        executionId,
        outcome.execution.state === "Failed" ? "failed" : "ambiguous",
      );
      throw outcome.execution.state === "Failed"
        ? new GmailHubError(
            "Gmail refused the governed label change. The one attempt was consumed; review the thread before preparing a new one.",
            409,
          )
        : new GmailAmbiguousLabelError(
            "The governed label outcome could not be confirmed. Reconcile this execution before any new attempt.",
          );
    }

    const settledSnapshot = await this.labelEffects().markSettled({
      s20ExecutionId: executionId,
      snapshotHash: snapshot.snapshotHash,
      observedGovernedLabelIds: outcome.result.observedGovernedLabelIds,
    });
    const auditRecorded = await this.appendLabelAudit(
      kind,
      linked,
      parsed,
      threadId,
      settledSnapshot,
    );
    return this.labelResult(settledSnapshot, false, auditRecorded);
  }

  private async prepareLabelExecution(input: {
    contextHash: string;
    executionId: string;
    identity: GmailLabelEffectIdentityInput;
    linked: WorkflowCommunicationLink;
    preview: Record<string, string>;
  }) {
    const prepare = this.dependencies.prepareExecution ?? prepareActionExecution;
    const record = await prepare(this.actor, {
      actionKey: GMAIL_HUB_ACTIONS.label,
      contextHash: input.contextHash,
      idempotencyKey: gmailLabelIdempotencyKey(input.identity),
      idempotencyPrincipal: GMAIL_LABEL_IDEMPOTENCY_PRINCIPAL,
      preview: input.preview,
      scopeRef: gmailLabelScopeRef(input.identity.context),
      trustedContext: this.labelTrustedContext(),
    });
    if (record.id !== input.executionId) {
      throw new GmailHubError(
        "The governed label execution identity does not match this exact effect.",
        409,
      );
    }
    return record;
  }

  private async executePreparedLabelAction(input: {
    contextHash: string;
    executionId: string;
    governedById: ReadonlyMap<string, GmailGovernedLabel>;
    intended: readonly GmailGovernedLabel[];
    preview: Record<string, string>;
    snapshot: GmailLabelEffectSnapshot;
    threadId: string;
    trustedContext: TrustedExecutionContext;
  }) {
    const execute = this.dependencies.executePrepared ?? executePreparedAction;
    return execute<{ observedGovernedLabelIds: readonly string[] }>({
      actor: this.actor,
      contextHash: input.contextHash,
      executionId: input.executionId,
      preview: input.preview,
      trustedContext: input.trustedContext,
      resultCode: (result) =>
        gmailLabelResultCode({
          kind: input.snapshot.kind,
          observedGovernedLabelIds: result.observedGovernedLabelIds,
          snapshotHash: input.snapshot.snapshotHash,
        }),
      executor: () => this.runClaimedLabelMutation(input),
    });
  }

  /**
   * The claimed provider section: at most one governed mutation, then a strict readback.
   *
   * The runtime gate ran before the claim and is deliberately NOT repeated here. A refusal at this
   * point would strand the execution at `Executing` despite zero provider work, which is the exact
   * failure the one-attempt contract exists to prevent.
   */
  private async runClaimedLabelMutation(input: {
    executionId: string;
    governedById: ReadonlyMap<string, GmailGovernedLabel>;
    intended: readonly GmailGovernedLabel[];
    snapshot: GmailLabelEffectSnapshot;
    threadId: string;
  }): Promise<{ observedGovernedLabelIds: readonly string[] }> {
    // Fenced to the exact claimed attempt and claimant, so a delayed or out-of-band call cannot
    // turn a preparation into a Live effect.
    await this.labelEffects().markProviderStarted(this.actor, {
      s20ExecutionId: input.executionId,
      snapshotHash: input.snapshot.snapshotHash,
      claimActorUid: this.actor.uid,
    });
    const client = this.createClient();
    const requested = governedLabelMutation(input.snapshot);
    if (!requested) {
      // The thread already holds the intended governed set. Confirm by minimal read rather than
      // spending a provider mutation that would change nothing.
      const settled = observedGovernedLabels(
        await client.getThreadLabelIds(input.threadId),
        input.governedById,
      );
      if (!sameLabelSet(settled.names, input.intended)) {
        throw new AmbiguousExecutionError(
          GMAIL_LABEL_ERROR_CODES.readbackAmbiguous,
          "The thread no longer holds the reviewed governed label set.",
        );
      }
      return { observedGovernedLabelIds: settled.ids };
    }
    let mutation;
    try {
      mutation = await client.modifyThreadLabels(input.threadId, requested);
    } catch (error) {
      const definitive = error instanceof GmailRuntimeError && !error.ambiguous;
      throw definitive
        ? new DefinitiveExecutionError(
            GMAIL_LABEL_ERROR_CODES.providerRefused,
            "Gmail definitively refused the governed label change.",
          )
        : new AmbiguousExecutionError(
            GMAIL_LABEL_ERROR_CODES.outcomeAmbiguous,
            "The governed label outcome requires reconciliation before any new attempt.",
          );
    }
    if (mutation.threadId !== input.threadId) {
      throw new AmbiguousExecutionError(
        GMAIL_LABEL_ERROR_CODES.readbackAmbiguous,
        "The Gmail readback identified a different thread.",
      );
    }
    const observed = observedGovernedLabels(mutation.labelIds, input.governedById);
    if (!sameLabelSet(observed.names, input.intended)) {
      throw new AmbiguousExecutionError(
        GMAIL_LABEL_ERROR_CODES.readbackAmbiguous,
        "The Gmail readback did not match the exact reviewed governed label set.",
      );
    }
    return { observedGovernedLabelIds: observed.ids };
  }

  /**
   * Read-only reconciliation of an already-consumed attempt. It calls no mutation, so a crash that
   * stranded the record at `Executing` resolves without any chance of a second governed effect.
   */
  private async reconcileLabelEffect(
    executionId: string,
    threadId: string,
    governedById: ReadonlyMap<string, GmailGovernedLabel>,
  ): Promise<GmailLabelEffectResult> {
    const snapshot = await this.requireLabelSnapshot(executionId);
    if (snapshot.state === "prepared") {
      // The attempt was claimed but the provider start was never fenced, so no mutation can have
      // been issued under it. This is a definitive dead attempt, not an ambiguous effect.
      throw new GmailAmbiguousLabelError(
        "The governed label attempt was consumed before the provider was contacted. Review the thread, then prepare a new attempt.",
      );
    }
    const client = this.createReadOnlyReconciliationClient();
    const observed = observedGovernedLabels(
      await client.getThreadLabelIds(threadId),
      governedById,
    );
    if (!sameLabelSet(observed.names, intendedGovernedLabels(snapshot))) {
      return {
        status: "needs_reconciliation",
        kind: snapshot.kind,
        executionId,
        threadId,
        labelName: snapshot.label,
        labelId: snapshot.labelId,
        governedLabels: [...observed.names],
        duplicate: false,
        auditRecorded: false,
      };
    }
    const settled = await this.labelEffects().markSettled({
      s20ExecutionId: executionId,
      snapshotHash: snapshot.snapshotHash,
      observedGovernedLabelIds: observed.ids,
    });
    const resolve =
      this.dependencies.resolveExecutionReconciliation ?? resolveActionReconciliation;
    await resolve(
      this.actor,
      executionId,
      {
        resultCode: gmailLabelResultCode({
          kind: settled.kind,
          observedGovernedLabelIds: observed.ids,
          snapshotHash: settled.snapshotHash,
        }),
      },
      undefined,
    );
    return this.labelResult(settled, true, false, "reconciled");
  }

  private async appendLabelAudit(
    kind: GmailLabelEffectKind,
    linked: WorkflowCommunicationLink,
    parsed: {
      context: WorkflowCommunicationContext;
      label: string;
      reason: string;
      ruleRef: string;
    },
    threadId: string,
    snapshot: GmailLabelEffectSnapshot,
  ): Promise<boolean> {
    try {
      await this.dependencies.store.appendWorkflowActionAudit({
        actorUid: this.actor.uid,
        mailboxEmail: this.mailboxEmail,
        communicationId: linked.id,
        context: parsed.context,
        action: kind === "apply" ? "label_applied" : "label_restored",
        threadId,
        label: parsed.label,
        ruleRef: parsed.ruleRef,
        reasonHash: snapshot.reasonHash,
        nowMs: this.now(),
      });
      return true;
    } catch {
      // The S20 terminal transition and the effect receipt already committed. A failed audit
      // projection must never roll back a settled Live effect or invite a second attempt; the
      // caller is told the projection is missing instead of being told the effect failed.
      return false;
    }
  }

  private async emitLabelAttention(
    executionId: string,
    state: "failed" | "ambiguous",
  ): Promise<void> {
    const attention = createLiveEffectAttentionEvent({
      actionKey: GMAIL_HUB_ACTIONS.label,
      executionId,
      state,
      dataMode: this.labelDataMode(),
    });
    if (!attention) return;
    await emitLiveEffectAttentionSafely(
      this.dependencies.emitLiveEffectAttention ?? emitLiveEffectRequiresAttention,
      attention,
    );
  }

  private labelResult(
    snapshot: GmailLabelEffectSnapshot,
    duplicate: boolean,
    auditRecorded: boolean,
    status: GmailLabelEffectResult["status"] = "settled",
  ): GmailLabelEffectResult {
    return {
      status,
      kind: snapshot.kind,
      executionId: snapshot.s20ExecutionId,
      threadId: snapshot.threadId,
      labelName: snapshot.label,
      labelId: snapshot.labelId,
      governedLabels: [...intendedGovernedLabels(snapshot)],
      duplicate,
      auditRecorded,
    };
  }

  /**
   * The restoration target: the governed label set captured before the settled `apply` for this
   * exact identity. Requiring a settled apply is itself a safety property — the correction path can
   * only undo something this app actually did, never strip a label it never applied.
   */
  private async priorSetFromSettledApply(identity: GmailLabelEffectIdentityInput) {
    const applied = await this.labelEffects().get(gmailLabelExecutionId(identity));
    if (!applied || applied.state !== "settled") {
      throw new GmailHubError(
        "There is no settled governed label to restore on this thread.",
        409,
      );
    }
    return {
      ids: [...applied.priorGovernedLabelIds],
      names: [...applied.priorGovernedLabels],
    };
  }

  private async requireLabelSnapshot(executionId: string) {
    const snapshot = await this.labelEffects().get(executionId);
    if (!snapshot) {
      throw new GmailHubError(
        "The governed label effect has no durable snapshot; it cannot be reconciled or restored.",
        409,
      );
    }
    return snapshot;
  }

  private labelEffects(): GmailLabelEffectStore {
    const store = this.dependencies.labelEffects;
    if (!store) {
      throw new GmailHubError("The governed label effect ledger is unavailable.", 503);
    }
    return store;
  }

  private labelDataMode(): "live" | "test" {
    return this.dependencies.dataMode ?? "live";
  }

  /**
   * Server-established readiness facts. Every value below is asserted earlier in this request, not
   * assumed: the workflow link was loaded and its source refs compared, the client subject was
   * matched to the signed-in mailbox, the label came from the governed enum and was resolved in
   * that mailbox, the runtime gate passed, and the correction path makes the effect reversible.
   */
  private labelTrustedContext(): TrustedExecutionContext {
    return {
      connectionReady: true,
      endpointDocumented: true,
      permissionGranted: true,
      roleScopeAuthorized: true,
      sourceValidated: true,
      communication: {
        governedLabel: true,
        humanInitiated: true,
        mailboxScopeAuthorized: true,
        reversible: true,
        workflowLinked: true,
      },
    };
  }

  private assertLinkedSourceRefs(
    link: WorkflowCommunicationLink,
    context: WorkflowCommunicationContext,
  ) {
    const linked = [...new Set(link.source_refs)].sort();
    const supplied = [...new Set(context.sourceRefs)].sort();
    if (
      linked.length !== supplied.length ||
      linked.some((value, index) => value !== supplied[index])
    ) {
      throw new GmailHubError(
        "The workflow source references do not match the linked Gmail thread.",
        403,
      );
    }
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

    await this.assertLinkedThread(input.threadId, context);
    const client = await this.createRuntimeClient(GMAIL_HUB_ACTIONS.read);
    const thread = await client.getThread(input.threadId);
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

  private async assertRuntimeExecutable(action: string) {
    await this.dependencies.assertRuntimeActionExecutable(action);
  }

  private async createRuntimeClient(action: string): Promise<GmailRuntimeClient> {
    await this.assertRuntimeExecutable(action);
    return this.createClient();
  }

  private createClient(): GmailRuntimeClient {
    const client = this.dependencies.createClient(this.mailboxEmail);
    if (client.subject !== this.mailboxEmail) {
      throw new GmailHubError(
        "Gmail client subject did not match the signed-in user.",
        403,
      );
    }
    return client;
  }

  /**
   * Reconciliation reaches this only after the persisted confirmation proves one consumed unresolved
   * send. It performs the single read-only RFC Message-ID lookup and cannot start a new effect.
   */
  private createReadOnlyReconciliationClient(): GmailRuntimeClient {
    return this.createClient();
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
    if (
      !link ||
      !isCommunicationsRecordActive(
        "gmail_workflow_communications",
        link.id,
        link,
        this.now(),
      )
    ) {
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
      waitingOn?: WorkflowCommunicationWaitingOn;
      lastContactAtMs?: number;
      lastContactMessageId?: string;
      lastContactSource?: "gmail_thread";
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
      ...(result.waitingOn ? { waiting_on: result.waitingOn } : {}),
      ...(result.lastContactAtMs ? { last_contact_at_ms: result.lastContactAtMs } : {}),
      ...(result.lastContactMessageId
        ? { last_contact_message_id: result.lastContactMessageId }
        : {}),
      ...(result.lastContactSource
        ? { last_contact_source: result.lastContactSource }
        : {}),
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
  source?: "push" | "manual";
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
    const threadReadbacks = new Map<string, GmailThreadView>();
    for (const link of linked) {
      const threadId = link.gmail_thread_id;
      if (!threadId) continue;
      if (![...addedRefs.values()].some((ref) => ref.threadId === threadId)) continue;
      let thread = threadReadbacks.get(threadId);
      if (!thread) {
        thread = await input.client.getThread(threadId);
        threadReadbacks.set(threadId, thread);
      }
      const observation = observeWorkflowThread(thread, input.mailboxEmail, link.purpose);
      const newestMessageId = observation.lastContactMessageId;
      if (!newestMessageId || newestMessageId === link.gmail_message_id) continue;
      if (
        (await input.store.markCommunicationAttention({
          linkId: link.id,
          messageId: newestMessageId,
          ...observation,
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
      mode: input.source === "manual" ? "manual_history" : "history",
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
    source?: "push" | "manual";
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
    mode: input.source === "manual" ? "manual_bounded_resync" : "bounded_resync",
    nowMs: now(),
  });
  return {
    status: "bounded_resync" as const,
    addedCount: 0,
    matchedCount: 0,
    historyId: profile.historyId,
  };
}

interface WorkflowThreadObservation {
  waitingOn?: WorkflowCommunicationWaitingOn;
  lastContactAtMs?: number;
  lastContactMessageId?: string;
  lastContactSource?: "gmail_thread";
}

/** Provider-only observation; no body, address, or inferred model output is persisted. */
function observeWorkflowThread(
  thread: GmailThreadView,
  mailboxEmail: string,
  purpose: WorkflowCommunicationPurpose,
): WorkflowThreadObservation {
  const latest = [...thread.messages]
    .sort(
      (left, right) =>
        providerMessageTime(left.internalDate) - providerMessageTime(right.internalDate),
    )
    .at(-1);
  if (!latest?.id) return {};
  const lastContactAtMs = providerMessageTime(latest.internalDate);
  const sender = extractEmailAddress(latest.from);
  const waitingOn = sender
    ? sender === mailboxEmail
      ? counterpartyForPurpose(purpose)
      : "team"
    : undefined;
  return {
    ...(waitingOn ? { waitingOn } : {}),
    ...(lastContactAtMs > 0 ? { lastContactAtMs } : {}),
    lastContactMessageId: latest.id,
    lastContactSource: "gmail_thread",
  };
}

function counterpartyForPurpose(
  purpose: WorkflowCommunicationPurpose,
): WorkflowCommunicationWaitingOn {
  return purpose === "renewal_tenant" ? "resident" : "owner";
}

function providerMessageTime(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
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

export class GmailAmbiguousWatchError extends GmailHubError {
  constructor(message: string) {
    super(message, 409);
    this.name = "GmailAmbiguousWatchError";
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

export class GmailAmbiguousLabelError extends GmailHubError {
  constructor(message: string) {
    super(message, 409);
    this.name = "GmailAmbiguousLabelError";
  }
}

function claimMessage(
  status: "expired" | "mismatch" | "in_progress" | "failed" | "superseded",
) {
  const messages = {
    expired: "The Gmail confirmation expired. Review the exact message again.",
    mismatch: "The Gmail confirmation does not match this user and exact payload.",
    in_progress: "This Gmail confirmation is already being processed.",
    failed: "This Gmail confirmation was already consumed by a failed attempt.",
    superseded:
      "A newer confirmation replaced this one for this workflow communication. Prepare the send again.",
  } as const;
  return messages[status];
}

function assertGmailWatchTopic(topicName: string) {
  if (!/^projects\/pmi-kc-kb-prod\/topics\/[A-Za-z0-9._~-]+$/.test(topicName)) {
    throw new GmailHubError(
      "Gmail watch topic must be the configured pmi-kc-kb-prod topic.",
      409,
    );
  }
}

function hashWatchBoundary(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function watchReadback(
  outcome: "completed" | "already_completed",
  state: GmailMailboxState,
  attemptKeyHash: string,
  topicHash: string,
) {
  const attempt = state.watch_attempt;
  if (
    !attempt ||
    attempt.attempt_key_hash !== attemptKeyHash ||
    attempt.topic_hash !== topicHash ||
    attempt.state !== "completed" ||
    !attempt.history_id ||
    !attempt.expiration_ms
  ) {
    throw new GmailAmbiguousWatchError(
      "The Gmail watch has no matching bodyless completion readback.",
    );
  }
  return {
    outcome,
    historyId: attempt.history_id,
    expiration: String(attempt.expiration_ms),
    readback: {
      state: attempt.state,
      mailboxEmail: state.mailbox_email,
      attemptKeyHash,
      topicHash,
      expirationMs: attempt.expiration_ms,
      observedAtMs: state.updated_at_ms,
    },
  };
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
