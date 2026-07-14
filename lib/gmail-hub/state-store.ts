// Minimal, bodyless Gmail operational state. Firestore transactions bind one-time send confirmation,
// idempotency, watch cursor advancement, and Pub/Sub replay dedupe. No method accepts a body, raw MIME,
// attachment, prompt, or bearer token.

import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  linkMatchesContext,
  type WorkflowCommunicationContext,
  type WorkflowCommunicationLink,
} from "@/lib/gmail-hub/workflow-context";
import type { GmailSendResult } from "@/lib/gmail-runtime/types";

export const GMAIL_STATE_COLLECTIONS = {
  confirmations: "gmail_send_confirmations",
  sendAudit: "gmail_send_audit",
  mailboxState: "gmail_mailbox_state",
  pushDedupe: "gmail_push_dedupe",
  syncAudit: "gmail_sync_audit",
  workflowLinks: "gmail_workflow_communications",
  workflowAudit: "gmail_workflow_communication_audit",
} as const;

export type GmailMessageKind = "new" | "reply";
export type GmailConfirmationState =
  | "pending"
  | "sending"
  | "sent"
  | "ambiguous"
  | "failed";

export interface GmailConfirmationRecord {
  id: string;
  actor_uid: string;
  mailbox_email: string;
  payload_hash: string;
  message_id: string;
  message_kind: GmailMessageKind;
  state: GmailConfirmationState;
  expires_at_ms: number;
  created_at_ms: number;
  updated_at_ms: number;
  gmail_message_id?: string;
  gmail_thread_id?: string;
  workflow_context_key: string;
  workflow_lane: WorkflowCommunicationLink["lane"];
  workflow_entity_type: WorkflowCommunicationLink["entity_type"];
  workflow_entity_id: string;
  workflow_purpose: WorkflowCommunicationLink["purpose"];
  template_ref?: string;
}

export interface GmailMailboxState {
  mailbox_email: string;
  user_uid: string;
  history_id: string;
  watch_expiration_ms?: number;
  last_successful_sync_ms?: number;
  health: "connected" | "watching" | "degraded";
  updated_at_ms: number;
}

export type ClaimConfirmationResult =
  | { status: "claimed"; record: GmailConfirmationRecord }
  | {
      status: "expired" | "mismatch" | "in_progress" | "failed";
      record?: GmailConfirmationRecord;
    }
  | { status: "sent"; record: GmailConfirmationRecord; result: GmailSendResult }
  | { status: "ambiguous"; record: GmailConfirmationRecord };

export interface GmailWorkflowActionAuditInput {
  actorUid: string;
  mailboxEmail: string;
  communicationId: string;
  context: WorkflowCommunicationContext;
  action: "label_applied";
  threadId: string;
  label: string;
  ruleRef: string;
  reasonHash: string;
  nowMs: number;
}

export interface GmailStateStore {
  createConfirmation(record: GmailConfirmationRecord): Promise<void>;
  getConfirmation(id: string): Promise<GmailConfirmationRecord | null>;
  claimConfirmation(input: {
    id: string;
    actorUid: string;
    payloadHash: string;
    workflowContextKey: string;
    nowMs: number;
  }): Promise<ClaimConfirmationResult>;
  markConfirmationSent(input: {
    id: string;
    actorUid: string;
    result: GmailSendResult;
    nowMs: number;
    reconciled?: boolean;
  }): Promise<void>;
  markConfirmationOutcome(input: {
    id: string;
    actorUid: string;
    state: "ambiguous" | "failed";
    nowMs: number;
  }): Promise<void>;
  saveMailboxState(state: GmailMailboxState): Promise<void>;
  getMailboxState(mailboxEmail: string): Promise<GmailMailboxState | null>;
  claimPush(input: {
    messageId: string;
    mailboxEmail: string;
    historyId: string;
    nowMs: number;
  }): Promise<"claimed" | "duplicate">;
  completePush(input: {
    messageId: string;
    mailboxEmail: string;
    historyId: string;
    addedCount: number;
    mode: "history" | "bounded_resync";
    matchedCount?: number;
    nowMs: number;
  }): Promise<void>;
  failPush(input: { messageId: string; nowMs: number }): Promise<void>;
  saveCommunicationLink(link: WorkflowCommunicationLink): Promise<void>;
  listCommunicationLinks(mailboxEmail: string): Promise<WorkflowCommunicationLink[]>;
  findCommunicationLink(input: {
    mailboxEmail: string;
    threadId: string;
    context: WorkflowCommunicationContext;
  }): Promise<WorkflowCommunicationLink | null>;
  findCommunicationLinksByThreadIds(input: {
    mailboxEmail: string;
    threadIds: readonly string[];
  }): Promise<WorkflowCommunicationLink[]>;
  markCommunicationAttention(input: {
    linkId: string;
    messageId: string;
    nowMs: number;
  }): Promise<"updated" | "duplicate" | "missing">;
  markCommunicationRead(input: {
    linkId: string;
    mailboxEmail: string;
    nowMs: number;
  }): Promise<void>;
  appendWorkflowActionAudit(input: GmailWorkflowActionAuditInput): Promise<void>;
}

