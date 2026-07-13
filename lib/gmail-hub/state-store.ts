// Minimal, bodyless Gmail operational state. Firestore transactions bind one-time send confirmation,
// idempotency, watch cursor advancement, and Pub/Sub replay dedupe. No method accepts a body, raw MIME,
// attachment, prompt, or bearer token.

import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { getAdminFirestore } from "@/lib/firestore/admin";
import type { GmailSendResult } from "@/lib/gmail-runtime/types";

export const GMAIL_STATE_COLLECTIONS = {
  confirmations: "gmail_send_confirmations",
  sendAudit: "gmail_send_audit",
  mailboxState: "gmail_mailbox_state",
  pushDedupe: "gmail_push_dedupe",
  syncAudit: "gmail_sync_audit",
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

export interface GmailStateStore {
  createConfirmation(record: GmailConfirmationRecord): Promise<void>;
  getConfirmation(id: string): Promise<GmailConfirmationRecord | null>;
  claimConfirmation(input: {
    id: string;
    actorUid: string;
    payloadHash: string;
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
    nowMs: number;
  }): Promise<void>;
  failPush(input: { messageId: string; nowMs: number }): Promise<void>;
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
    nowMs: number;
  }): Promise<ClaimConfirmationResult> {
    const ref = this.db.collection(GMAIL_STATE_COLLECTIONS.confirmations).doc(input.id);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return { status: "mismatch" as const };
      const record = snapshot.data() as GmailConfirmationRecord;
      if (
        record.actor_uid !== input.actorUid ||
        record.payload_hash !== input.payloadHash
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
}

export class MemoryGmailStateStore implements GmailStateStore {
  readonly confirmations = new Map<string, GmailConfirmationRecord>();
  readonly mailboxStates = new Map<string, GmailMailboxState>();
  readonly pushStates = new Map<string, { state: string; updatedAt: number }>();
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
    nowMs: number;
  }): Promise<ClaimConfirmationResult> {
    const record = this.confirmations.get(input.id);
    if (
      !record ||
      record.actor_uid !== input.actorUid ||
      record.payload_hash !== input.payloadHash
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
    this.audit.push({ action: input.mode, added_count: input.addedCount });
  }

  async failPush(input: { messageId: string; nowMs: number }) {
    this.pushStates.set(input.messageId, { state: "failed", updatedAt: input.nowMs });
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
