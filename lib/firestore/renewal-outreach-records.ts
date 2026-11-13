// S248 R-S248-1 to R-S248-10: the app-owned outreach record a confirmed renewal Send writes, and the
// reads that hand a lease's linked renewal messages, records and Gmail drafts to the one stage
// projection as pure inputs.
//
// ARCH-S248-2: when Gmail accepts the owner renewal message (or the tenant offer) sent through the
// existing confirmed Send, one record for the lease's current cycle is written, bound to the exact
// message (its occurrence and RFC Message-ID) and to the staff confirmation that authorized it (the
// authorization operation, revision and payload hash). The record's id is the occurrence id, so a
// repeat writes nothing new. The write runs after the send has settled and never touches the send:
// a failed write neither repeats the send nor fails it, and the next read rebuilds the same fact
// from the delivery evidence on the communication itself.
//
// R-S248-10: "This was not the renewal outreach" keeps the record and adds the staff correction to
// it with its reason; the correction history stays with the record. Nothing here reads a provider,
// schedules anything, writes a reminder or follow-up (R-S248-12) or touches an action gate.

import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  RENEWAL_WORKSPACE_COLLECTIONS,
  currentRenewalWorkspaceState,
  renewalWorkspaceHeadRefs,
} from "@/lib/firestore/renewal-workspace";
import type {
  CommunicationOccurrence,
  CommunicationSequence,
} from "@/lib/gmail-hub/sequence-model";
import { replyCheckable } from "@/lib/gmail-hub/reply-watch";
import {
  OUTREACH_AUDIENCES,
  type GmailDraftEvidence,
  type LeaseOutreachEvidenceInput,
  type LinkedRenewalMessageEvidence,
  type OutreachAudience,
  type StoredOutreachRecord,
} from "@/lib/lease-renewal/outreach-evidence";
import {
  earlierAttemptsOf,
  unsentWorkEvidence,
} from "@/lib/lease-renewal/unsent-message";

export const RENEWAL_OUTREACH_RECORD_COLLECTION = "renewal_outreach_records";
const SEQUENCE_COLLECTION = "gmail_communication_sequences";
const DRAFT_HEAD_COLLECTION = "renewal_message_draft_heads";
const DRAFT_SNAPSHOT_COLLECTION = "renewal_message_draft_snapshots";
export const RENEWAL_OUTREACH_RECORD_SCHEMA_VERSION = "renewal-outreach-record/v1";
/** Firestore's `in` filter bound. */
const IN_CHUNK = 30;

/** The stored document: the projection's record plus the identities it is bound to. */
export interface RenewalOutreachRecordDocument extends StoredOutreachRecord {
  readonly schemaVersion: typeof RENEWAL_OUTREACH_RECORD_SCHEMA_VERSION;
  readonly origin: "app_send";
  readonly rfcMessageId: string;
  readonly gmailMessageId: string | null;
  /**
   * The staff confirmation that authorized the send: its revision and payload hash, which identify
   * it exactly, and the operation that produced it when the communication kept it (null on a
   * communication authorized before it was kept).
   */
  readonly authorization: {
    readonly operationId: string | null;
    readonly revision: number;
    readonly payloadHash: string;
    readonly approvedByUid: string;
  };
  readonly recordedAtMs: number;
  /** Every staff correction, oldest first; `correction` is the latest. */
  readonly corrections: readonly NonNullable<StoredOutreachRecord["correction"]>[];
}

/** The renewal audience a communication's context names, or null for any other communication. */
export function renewalMessageAudience(
  context: Pick<CommunicationSequence["context"], "lane" | "entityType" | "purpose">,
): OutreachAudience | null {
  if (context.lane !== "renewals" || context.entityType !== "renewal_lease") return null;
  if (context.purpose === "renewal_owner") return "owner";
  if (context.purpose === "renewal_tenant") return "tenant";
  return null;
}

/** The occurrence id inside the app's own RFC Message-ID, `<pmi-{id}@pmikcmetro.com>`. */
export function occurrenceIdFromRfcMessageId(rfcMessageId: string): string | null {
  const match = /^<pmi-([0-9a-f]{64})@pmikcmetro\.com>$/.exec(rfcMessageId);
  return match ? match[1]! : null;
}

/**
 * The communication's evidence the stage projection reads, with no message content. Pure: the
 * accepted attempts are the settled sends on the communication itself, so a missing outreach
 * record is rebuilt from exactly this.
 */