export class FirestoreGmailStateStore implements GmailStateStore {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async createConfirmation(record: GmailConfirmationRecord): Promise<void> {
    const ref = this.db.collection(GMAIL_STATE_COLLECTIONS.confirmations).doc(record.id);
    await this.db.runTransaction(async (transaction) => {
      if ((await transaction.get(ref)).exists) {
        throw new GmailStateError("Gmail confirmation already exists.", 409);
      }
      transaction.create(ref, record);
      transaction.create(
        this.db.collection(GMAIL_STATE_COLLECTIONS.sendAudit).doc(uuidv7()),
        sendAudit(record, "confirmation_created", record.created_at_ms),
      );
    });
  }

  async getConfirmation(id: string): Promise<GmailConfirmationRecord | null> {
    const snapshot = await this.db
      .collection(GMAIL_STATE_COLLECTIONS.confirmations)
      .doc(id)
      .get();
    return snapshot.exists ? (snapshot.data() as GmailConfirmationRecord) : null;
  }

  async claimConfirmation(input: {
    id: string;
    actorUid: string;
    payloadHash: string;
    workflowContextKey: string;
    nowMs: number;
  }): Promise<ClaimConfirmationResult> {
    const ref = this.db.collection(GMAIL_STATE_COLLECTIONS.confirmations).doc(input.id);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return { status: "mismatch" as const };
      const record = snapshot.data() as GmailConfirmationRecord;
      if (
        record.actor_uid !== input.actorUid ||
        record.payload_hash !== input.payloadHash ||
        record.workflow_context_key !== input.workflowContextKey
      ) {
        return { status: "mismatch" as const, record };
      }
      if (record.state === "sent" && record.gmail_message_id && record.gmail_thread_id) {
        return {
          status: "sent" as const,
          record,
          result: {
            messageId: record.gmail_message_id,
            threadId: record.gmail_thread_id,
            labelIds: [],
          },
        };
      }
      if (record.state === "ambiguous") return { status: "ambiguous" as const, record };
      if (record.state === "sending") return { status: "in_progress" as const, record };
      if (record.state === "failed") return { status: "failed" as const, record };
      if (record.expires_at_ms <= input.nowMs)
        return { status: "expired" as const, record };

      const claimed = {
        ...record,
        state: "sending" as const,
        updated_at_ms: input.nowMs,
      };
      transaction.set(ref, claimed);
      transaction.create(
        this.db.collection(GMAIL_STATE_COLLECTIONS.sendAudit).doc(uuidv7()),
        sendAudit(claimed, "send_claimed", input.nowMs),
      );
      return { status: "claimed" as const, record: claimed };
    });
  }

  async markConfirmationSent(input: {
    id: string;
    actorUid: string;
    result: GmailSendResult;
    nowMs: number;
    reconciled?: boolean;
  }): Promise<void> {
    const ref = this.db.collection(GMAIL_STATE_COLLECTIONS.confirmations).doc(input.id);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists)
        throw new GmailStateError("Gmail confirmation not found.", 404);
      const record = snapshot.data() as GmailConfirmationRecord;
      if (record.actor_uid !== input.actorUid) {
        throw new GmailStateError("Gmail confirmation belongs to another user.", 403);
      }
      const sent: GmailConfirmationRecord = {
        ...record,
        state: "sent",
        gmail_message_id: input.result.messageId,
        gmail_thread_id: input.result.threadId,
        updated_at_ms: input.nowMs,
      };
      transaction.set(ref, sent);
      transaction.create(
        this.db.collection(GMAIL_STATE_COLLECTIONS.sendAudit).doc(uuidv7()),
        sendAudit(
          sent,
          input.reconciled ? "send_reconciled" : "send_succeeded",
          input.nowMs,
        ),
      );
    });
  }

  async markConfirmationOutcome(input: {
    id: string;
    actorUid: string;
    state: "ambiguous" | "failed";
    nowMs: number;
  }): Promise<void> {
    const ref = this.db.collection(GMAIL_STATE_COLLECTIONS.confirmations).doc(input.id);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return;
      const record = snapshot.data() as GmailConfirmationRecord;
      if (record.actor_uid !== input.actorUid || record.state === "sent") return;
      const next = { ...record, state: input.state, updated_at_ms: input.nowMs };
      transaction.set(ref, next);
      transaction.create(
        this.db.collection(GMAIL_STATE_COLLECTIONS.sendAudit).doc(uuidv7()),
        sendAudit(next, `send_${input.state}`, input.nowMs),
      );
    });
  }

  async saveMailboxState(state: GmailMailboxState): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      transaction.set(
        this.db
          .collection(GMAIL_STATE_COLLECTIONS.mailboxState)
          .doc(mailboxDocId(state.mailbox_email)),
        state,
      );
      transaction.create(
        this.db.collection(GMAIL_STATE_COLLECTIONS.syncAudit).doc(uuidv7()),
        {
          action: "watch_saved",
          mailbox_key: mailboxDocId(state.mailbox_email),
          history_id: state.history_id,
          created_at_ms: state.updated_at_ms,
        },
      );
    });
  }

  async getMailboxState(mailboxEmail: string): Promise<GmailMailboxState | null> {
    const snapshot = await this.db
      .collection(GMAIL_STATE_COLLECTIONS.mailboxState)
      .doc(mailboxDocId(mailboxEmail))
      .get();
    return snapshot.exists ? (snapshot.data() as GmailMailboxState) : null;
  }

  async claimPush(input: {
    messageId: string;
    mailboxEmail: string;
    historyId: string;
    nowMs: number;
  }): Promise<"claimed" | "duplicate"> {
    const ref = this.db
      .collection(GMAIL_STATE_COLLECTIONS.pushDedupe)
      .doc(pushDocId(input.messageId));
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        const state = snapshot.get("state");
        const updatedAt = Number(snapshot.get("updated_at_ms") ?? 0);
        if (
          state === "completed" ||
          (state === "processing" && input.nowMs - updatedAt < 300_000)
        ) {
          return "duplicate" as const;
        }
      }
      transaction.set(ref, {
        pubsub_message_id: input.messageId,
        mailbox_key: mailboxDocId(input.mailboxEmail),
        history_id: input.historyId,
        state: "processing",
        updated_at_ms: input.nowMs,
      });
      return "claimed" as const;
    });
  }

  async completePush(input: {
    messageId: string;
    mailboxEmail: string;
    historyId: string;
    addedCount: number;
    mode: "history" | "bounded_resync";
    matchedCount?: number;
    nowMs: number;
  }): Promise<void> {
    const dedupeRef = this.db
      .collection(GMAIL_STATE_COLLECTIONS.pushDedupe)
      .doc(pushDocId(input.messageId));
    const mailboxRef = this.db
      .collection(GMAIL_STATE_COLLECTIONS.mailboxState)
      .doc(mailboxDocId(input.mailboxEmail));
    await this.db.runTransaction(async (transaction) => {
      const existing = await transaction.get(mailboxRef);
      const current = existing.exists
        ? (existing.data() as GmailMailboxState)
        : undefined;
      const historyId = maxHistoryId(current?.history_id, input.historyId);
      transaction.set(mailboxRef, {
        mailbox_email: input.mailboxEmail,
        user_uid: current?.user_uid ?? "unknown",
        history_id: historyId,
        ...(current?.watch_expiration_ms
          ? { watch_expiration_ms: current.watch_expiration_ms }
          : {}),
        last_successful_sync_ms: input.nowMs,
        health: "watching",
        updated_at_ms: input.nowMs,
      });
      transaction.set(dedupeRef, {
        pubsub_message_id: input.messageId,
        mailbox_key: mailboxDocId(input.mailboxEmail),
        history_id: historyId,
        state: "completed",
        updated_at_ms: input.nowMs,
      });
      transaction.create(
        this.db.collection(GMAIL_STATE_COLLECTIONS.syncAudit).doc(uuidv7()),
        {
          action: input.mode,
          mailbox_key: mailboxDocId(input.mailboxEmail),
          history_id: historyId,
          added_count: input.addedCount,
          matched_count: input.matchedCount ?? 0,
          created_at_ms: input.nowMs,
        },
      );
    });
  }

  async failPush(input: { messageId: string; nowMs: number }): Promise<void> {
    await this.db
      .collection(GMAIL_STATE_COLLECTIONS.pushDedupe)
      .doc(pushDocId(input.messageId))
      .set(
        { state: "failed", updated_at_ms: input.nowMs, retryable: true },
        { merge: true },
      );
  }

  async saveCommunicationLink(link: WorkflowCommunicationLink): Promise<void> {
    const ref = this.db.collection(GMAIL_STATE_COLLECTIONS.workflowLinks).doc(link.id);
    await this.db.runTransaction(async (transaction) => {
      transaction.set(ref, link);
      transaction.create(
        this.db.collection(GMAIL_STATE_COLLECTIONS.workflowAudit).doc(uuidv7()),
        workflowAudit(link, "link_saved", link.updated_at_ms),
      );
    });
  }

  async listCommunicationLinks(
    mailboxEmail: string,
  ): Promise<WorkflowCommunicationLink[]> {
    const mailboxKey = mailboxDocId(mailboxEmail);
    const snapshot = await this.db
      .collection(GMAIL_STATE_COLLECTIONS.workflowLinks)
      .get();
    return snapshot.docs
      .map((doc) => doc.data() as WorkflowCommunicationLink)
      .filter((link) => link.mailbox_key === mailboxKey)
      .sort((left, right) => right.updated_at_ms - left.updated_at_ms);
  }

  async findCommunicationLink(input: {
    mailboxEmail: string;
    threadId: string;
    context: WorkflowCommunicationContext;
  }): Promise<WorkflowCommunicationLink | null> {
    return (
      (await this.listCommunicationLinks(input.mailboxEmail)).find(
        (link) =>
          link.gmail_thread_id === input.threadId &&
          linkMatchesContext(link, input.context),
      ) ?? null
    );
  }

  async findCommunicationLinksByThreadIds(input: {
    mailboxEmail: string;
    threadIds: readonly string[];
  }): Promise<WorkflowCommunicationLink[]> {
    const threadIds = new Set(input.threadIds);
    return (await this.listCommunicationLinks(input.mailboxEmail)).filter(
      (link) => link.gmail_thread_id && threadIds.has(link.gmail_thread_id),
    );
  }

  async markCommunicationAttention(input: {
    linkId: string;
    messageId: string;
    nowMs: number;
  }): Promise<"updated" | "duplicate" | "missing"> {
    const ref = this.db
      .collection(GMAIL_STATE_COLLECTIONS.workflowLinks)
      .doc(input.linkId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return "missing" as const;
      const link = snapshot.data() as WorkflowCommunicationLink;
      if (link.last_message_id === input.messageId) return "duplicate" as const;
      const next: WorkflowCommunicationLink = {
        ...link,
        status: "attention_required",
        last_message_id: input.messageId,
        attention_at_ms: input.nowMs,
        read_at_ms: undefined,
        updated_at_ms: input.nowMs,
      };
      transaction.set(ref, stripUndefined(next));
      transaction.create(
        this.db.collection(GMAIL_STATE_COLLECTIONS.workflowAudit).doc(uuidv7()),
        workflowAudit(next, "reply_attention_created", input.nowMs),
      );
      return "updated" as const;
    });
  }

  async markCommunicationRead(input: {
    linkId: string;
    mailboxEmail: string;
    nowMs: number;
  }): Promise<void> {
    const ref = this.db
      .collection(GMAIL_STATE_COLLECTIONS.workflowLinks)
      .doc(input.linkId);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists)
        throw new GmailStateError("Communication attention not found.", 404);
      const link = snapshot.data() as WorkflowCommunicationLink;
      if (link.mailbox_key !== mailboxDocId(input.mailboxEmail)) {
        throw new GmailStateError(
          "Communication attention belongs to another mailbox.",
          403,
        );
      }
      const next = { ...link, read_at_ms: input.nowMs, updated_at_ms: input.nowMs };
      transaction.set(ref, next);
      transaction.create(
        this.db.collection(GMAIL_STATE_COLLECTIONS.workflowAudit).doc(uuidv7()),
        workflowAudit(next, "attention_read", input.nowMs),
      );
    });
  }

  async appendWorkflowActionAudit(input: GmailWorkflowActionAuditInput): Promise<void> {
    await this.db
      .collection(GMAIL_STATE_COLLECTIONS.workflowAudit)
      .doc(uuidv7())
      .create({
        actor_uid: input.actorUid,
        mailbox_key: mailboxDocId(input.mailboxEmail),
        communication_id: input.communicationId,
        lane: input.context.lane,
        entity_type: input.context.entityType,
        entity_id: input.context.entityId,
        purpose: input.context.purpose,
        action: input.action,
        gmail_thread_id: input.threadId,
        label: input.label,
        rule_ref: input.ruleRef,
        reason_hash: input.reasonHash,
        created_at_ms: input.nowMs,
      });
  }
}

