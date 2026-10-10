import { createHash } from "node:crypto";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  communicationsRetentionFields,
  sequenceRetentionFields,
} from "./retention-policy";
import { GMAIL_STATE_COLLECTIONS, gmailMailboxKey } from "./state-store";
import { RichCommunicationMessageSchema, communicationSendKey } from "./sequence-model";
import { localDateAt, nextOccurrence } from "./schedule-calendar";
import type { CommunicationOccurrence, CommunicationSequence } from "./sequence-model";
import type { GmailSendResult } from "@/lib/gmail-runtime/types";

export const COMMUNICATION_SEQUENCE_COLLECTIONS = {
  sequences: "gmail_communication_sequences",
  occurrences: "gmail_communication_occurrences",
  operations: "gmail_communication_operations",
  audit: "gmail_workflow_communication_audit",
  attachments: "gmail_communication_attachments",
  worker: "gmail_communication_worker_state",
} as const;
export function sequenceHash(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, val]) => [k, canonical(val)]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
/** Exact basis already checked and serialized by this dispatcher; a newer occurrence needs fresh preparation. */
export interface PreparedCommunicationDispatch {
  materialSourceHash: string;
  authorizationRevision: number;
  payloadHash: string;
  senderEmail: string;
  confirmedCount: number;
}
export interface SequenceStore {
  get(id: string): Promise<CommunicationSequence | null>;
  list(
    after?: string | null,
    limit?: number,
  ): Promise<{ sequences: CommunicationSequence[]; cursor: string | null }>;
  write(input: {
    id: string;
    actorUid: string;
    operationId: string;
    operationHash: string;
    expectedVersion: number;
    nowMs: number;
    action: string;
    apply(current: CommunicationSequence | null): CommunicationSequence;
  }): Promise<CommunicationSequence>;
  claim(
    id: string,
    nowMs: number,
    prepared: PreparedCommunicationDispatch,
    threading?: CommunicationOccurrence["threading"],
  ): Promise<{
    sequence: CommunicationSequence;
    occurrence: CommunicationOccurrence;
  } | null>;
  canDispatch(occurrence: CommunicationOccurrence): Promise<boolean>;
  settle(
    occurrence: CommunicationOccurrence,
    input: {
      nowMs: number;
      result?: GmailSendResult;
      sentAtMs?: number;
      outcome?: "ambiguous" | "refused";
      reason?: CommunicationOccurrence["reason"];
    },
  ): Promise<CommunicationSequence>;
  observe(
    id: string,
    input: {
      authorizationRevision: number;
      checkedAtMs: number;
      messageIds: string[];
      pause: "reply" | "bounce" | "source_unavailable" | null;
      historyId: string | null;
      mailboxHistoryIds?: Record<string, string>;
      complete: boolean;
    },
  ): Promise<CommunicationSequence>;
  getOccurrence(id: string): Promise<CommunicationOccurrence | null>;
}
function missing(): never {
  throw new EditableLayerError("This communication no longer exists.", 404);
}
function conflict(): never {
  throw new EditableLayerError(
    "This communication changed. Reload its current state; your wording is kept.",
    409,
  );
}
/** Firestore forbids arrays directly inside arrays; the wire/editor model stays unchanged. */
function storedSequence(s: CommunicationSequence) {
  const message = (m: CommunicationSequence["initial"]) => ({
    ...m,
    paragraphs: m.paragraphs.map((runs) => ({ runs })),
  });
  return {
    ...s,
    ...sequenceRetentionFields(s),
    retention_attachment_ids: [
      ...new Set([
        ...s.initial.attachmentIds,
        ...(s.followUp?.attachmentIds ?? []),
        ...(s.authorization?.initial.attachments.map((a) => a.id) ?? []),
        ...(s.authorization?.followUp?.attachments.map((a) => a.id) ?? []),
      ]),
    ],
    initial: message(s.initial),
    followUp: s.followUp ? message(s.followUp) : null,
  };
}
function assertRecord(data: unknown): CommunicationSequence {
  try {
    const raw = data as ReturnType<typeof storedSequence>;
    if (
      !raw ||
      raw.schemaVersion !== "workflow-communication-sequence/v1" ||
      !Number.isSafeInteger(raw.version) ||
      raw.version < 1
    )
      throw new Error("Invalid sequence header");
    const message = (m: ReturnType<typeof storedSequence>["initial"]) =>
      RichCommunicationMessageSchema.parse({
        ...m,
        paragraphs: m.paragraphs.map((p) => p.runs),
      });
    return {
      ...raw,
      initial: message(raw.initial),
      followUp: raw.followUp ? message(raw.followUp) : null,
    };
  } catch {
    throw new EditableLayerError("This communication state needs reconciliation.", 409);
  }
}
/** One durable sequence owner alongside existing workflow links/receipts, never a second provider ledger. */
export class FirestoreCommunicationSequenceStore implements SequenceStore {
  constructor(readonly db: Firestore = getAdminFirestore()) {}
  private ref(id: string) {
    return this.db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences).doc(id);
  }
  async get(id: string) {
    const s = await this.ref(id).get();
    return s.exists && !s.get("purged") ? assertRecord(s.data()) : null;
  }
  async list(after: string | null = null, limit = 50) {
    const base = this.db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
      .orderBy(FieldPath.documentId());
    const page = await (after ? base.startAfter(after) : base)
      .limit(Math.min(100, Math.max(1, limit)))
      .get();
    return {
      sequences: page.docs
        .filter((doc) => !doc.get("purged"))
        .map((doc) => assertRecord(doc.data())),
      cursor: page.size === limit ? page.docs.at(-1)!.id : null,
    };
  }
  async getOccurrence(id: string) {
    const s = await this.db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences)
      .doc(id)
      .get();
    return s.exists ? (s.data() as CommunicationOccurrence) : null;
  }
  async write(i: Parameters<SequenceStore["write"]>[0]) {
    const operationRef = this.db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.operations)
      .doc(sequenceHash([i.id, i.operationId]));
    return this.db.runTransaction(async (tx) => {
      const [snapshot, op] = await Promise.all([
        tx.get(this.ref(i.id)),
        tx.get(operationRef),
      ]);
      if (snapshot.get("purged"))
        throw new EditableLayerError(
          "This retired communication cannot be recreated. Start a new communication from the current record.",
          409,
        );
      const current = snapshot.exists ? assertRecord(snapshot.data()) : null;
      if (op.exists) {
        if (op.data()?.hash !== i.operationHash || op.data()?.actorUid !== i.actorUid)
          conflict();
        return current ?? missing();
      }
      if ((current?.version ?? 0) !== i.expectedVersion) conflict();
      const next = {
        ...i.apply(current),
        legal_hold: current?.legal_hold === true,
        ...(current?.operational_hold !== undefined
          ? { operational_hold: current.operational_hold }
          : {}),
        ...(current?.retention_anchor_at_ms !== undefined
          ? { retention_anchor_at_ms: current.retention_anchor_at_ms }
          : {}),
      };
      if (next.id !== i.id || next.version !== i.expectedVersion + 1)
        throw new Error("Invalid communication transition.");
      if (Buffer.byteLength(JSON.stringify(next), "utf8") > 750_000)
        throw new EditableLayerError(
          "This communication exceeds its supported size.",
          400,
        );
      const attachmentIds = [
        ...new Set([
          ...next.initial.attachmentIds,
          ...(next.followUp?.attachmentIds ?? []),
        ]),
      ];
      const files = await Promise.all(
        attachmentIds.map((id) =>
          tx.get(
            this.db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.attachments).doc(id),
          ),
        ),
      );
      if (
        files.some(
          (file) =>
            !file.exists ||
            file.get("purged") ||
            file.get("state") !== "ready" ||
            file.get("scopeKey") !==
              sequenceHash([
                next.context.lane,
                next.context.entityType,
                next.context.entityId,
                next.context.purpose,
              ]),
        )
      )
        throw new EditableLayerError(
          "A selected file is no longer ready. Your wording is kept; remove or replace that file.",
          409,
        );
      tx.set(this.ref(i.id), storedSequence(next));
      tx.create(operationRef, {
        actorUid: i.actorUid,
        sequenceId: i.id,
        hash: i.operationHash,
        version: next.version,
        createdAtMs: i.nowMs,
        ...communicationsRetentionFields("bodyless_audit", i.nowMs),
      });
      tx.create(
        this.db
          .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.audit)
          .doc(sequenceHash([i.id, i.operationId, "audit"])),
        {
          action: i.action,
          sequenceId: i.id,
          actorUid: i.actorUid,
          version: next.version,
          atMs: i.nowMs,
          state: next.state,
          ...communicationsRetentionFields("bodyless_audit", i.nowMs),
        },
      );
      return next;
    });
  }
  async claim(
    id: string,
    nowMs: number,
    prepared: PreparedCommunicationDispatch,
    threading?: CommunicationOccurrence["threading"],
  ) {
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(this.ref(id));
      if (!snapshot.exists || snapshot.get("purged")) return null;
      const s = assertRecord(snapshot.data());
      const a = s.authorization;
      if (
        s.state !== "active" ||
        !a ||
        s.nextDueAtMs === null ||
        s.nextDueAtMs > nowMs ||
        s.unresolvedOccurrenceId
      )
        return null;
      if (
        a.materialSourceHash !== prepared.materialSourceHash ||
        a.revision !== prepared.authorizationRevision ||
        a.payloadHash !== prepared.payloadHash ||
        a.senderEmail !== prepared.senderEmail ||
        s.confirmedCount !== prepared.confirmedCount ||
        a.approvedByUid !== s.responsibleUid ||
        a.senderEmail !== s.senderEmail
      )
        return null;
      if (s.confirmedCount > 0 && !a.followUp) return null;
      if (a.schedule?.sendLimit && s.confirmedCount >= a.schedule.sendLimit) return null;
      const localDue = a.schedule ? localDateAt(nowMs, a.schedule.timeZone) : null;
      if (a.schedule?.endDate && localDue && localDue > a.schedule.endDate) {
        tx.set(
          this.ref(id),
          storedSequence({
            ...s,
            state: "completed",
            nextDueAtMs: null,
            updatedAtMs: nowMs,
          }),
        );
        return null;
      }
      const occurrenceId = sequenceHash([id, a.revision, s.confirmedCount]);
      const ref = this.db
        .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences)
        .doc(occurrenceId);
      const previous = await tx.get(ref);
      if (previous.exists) return null; // any admitted attempt excludes a second call, including after a crash
      const occurrence: CommunicationOccurrence = {
        id: occurrenceId,
        sequenceId: id,
        authorizationRevision: a.revision,
        index: s.confirmedCount,
        state: "claimed",
        senderEmail: a.senderEmail,
        rfcMessageId: `<pmi-${occurrenceId}@pmikcmetro.com>`,
        ...(threading ? { threading } : {}),
        payloadHash: a.payloadHash,
        claimedAtMs: nowMs,
      };
      const next: CommunicationSequence = {
        ...s,
        unresolvedOccurrenceId: occurrenceId,
        updatedAtMs: nowMs,
      };
      tx.create(ref, {
        ...occurrence,
        ...communicationsRetentionFields("bodyless_audit", nowMs),
      });
      tx.set(this.ref(id), storedSequence(next));
      return { sequence: next, occurrence };
    });
  }
  async canDispatch(o: CommunicationOccurrence) {
    const s = await this.get(o.sequenceId);
    return (
      !!s &&
      s.state === "active" &&
      s.unresolvedOccurrenceId === o.id &&
      s.authorization?.revision === o.authorizationRevision &&
      s.authorization.payloadHash === o.payloadHash &&
      s.senderEmail === o.senderEmail
    );
  }
  async settle(o: CommunicationOccurrence, i: Parameters<SequenceStore["settle"]>[1]) {
    const ref = this.db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences)
      .doc(o.id);
    return this.db.runTransaction(async (tx) => {
      const [snapshot, attempt] = await Promise.all([
        tx.get(this.ref(o.sequenceId)),
        tx.get(ref),
      ]);
      const s = snapshot.exists ? assertRecord(snapshot.data()) : missing();
      const current = attempt.data() as CommunicationOccurrence | undefined;
      if (
        !current ||
        current.sequenceId !== s.id ||
        current.payloadHash !== o.payloadHash ||
        current.rfcMessageId !== o.rfcMessageId
      )
        conflict();
      if (current.state === "sent" || current.state === "refused") {
        if (
          i.result &&
          (current.state !== "sent" ||
            current.gmailMessageId !== i.result.messageId ||
            current.gmailThreadId !== i.result.threadId)
        )
          throw new EditableLayerError(
            "The provider readback conflicts with the owned terminal receipt. Operator reconciliation is required.",
            409,
          );
        return s;
      }
      if (s.unresolvedOccurrenceId !== o.id) conflict();
      if (i.result) {
        const sentAtMs = i.sentAtMs ?? i.nowMs;
        const count = s.confirmedCount + 1;
        const a = s.authorization;
        const due =
          a?.schedule && a.followUp ? nextOccurrence(a.schedule, sentAtMs, count) : null;
        // A pause/cancel/transfer ordered after claim remains in force even when the admitted send settles.
        const active = s.state === "active";
        const state = active
          ? due === null
            ? "completed"
            : "active"
          : s.state === "needs_reconciliation"
            ? "paused"
            : s.state;
        const threads = [
          ...s.threads,
          {
            senderEmail: o.senderEmail,
            threadId: i.result.threadId,
            messageId: i.result.messageId,
            rfcMessageId: o.rfcMessageId,
            sentAtMs,
          },
        ];
        const next: CommunicationSequence = {
          ...s,
          state,
          confirmedCount: count,
          lastSentAtMs: sentAtMs,
          nextDueAtMs: state === "active" ? due : null,
          unresolvedOccurrenceId: null,
          threads,
          updatedAtMs: i.nowMs,
        };
        tx.set(ref, {
          ...current,
          state: "sent",
          gmailMessageId: i.result.messageId,
          gmailThreadId: i.result.threadId,
          sentAtMs,
          settledAtMs: i.nowMs,
        });
        tx.set(this.ref(s.id), storedSequence(next));
        tx.set(
          this.db
            .collection(GMAIL_STATE_COLLECTIONS.workflowLinks)
            .doc(`sequence-${o.id}`),
          {
            id: `sequence-${o.id}`,
            sequence_id: s.id,
            actor_uid: a!.approvedByUid,
            mailbox_key: gmailMailboxKey(o.senderEmail),
            lane: s.context.lane,
            entity_type: s.context.entityType,
            entity_id: s.context.entityId,
            purpose: s.context.purpose,
            origin_action_key: communicationSendKey(s.context),
            source_refs: a!.sourceRefs,
            gmail_message_id: i.result.messageId,
            gmail_thread_id: i.result.threadId,
            status: "sent",
            created_at_ms: sentAtMs,
            updated_at_ms: i.nowMs,
            ...communicationsRetentionFields("workflow_link", i.nowMs),
          },
        );
        return next;
      }
      const outcome = i.outcome ?? "ambiguous";
      const next: CommunicationSequence = {
        ...s,
        state:
          s.state === "active" || s.state === "needs_reconciliation"
            ? outcome === "ambiguous"
              ? "needs_reconciliation"
              : "paused"
            : s.state,
        unresolvedOccurrenceId: outcome === "ambiguous" ? o.id : null,
        nextDueAtMs: null,
        updatedAtMs: i.nowMs,
        pause: s.pause ?? {
          cause: "source_unavailable",
          byUid: "communication-worker",
          atMs: i.nowMs,
          evidenceIds: [o.id],
        },
      };
      tx.set(ref, {
        ...current,
        state: outcome,
        settledAtMs: i.nowMs,
        ...(i.reason ? { reason: i.reason } : {}),
      });
      tx.set(this.ref(s.id), storedSequence(next));
      return next;
    });
  }
  async observe(id: string, i: Parameters<SequenceStore["observe"]>[1]) {
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(this.ref(id));
      const s = snapshot.exists ? assertRecord(snapshot.data()) : missing();
      if (
        s.authorization?.revision !== i.authorizationRevision ||
        (s.observation && s.observation.checkedAtMs > i.checkedAtMs)
      )
        return s;
      const fresh = i.messageIds.filter(
        (message) => !s.observedMessageIds.includes(message),
      );
      const pause = fresh.length ? i.pause : null;
      const shouldPause =
        !!pause &&
        (s.state === "active" ||
          s.state === "needs_reconciliation" ||
          (s.state === "paused" && pause !== "source_unavailable"));
      const next: CommunicationSequence = {
        ...s,
        version: s.version + (shouldPause ? 1 : 0),
        state: shouldPause && s.state !== "needs_reconciliation" ? "paused" : s.state,
        nextDueAtMs: shouldPause ? null : s.nextDueAtMs,
        pause: shouldPause
          ? {
              cause: pause as "reply" | "bounce" | "source_unavailable",
              byUid: "communication-observer",
              atMs: i.checkedAtMs,
              evidenceIds: fresh,
            }
          : s.pause,
        observedMessageIds: [
          ...new Set([...s.observedMessageIds, ...i.messageIds]),
        ].slice(-2000),
        observation: {
          checkedAtMs: i.checkedAtMs,
          state: i.complete ? "current" : "unavailable",
          historyId: i.historyId,
          mailboxHistoryIds: i.mailboxHistoryIds ?? {},
        },
        updatedAtMs: i.checkedAtMs,
      };
      tx.set(this.ref(id), storedSequence(next));
      return next;
    });
  }
}