export function linkedRenewalMessageEvidence(
  sequence: CommunicationSequence,
): LinkedRenewalMessageEvidence | null {
  const audience = renewalMessageAudience(sequence.context);
  if (!audience) return null;
  const accepted = sequence.threads
    .flatMap((thread) => {
      const occurrenceId = occurrenceIdFromRfcMessageId(thread.rfcMessageId);
      return occurrenceId
        ? [{ occurrenceId, sentAtMs: thread.sentAtMs, senderEmail: thread.senderEmail }]
        : [];
    })
    .sort((left, right) => left.sentAtMs - right.sentAtMs);
  const inbound = sequence.inbound ?? [];
  const observation = sequence.observation;
  const replyObservation =
    observation?.reason === "source_unavailable" ||
    observation?.reason === "lease_read_settling"
      ? null
      : observation;
  // S273 R-S273-1 / R-S273-5: the unsent authorized work and the earlier attempts, from the stored
  // communication alone; no message body and no recipient address.
  // An older record missing a member reads as holding none; it never fails the whole read.
  let unsent: ReturnType<typeof unsentWorkEvidence> = null;
  let attempts: ReturnType<typeof earlierAttemptsOf> = [];
  try {
    unsent = unsentWorkEvidence(sequence);
    attempts = earlierAttemptsOf(sequence);
  } catch {
    unsent = null;
    attempts = [];
  }
  return {
    ...(unsent ? { unsent } : {}),
    ...(attempts.length ? { attempts } : {}),
    sequenceId: sequence.id,
    audience,
    cycleId: sequence.noticeCycleId ?? null,
    createdAtMs: sequence.createdAtMs,
    scheduledForMs:
      sequence.state === "active" &&
      sequence.confirmedCount === 0 &&
      sequence.authorization?.schedule &&
      sequence.nextDueAtMs !== null
        ? sequence.nextDueAtMs
        : null,
    unconfirmed:
      sequence.state === "needs_reconciliation" &&
      sequence.unresolvedOccurrenceId !== null,
    accepted,
    replies: inbound
      .filter((entry) => entry.kind === "human")
      .map((entry) => ({ id: entry.id, receivedAtMs: entry.receivedAtMs })),
    failedDeliveries: inbound.flatMap((entry) =>
      entry.kind === "bounce" && entry.attemptOccurrenceId
        ? [
            {
              id: entry.id,
              receivedAtMs: entry.receivedAtMs,
              occurrenceId: entry.attemptOccurrenceId,
            },
          ]
        : [],
    ),
    // S275 ARCH-S275-3: the reply observation's last check time and state, and whether a check
    // can still read this message's threads. Times and states only.
    check: {
      checkable: replyCheckable(sequence),
      checkedAtMs:
        typeof replyObservation?.checkedAtMs === "number"
          ? replyObservation.checkedAtMs
          : null,
      state: replyObservation?.state ?? null,
    },
  };
}

/**
 * The record one accepted renewal send writes, or null when the send is not a renewal message
 * (nothing is recorded then). A message sent before the lease had a dated work record names no
 * cycle; its record carries none, and the evidence read places it (AC-S248-4). Pure.
 */
export function outreachRecordForAcceptedSend(
  sequence: CommunicationSequence,
  occurrence: Pick<
    CommunicationOccurrence,
    "id" | "sequenceId" | "rfcMessageId" | "authorizationRevision" | "payloadHash"
  > & { readonly gmailMessageId?: string | null },
  sentAtMs: number,
  nowMs: number,
): RenewalOutreachRecordDocument | null {
  const audience = renewalMessageAudience(sequence.context);
  const cycleId = sequence.noticeCycleId ?? null;
  const authorization = sequence.authorization;
  if (
    !audience ||
    !authorization ||
    occurrence.sequenceId !== sequence.id ||
    occurrenceIdFromRfcMessageId(occurrence.rfcMessageId) !== occurrence.id
  )
    return null;
  return {
    schemaVersion: RENEWAL_OUTREACH_RECORD_SCHEMA_VERSION,
    origin: "app_send",
    occurrenceId: occurrence.id,
    sequenceId: sequence.id,
    leaseId: sequence.context.entityId,
    cycleId,
    audience,
    sentAtMs,
    senderEmail:
      sequence.threads.find((thread) => thread.rfcMessageId === occurrence.rfcMessageId)
        ?.senderEmail ?? authorization.senderEmail,
    rfcMessageId: occurrence.rfcMessageId,
    gmailMessageId: occurrence.gmailMessageId ?? null,
    authorization: {
      // The operation that authorized this exact revision; never a later pause or transfer.
      operationId:
        sequence.authorizationOperation?.revision === occurrence.authorizationRevision
          ? sequence.authorizationOperation.id
          : null,
      revision: occurrence.authorizationRevision,
      payloadHash: occurrence.payloadHash,
      approvedByUid: authorization.approvedByUid,
    },
    recordedAtMs: nowMs,
    correction: null,
    corrections: [],
  };
}