export class MemoryGmailStateStore implements GmailStateStore {
  readonly confirmations = new Map<string, GmailConfirmationRecord>();
  readonly mailboxStates = new Map<string, GmailMailboxState>();
  readonly pushStates = new Map<string, { state: string; updatedAt: number }>();
  readonly communicationLinks = new Map<string, WorkflowCommunicationLink>();
  readonly audit: Array<Record<string, unknown>> = [];

  async createConfirmation(record: GmailConfirmationRecord) {
    if (this.confirmations.has(record.id)) throw new GmailStateError("Exists.", 409);
    this.confirmations.set(record.id, structuredClone(record));
    this.audit.push(sendAudit(record, "confirmation_created", record.created_at_ms));
  }

  async getConfirmation(id: string) {
    return structuredClone(this.confirmations.get(id) ?? null);
  }

  async claimConfirmation(input: {
    id: string;
    actorUid: string;
    payloadHash: string;
    workflowContextKey: string;
    nowMs: number;
  }): Promise<ClaimConfirmationResult> {
    const record = this.confirmations.get(input.id);
    if (
      !record ||
      record.actor_uid !== input.actorUid ||
      record.payload_hash !== input.payloadHash ||
      record.workflow_context_key !== input.workflowContextKey
    ) {
      return {
        status: "mismatch",
        ...(record ? { record: structuredClone(record) } : {}),
      };
    }
    if (record.state === "sent" && record.gmail_message_id && record.gmail_thread_id) {
      return {
        status: "sent",
        record: structuredClone(record),
        result: {
          messageId: record.gmail_message_id,
          threadId: record.gmail_thread_id,
          labelIds: [],
        },
      };
    }
    if (record.state === "ambiguous")
      return { status: "ambiguous", record: structuredClone(record) };
    if (record.state === "sending")
      return { status: "in_progress", record: structuredClone(record) };
    if (record.state === "failed")
      return { status: "failed", record: structuredClone(record) };
    if (record.expires_at_ms <= input.nowMs)
      return { status: "expired", record: structuredClone(record) };
    record.state = "sending";
    record.updated_at_ms = input.nowMs;
    this.audit.push(sendAudit(record, "send_claimed", input.nowMs));
    return { status: "claimed", record: structuredClone(record) };
  }