/**
 * Write the outreach record for one accepted send, once. An existing record for the same message
 * is left as it is (a correction staff made stays). Throws only on a storage failure, which the
 * send path swallows.
 */
export async function writeRenewalOutreachRecord(
  record: RenewalOutreachRecordDocument,
  db: Firestore = getAdminFirestore(),
): Promise<"written" | "exists"> {
  const ref = db.collection(RENEWAL_OUTREACH_RECORD_COLLECTION).doc(record.occurrenceId);
  try {
    await ref.create(record);
    return "written";
  } catch (error) {
    // gRPC ALREADY_EXISTS: the record for this exact message is already there.
    if ((error as { code?: number | string }).code === 6) return "exists";
    if ((error as { code?: number | string }).code === "already-exists") return "exists";
    throw error;
  }
}

function storedRecord(value: unknown): StoredOutreachRecord | null {
  const record = value as Partial<RenewalOutreachRecordDocument> | undefined;
  if (
    !record ||
    record.schemaVersion !== RENEWAL_OUTREACH_RECORD_SCHEMA_VERSION ||
    typeof record.occurrenceId !== "string" ||
    typeof record.sequenceId !== "string" ||
    typeof record.leaseId !== "string" ||
    (typeof record.cycleId !== "string" && record.cycleId !== null) ||
    !OUTREACH_AUDIENCES.includes(record.audience as OutreachAudience) ||
    typeof record.sentAtMs !== "number"
  )
    return null;
  return {
    occurrenceId: record.occurrenceId,
    sequenceId: record.sequenceId,
    leaseId: record.leaseId,
    cycleId: record.cycleId ?? null,
    audience: record.audience as OutreachAudience,
    sentAtMs: record.sentAtMs,
    senderEmail: typeof record.senderEmail === "string" ? record.senderEmail : "",
    correction: record.correction ?? null,
  };
}

function chunks<T>(values: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += IN_CHUNK)
    out.push(values.slice(index, index + IN_CHUNK));
  return out;
}

function draftCreated(outcome: unknown): boolean {
  const value = outcome as { status?: string; resolution?: string } | null | undefined;
  return (
    value?.status === "created" ||
    (value?.status === "reconciliation" && value.resolution === "created")
  );
}

/**
 * One bulk read of every listed lease's linked renewal messages, outreach records and Gmail
 * drafts. Read-only. A lease with none reads as empty; a failed read rejects, and the caller then
 * treats every lease's evidence as unreadable rather than empty.
 */