  async markConfirmationSent(input: {
    id: string;
    actorUid: string;
    result: GmailSendResult;
    nowMs: number;
    reconciled?: boolean;
  }) {
    const record = this.confirmations.get(input.id);
    if (!record || record.actor_uid !== input.actorUid)
      throw new GmailStateError("Not found.", 404);
    record.state = "sent";
    record.gmail_message_id = input.result.messageId;
    record.gmail_thread_id = input.result.threadId;
    record.updated_at_ms = input.nowMs;
    this.audit.push(
      sendAudit(
        record,
        input.reconciled ? "send_reconciled" : "send_succeeded",
        input.nowMs,
      ),
    );
  }

  async markConfirmationOutcome(input: {
    id: string;
    actorUid: string;
    state: "ambiguous" | "failed";
    nowMs: number;
  }) {
    const record = this.confirmations.get(input.id);
    if (!record || record.actor_uid !== input.actorUid || record.state === "sent") return;
    record.state = input.state;
    record.updated_at_ms = input.nowMs;
    this.audit.push(sendAudit(record, `send_${input.state}`, input.nowMs));
  }

  async saveMailboxState(state: GmailMailboxState) {
    this.mailboxStates.set(state.mailbox_email, structuredClone(state));
  }

  async getMailboxState(mailboxEmail: string) {
    return structuredClone(this.mailboxStates.get(mailboxEmail) ?? null);
  }

  async claimPush(input: {
    messageId: string;
    mailboxEmail: string;
    historyId: string;
    nowMs: number;
  }): Promise<"claimed" | "duplicate"> {
    const existing = this.pushStates.get(input.messageId);
    if (
      existing?.state === "completed" ||
      (existing?.state === "processing" && input.nowMs - existing.updatedAt < 300_000)
    ) {
      return "duplicate";
    }
    this.pushStates.set(input.messageId, { state: "processing", updatedAt: input.nowMs });
    return "claimed";
  }

  async completePush(input: {
    messageId: string;
    mailboxEmail: string;
    historyId: string;
    addedCount: number;
    mode: "history" | "bounded_resync";
    matchedCount?: number;
    nowMs: number;
  }) {
    this.pushStates.set(input.messageId, { state: "completed", updatedAt: input.nowMs });
    const current = this.mailboxStates.get(input.mailboxEmail);
    this.mailboxStates.set(input.mailboxEmail, {
      mailbox_email: input.mailboxEmail,
      user_uid: current?.user_uid ?? "unknown",
      history_id: maxHistoryId(current?.history_id, input.historyId),
      ...(current?.watch_expiration_ms
        ? { watch_expiration_ms: current.watch_expiration_ms }
        : {}),
      last_successful_sync_ms: input.nowMs,
      health: "watching",
      updated_at_ms: input.nowMs,
    });
    this.audit.push({
      action: input.mode,
      added_count: input.addedCount,
      matched_count: input.matchedCount ?? 0,
    });
  }