export async function readRenewalOutreachEvidence(
  leaseIds: readonly string[],
  db: Firestore = getAdminFirestore(),
): Promise<Map<string, LeaseOutreachEvidenceInput>> {
  const unique = [...new Set(leaseIds.filter((id) => /^[1-9]\d*$/.test(id)))];
  const messages = new Map<string, LinkedRenewalMessageEvidence[]>();
  const records = new Map<string, StoredOutreachRecord[]>();
  const drafts = new Map<string, GmailDraftEvidence[]>();
  const push = <T>(map: Map<string, T[]>, key: string, value: T) => {
    const list = map.get(key) ?? [];
    list.push(value);
    map.set(key, list);
  };
  await Promise.all(
    chunks(unique).map(async (chunk) => {
      const [sequenceSnapshot, recordSnapshot, headSnapshot] = await Promise.all([
        db.collection(SEQUENCE_COLLECTION).where("context.entityId", "in", chunk).get(),
        db
          .collection(RENEWAL_OUTREACH_RECORD_COLLECTION)
          .where("leaseId", "in", chunk)
          .get(),
        db.collection(DRAFT_HEAD_COLLECTION).where("leaseId", "in", chunk).get(),
      ]);
      for (const doc of sequenceSnapshot.docs) {
        if (doc.get("purged")) continue;
        const sequence = doc.data() as CommunicationSequence;
        if (!sequence?.context || !Array.isArray(sequence.threads)) continue;
        const evidence = linkedRenewalMessageEvidence({ ...sequence, id: doc.id });
        if (evidence) push(messages, sequence.context.entityId, evidence);
      }
      for (const doc of recordSnapshot.docs) {
        const record = storedRecord(doc.data());
        if (record) push(records, record.leaseId, record);
      }
      const heads = headSnapshot.docs.flatMap((doc) => {
        const leaseId = doc.get("leaseId"),
          cycleId = doc.get("cycleId"),
          channel = doc.get("channel"),
          executionId = doc.get("executionId");
        return typeof leaseId === "string" &&
          typeof cycleId === "string" &&
          (channel === "owner" || channel === "tenant") &&
          typeof executionId === "string" &&
          executionId
          ? [{ leaseId, cycleId, channel: channel as OutreachAudience, executionId }]
          : [];
      });
      const snapshots = heads.length
        ? await db.getAll(
            ...heads.map((head) =>
              db.collection(DRAFT_SNAPSHOT_COLLECTION).doc(head.executionId),
            ),
          )
        : [];
      heads.forEach((head, index) => {
        const snapshot = snapshots[index];
        if (!snapshot?.exists || !draftCreated(snapshot.get("outcome"))) return;
        const recordedAt = Date.parse(String(snapshot.get("recordedAt") ?? ""));
        if (!Number.isFinite(recordedAt)) return;
        push(drafts, head.leaseId, {
          audience: head.channel,
          cycleId: head.cycleId,
          createdAtMs: recordedAt,
        });
      });
    }),
  );
  return new Map(
    unique.map((leaseId) => [
      leaseId,
      {
        readable: true,
        messages: messages.get(leaseId) ?? [],
        records: records.get(leaseId) ?? [],
        drafts: drafts.get(leaseId) ?? [],
      },
    ]),
  );
}