  async failPush(input: { messageId: string; nowMs: number }) {
    this.pushStates.set(input.messageId, { state: "failed", updatedAt: input.nowMs });
  }

  async saveCommunicationLink(link: WorkflowCommunicationLink) {
    this.communicationLinks.set(link.id, structuredClone(link));
    this.audit.push(workflowAudit(link, "link_saved", link.updated_at_ms));
  }

  async listCommunicationLinks(mailboxEmail: string) {
    const mailboxKey = mailboxDocId(mailboxEmail);
    return [...this.communicationLinks.values()]
      .filter((link) => link.mailbox_key === mailboxKey)
      .sort((left, right) => right.updated_at_ms - left.updated_at_ms)
      .map((link) => structuredClone(link));
  }

  async findCommunicationLink(input: {
    mailboxEmail: string;
    threadId: string;
    context: WorkflowCommunicationContext;
  }) {
    return (
      (await this.listCommunicationLinks(input.mailboxEmail)).find(
        (link) =>
          link.gmail_thread_id === input.threadId &&
          linkMatchesContext(link, input.context),
      ) ?? null
    );
  }

  async findCommunicationLinksByThreadIds(input: {
    mailboxEmail: string;
    threadIds: readonly string[];
  }) {
    const threadIds = new Set(input.threadIds);
    return (await this.listCommunicationLinks(input.mailboxEmail)).filter(
      (link) => link.gmail_thread_id && threadIds.has(link.gmail_thread_id),
    );
  }