/** One lease's evidence; an unreadable read projects nothing derived. */
export async function readLeaseOutreachEvidence(
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseOutreachEvidenceInput> {
  const read = await readRenewalOutreachEvidence([leaseId], db);
  return read.get(leaseId) ?? { readable: true, messages: [], records: [], drafts: [] };
}

export const CorrectRenewalOutreachSchema = z
  .object({
    leaseId: z.string().regex(/^[1-9]\d*$/),
    // Null while the lease has no work record yet; the record then names no cycle either.
    cycleId: z.string().uuid().nullable(),
    audience: z.enum(OUTREACH_AUDIENCES),
    // The communication that holds the message, read exactly (never a bounded lease query).
    sequenceId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
    occurrenceId: z.string().regex(/^[0-9a-f]{64}$/),
    reason: z.string().trim().min(1).max(500),
    operationId: z.string().uuid(),
  })
  .strict();
export type CorrectRenewalOutreachInput = z.infer<typeof CorrectRenewalOutreachSchema>;

/**
 * R-S248-10 "This was not the renewal outreach": staff remove a derived outreach record with a
 * reason. The record stays, with the correction added to its history, so the step reopens and the
 * reason stays readable, and the lease's staff activity history gains one entry for it. A record
 * the send path did not write is created from the delivery evidence first, so a correction always
 * has its record. The correction names the lease's current work record (or none), and is refused
 * when that record changed. Repeating the same operation changes nothing.
 */
export async function correctRenewalOutreach(
  actor: AuthenticatedUser,
  input: CorrectRenewalOutreachInput,
  db: Firestore = getAdminFirestore(),
  nowMs: number = Date.now(),
): Promise<StoredOutreachRecord> {
  if (!can(actor.role, "edit") || isVerificationAccount(actor))
    throw new EditableLayerError("Renewals staff authority is required.", 403);
  assertMutationAllowed(requireEnvironmentDescriptor());
  const rfcMessageId = `<pmi-${input.occurrenceId}@pmikcmetro.com>`;
  const ref = db.collection(RENEWAL_OUTREACH_RECORD_COLLECTION).doc(input.occurrenceId);
  const holderRef = db.collection(SEQUENCE_COLLECTION).doc(input.sequenceId);
  const heads = renewalWorkspaceHeadRefs(db, input.leaseId);
  const activityRef = db
    .collection(RENEWAL_WORKSPACE_COLLECTIONS.activity)
    .doc(input.operationId);
  return db.runTransaction(async (tx) => {
    const [snapshot, holderSnapshot, dated, leaseBound, priorActivity] =
      await Promise.all([
        tx.get(ref),
        tx.get(holderRef),
        tx.get(heads.dated),
        tx.get(heads.leaseBound),
        tx.get(activityRef),
      ]);
    let record = snapshot.exists
      ? (snapshot.data() as RenewalOutreachRecordDocument)
      : null;
    const operations = (record as { correctionOperations?: string[] } | null)
      ?.correctionOperations;
    if (record && operations?.includes(input.operationId)) return storedRecord(record)!;
    if (priorActivity.exists)
      throw new EditableLayerError(
        "This correction's identity was already used. Reload the lease.",
        409,
      );
    // The lease's current work record: the correction names exactly that cycle, or none.
    const current = currentRenewalWorkspaceState(db, input.leaseId, dated, leaseBound);
    if ((current?.cycleId ?? null) !== input.cycleId)
      throw new EditableLayerError(
        "The lease's work record changed. Reload the lease and review the outreach again.",
        409,
      );
    const holder =
      holderSnapshot.exists && !holderSnapshot.get("purged")
        ? ({
            ...(holderSnapshot.data() as CommunicationSequence),
            id: holderSnapshot.id,
          } as CommunicationSequence)
        : null;
    if (!record) {
      const thread =
        holder && holder.context?.entityId === input.leaseId
          ? holder.threads?.find((entry) => entry.rfcMessageId === rfcMessageId)
          : undefined;
      const built =
        holder && thread
          ? outreachRecordForAcceptedSend(
              holder,
              {
                id: input.occurrenceId,
                sequenceId: holder.id,
                rfcMessageId,
                authorizationRevision: holder.authorization?.revision ?? 0,
                payloadHash: holder.authorization?.payloadHash ?? "",
                gmailMessageId: thread.messageId,
              },
              thread.sentAtMs,
              nowMs,
            )
          : null;
      if (!built)
        throw new EditableLayerError(
          "This message is not a renewal message the app sent for this lease. Reload the lease.",
          409,
        );
      record = built;
    }
    if (
      record.leaseId !== input.leaseId ||
      record.sequenceId !== input.sequenceId ||
      (record.cycleId !== input.cycleId && record.cycleId !== null) ||
      record.audience !== input.audience
    )
      throw new EditableLayerError(
        "This outreach record belongs to another lease, cycle or audience. Reload the lease.",
        409,
      );
    if (record.correction)
      // Already removed; the earlier reason stands and nothing is added.
      return storedRecord(record)!;
    const correction = { reason: input.reason, byUid: actor.uid, atMs: nowMs };
    const next = {
      ...record,
      correction,
      corrections: [...(record.corrections ?? []), correction],
      correctionOperations: [...(operations ?? []), input.operationId],
    };
    tx.set(ref, next);
    // R-S248-11: a Sheet value this message prepared and not yet confirmed is withdrawn with it;
    // one already read back stays on record.
    const derivedField = current
      ? Object.entries(current.sourceUpdates).find(
          ([, entry]) =>
            entry.derivedFrom?.occurrenceId === input.occurrenceId &&
            entry.state !== "verified",
        )?.[0]
      : undefined;
    if (current && derivedField) {
      const sourceUpdates = Object.fromEntries(
        Object.entries(current.sourceUpdates).filter(([field]) => field !== derivedField),
      );
      const withdrawn = { ...current, revision: current.revision + 1, sourceUpdates };
      tx.set(dated.exists ? heads.dated : heads.leaseBound, withdrawn);
      tx.set(
        db.collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles).doc(current.cycleId),
        withdrawn,
      );
    }
    // The staff activity history the lease's other recorded work writes to.
    tx.create(activityRef, {
      lease_id: input.leaseId,
      cycle_id: input.cycleId,
      actor_uid: actor.uid,
      recorded_at: new Date(nowMs).toISOString(),
      action: {
        kind: "outreach_correction",
        audience: input.audience,
        sequenceId: input.sequenceId,
        occurrenceId: input.occurrenceId,
        reason: input.reason,
        ...(derivedField ? { withdrawnSourceUpdate: derivedField } : {}),
      },
      previous_revision: current?.revision ?? 0,
    });
    return storedRecord(next)!;
  });
}