  async markCommunicationAttention(input: {
    linkId: string;
    messageId: string;
    nowMs: number;
  }): Promise<"updated" | "duplicate" | "missing"> {
    const link = this.communicationLinks.get(input.linkId);
    if (!link) return "missing";
    if (link.last_message_id === input.messageId) return "duplicate";
    link.status = "attention_required";
    link.last_message_id = input.messageId;
    link.attention_at_ms = input.nowMs;
    delete link.read_at_ms;
    link.updated_at_ms = input.nowMs;
    this.audit.push(workflowAudit(link, "reply_attention_created", input.nowMs));
    return "updated";
  }

  async markCommunicationRead(input: {
    linkId: string;
    mailboxEmail: string;
    nowMs: number;
  }) {
    const link = this.communicationLinks.get(input.linkId);
    if (!link) throw new GmailStateError("Communication attention not found.", 404);
    if (link.mailbox_key !== mailboxDocId(input.mailboxEmail)) {
      throw new GmailStateError(
        "Communication attention belongs to another mailbox.",
        403,
      );
    }
    link.read_at_ms = input.nowMs;
    link.updated_at_ms = input.nowMs;
    this.audit.push(workflowAudit(link, "attention_read", input.nowMs));
  }

  async appendWorkflowActionAudit(input: GmailWorkflowActionAuditInput) {
    this.audit.push({
      actor_uid: input.actorUid,
      mailbox_key: mailboxDocId(input.mailboxEmail),
      communication_id: input.communicationId,
      lane: input.context.lane,
      entity_type: input.context.entityType,
      entity_id: input.context.entityId,
      purpose: input.context.purpose,
      action: input.action,
      gmail_thread_id: input.threadId,
      label: input.label,
      rule_ref: input.ruleRef,
      reason_hash: input.reasonHash,
      created_at_ms: input.nowMs,
    });
  }
}

export class GmailStateError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 | 409,
  ) {
    super(message);
    this.name = "GmailStateError";
  }
}

function sendAudit(record: GmailConfirmationRecord, action: string, createdAtMs: number) {
  return {
    actor_uid: record.actor_uid,
    confirmation_id: record.id,
    payload_hash: record.payload_hash,
    message_id: record.message_id,
    message_kind: record.message_kind,
    workflow_context_key: record.workflow_context_key,
    workflow_lane: record.workflow_lane,
    workflow_entity_type: record.workflow_entity_type,
    workflow_entity_id: record.workflow_entity_id,
    workflow_purpose: record.workflow_purpose,
    ...(record.template_ref ? { template_ref: record.template_ref } : {}),
    action,
    state: record.state,
    ...(record.gmail_message_id ? { gmail_message_id: record.gmail_message_id } : {}),
    ...(record.gmail_thread_id ? { gmail_thread_id: record.gmail_thread_id } : {}),
    created_at_ms: createdAtMs,
  };
}

function mailboxDocId(email: string) {
  return Buffer.from(email.trim().toLowerCase(), "utf8").toString("base64url");
}

export function gmailMailboxKey(email: string) {
  return mailboxDocId(email);
}

function workflowAudit(
  link: WorkflowCommunicationLink,
  action: string,
  createdAtMs: number,
) {
  return {
    communication_id: link.id,
    mailbox_key: link.mailbox_key,
    actor_uid: link.actor_uid,
    lane: link.lane,
    entity_type: link.entity_type,
    entity_id: link.entity_id,
    purpose: link.purpose,
    origin_action_key: link.origin_action_key,
    ...(link.reason_hash ? { reason_hash: link.reason_hash } : {}),
    action,
    status: link.status,
    ...(link.gmail_message_id ? { gmail_message_id: link.gmail_message_id } : {}),
    ...(link.gmail_thread_id ? { gmail_thread_id: link.gmail_thread_id } : {}),
    ...(link.last_message_id ? { last_message_id: link.last_message_id } : {}),
    created_at_ms: createdAtMs,
  };
}

function stripUndefined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function pushDocId(messageId: string) {
  return Buffer.from(messageId, "utf8").toString("base64url");
}

function maxHistoryId(current: string | undefined, incoming: string) {
  if (!current) return incoming;
  try {
    return BigInt(incoming) > BigInt(current) ? incoming : current;
  } catch {
    return current;
  }
}
