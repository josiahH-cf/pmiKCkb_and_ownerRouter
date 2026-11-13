import { assertSenderSignatureChoice } from "@/lib/firestore/renewal-sender-signature-choice";
import { createHash } from "node:crypto";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { assertRenewalDispositionVersion } from "@/lib/firestore/renewal-cycle-disposition-read";
import { offerChargeMappingVersionIn } from "@/lib/firestore/renewal-offer-charge-mappings";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  communicationsRetentionFields,
  sequenceRetentionFields,
} from "./retention-policy";
import { GMAIL_STATE_COLLECTIONS, gmailMailboxKey } from "./state-store";
import {
  INBOUND_EVIDENCE_LIMIT,
  RichCommunicationMessageSchema,
  WorkingCommunicationMessageSchema,
  communicationSendKey,
} from "./sequence-model";
import { localDateAt, nextOccurrence } from "./schedule-calendar";
import { RenewalResourceSettingsSchema } from "@/lib/lease-renewal/resource-locations";
import { tenantResourceUses } from "@/lib/lease-renewal/tenant-resource-evidence";
import {
  authorizedOccurrenceBasis,
  tenantResourceEffectVerdict,
} from "@/lib/lease-renewal/tenant-resource-inclusion";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import { replyWatchApplies, type ReplyWatchEnded } from "./reply-watch";
import {
  TENANT_RESPONSE_PAUSE_CAUSE,
  recordedTenantResponseOf,
  tenantReminderScope,
  tenantResponseHolds,
  tenantResponsePause,
  type RecordedTenantResponse,
} from "./tenant-response-hold";
import {
  CommunicationSequenceRefusedError,
  currentMessageGuardKey,
  currentMessageRefusal,
  isCurrentMessageScope,
  newerInitialSend,
  relatedSequenceView,
  type RelatedSequenceView,
} from "./current-message";
import {
  appendUnsentHistory,
  unsentAttemptOnSettle,
} from "@/lib/lease-renewal/unsent-message";
import type {
  CommunicationInboundEvidence,
  CommunicationOccurrence,
  CommunicationSequence,
  SequenceObservationFailure,
  SequenceState,
  VerifiedCommunicationTarget,
} from "./sequence-model";
import type { GmailSendResult } from "@/lib/gmail-runtime/types";

export const COMMUNICATION_SEQUENCE_COLLECTIONS = {
  sequences: "gmail_communication_sequences",
  occurrences: "gmail_communication_occurrences",
  operations: "gmail_communication_operations",
  audit: "gmail_workflow_communication_audit",
  attachments: "gmail_communication_attachments",
  worker: "gmail_communication_worker_state",
} as const;
/** S233: every state the worker can still observe or send for; terminal states are excluded. */
export const OPEN_SEQUENCE_STATES = [
  "draft",
  "active",
  "paused",
  "needs_reconciliation",
] as const satisfies readonly SequenceState[];
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
export function reviewedCommunicationTargetHash(target: VerifiedCommunicationTarget) {
  return sequenceHash({
    to: target.to,
    cc: target.cc,
    materialSourceHash: target.materialSourceHash,
    ...(target.outgoingContract ? { signatureSetup: target.signatureSetup ?? null } : {}),
  });
}

/** Exact basis already checked and serialized by this dispatcher; a newer occurrence needs fresh preparation. */
export interface PreparedCommunicationDispatch {
  materialSourceHash: string;
  authorizationRevision: number;
  payloadHash: string;
  senderEmail: string;
  confirmedCount: number;
  dispositionRevision?: number;
}
export interface SequenceStore {
  get(id: string): Promise<CommunicationSequence | null>;
  list(
    after?: string | null,
    limit?: number,
    /** S233: the worker pages only open records, so completed or cancelled work never uses its budget. */
    filter?: { openOnly?: boolean },
  ): Promise<{ sequences: CommunicationSequence[]; cursor: string | null }>;
  write(input: {
    id: string;
    actorUid: string;
    operationId: string;
    operationHash: string;
    expectedVersion: number;
    nowMs: number;
    action: string;
    dispositionRevision?: number;
    initialTenantAuthorization?: boolean;
    /**
     * S272 ARCH-S272-2: apply the one-current-message rules in this transaction, against the
     * stored sequences for the same lease and audience: an older authorization after a newer
     * confirmed send (R-S272-4) and another unsent initial message (R-S272-3). A refusal throws the
     * typed refusal and writes nothing.
     */
    currentMessage?: boolean;
    apply(current: CommunicationSequence | null): CommunicationSequence;
  }): Promise<CommunicationSequence>;
  /**
   * S272: the stored sequences for one lease (every audience, reply and state), as the
   * one-current-message rules read them. Optional so a store without it applies the rules only in
   * its transactions.
   */
  relatedRenewalSequences?(entityId: string): Promise<RelatedSequenceView[]>;
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
      pause: "reply" | "bounce" | "unexpected_sender" | null;
      historyId: string | null;
      mailboxHistoryIds?: Record<string, string>;
      complete: boolean;
      /** S233 R-S233-4: why an incomplete check did not read cleanly; default a read failure. */
      reason?: SequenceObservationFailure;
      /** S233 R-S233-1: the classified evidence for each id in `messageIds`. */
      messages?: CommunicationInboundEvidence[];
    },
  ): Promise<CommunicationSequence>;
  getOccurrence(id: string): Promise<CommunicationOccurrence | null>;
  /** S233 R-S233-1: this communication's attempts, oldest first, at most `limit`. */
  listOccurrences(
    sequenceId: string,
    limit?: number,
  ): Promise<{ occurrences: CommunicationOccurrence[]; truncated: boolean }>;
  /**
   * S275 R-S275-1: one page of watched messages, by the indexed marker alone, so completed and
   * cancelled history never enters the page.
   */
  listWatched?(
    after: string | null,
    limit: number,
  ): Promise<{ sequences: CommunicationSequence[]; cursor: string | null }>;
  /**
   * S275 R-S275-7: one page of completed renewal records for the one-time catch-up of messages
   * sent before the marker existed. The worker stops calling it once a pass reaches the end.
   */
  listCatchUp?(
    after: string | null,
    limit: number,
  ): Promise<{ sequences: CommunicationSequence[]; cursor: string | null }>;
  /** S275 R-S275-2: the open and watched messages a reply check reads, capped. */
  listReplyCheckable?(limit: number): Promise<CommunicationSequence[]>;
  /** S275 R-S275-1: end one message's watch with its reason; no other field changes. */
  endReplyWatch?(id: string, ended: ReplyWatchEnded): Promise<CommunicationSequence>;
}

/**
 * S276 R-S276-3: the lease's two work-record heads by the store's own collection names (the dated
 * head first, otherwise the lease-bound record), so the claim transaction reads the recorded tenant
 * response without importing the work-record store (which imports this one).
 */
const RENEWAL_WORK_RECORD_HEADS = [
  "lease_renewal_workspaces",
  "lease_renewal_lease_bound_workspaces",
] as const;
function renewalWorkRecordHeadRefs(db: Firestore, leaseId: string) {
  const docId = createHash("sha256").update(leaseId).digest("hex");
  return RENEWAL_WORK_RECORD_HEADS.map((collection) =>
    db.collection(collection).doc(docId),
  );
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
  const followUp = s.followUp ? message(s.followUp) : null;
  const followUpComplete =
    !!s.followUp && RichCommunicationMessageSchema.safeParse(s.followUp).success;
  return {
    ...s,
    ...sequenceRetentionFields(s),
    // S275 R-S275-1: the indexed watched marker, derived on every write so it can never disagree
    // with the record it marks; a cancelled or answered message drops off the watched page.
    replyWatch: replyWatchApplies(s),
    retention_attachment_ids: [
      ...new Set([
        ...s.initial.attachmentIds,
        ...(s.followUp?.attachmentIds ?? []),
        ...(s.authorization?.initial.attachments.map((a) => a.id) ?? []),
        ...(s.authorization?.followUp?.attachments.map((a) => a.id) ?? []),
      ]),
    ],
    initial: message(s.initial),
    // Older readers retain a usable sequence if the current follow-up is still being written.
    followUp: followUpComplete ? followUp : null,
    ...(followUp && !followUpComplete ? { workingFollowUp: followUp } : {}),
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
    const message = (m: ReturnType<typeof storedSequence>["initial"]) => ({
      ...m,
      paragraphs: m.paragraphs.map((p) => p.runs),
    });
    const { workingFollowUp, ...sequence } = raw;
    return {
      ...sequence,
      initial: RichCommunicationMessageSchema.parse(message(raw.initial)),
      followUp: raw.followUp
        ? RichCommunicationMessageSchema.parse(message(raw.followUp))
        : workingFollowUp
          ? WorkingCommunicationMessageSchema.parse(message(workingFollowUp))
          : null,
    };
  } catch {
    throw new EditableLayerError("This communication state needs reconciliation.", 409);
  }
}
/** S272: stored sequence documents as related views; a purged or unusable record is skipped. */
function relatedViews(
  docs: readonly { id: string; data(): Record<string, unknown> | undefined }[],
): RelatedSequenceView[] {
  return docs.flatMap((doc) => {
    const view = relatedSequenceView(doc.id, doc.data());
    return view ? [view] : [];
  });
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
  async list(
    after: string | null = null,
    limit = 50,
    filter: { openOnly?: boolean } = {},
  ) {
    const collection = this.db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences);
    // An equality filter ordered by document id is served by the automatic single-field index.
    const base = (
      filter.openOnly
        ? collection.where("state", "in", [...OPEN_SEQUENCE_STATES])
        : collection
    ).orderBy(FieldPath.documentId());
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
  /** S275 R-S275-1: the watched page, served by the marker's automatic single-field index. */
  async listWatched(after: string | null, limit: number) {
    return this.pageWhere("replyWatch", true, after, limit);
  }
  /**
   * S275 R-S275-7: completed records for the one-time catch-up, in document order. The worker
   * keeps only renewal records without the marker; this pass ends once and never runs again.
   */
  async listCatchUp(after: string | null, limit: number) {
    return this.pageWhere("state", "completed", after, limit);
  }
  /** S275 R-S275-2: open and watched records a reply check reads, each read capped at `limit`. */
  async listReplyCheckable(limit: number) {
    const collection = this.db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences);
    const bound = Math.min(200, Math.max(1, limit));
    const [open, watched] = await Promise.all([
      collection
        .where("state", "in", [...OPEN_SEQUENCE_STATES])
        .orderBy(FieldPath.documentId())
        .limit(bound)
        .get(),
      collection
        .where("replyWatch", "==", true)
        .orderBy(FieldPath.documentId())
        .limit(bound)
        .get(),
    ]);
    const seen = new Set<string>();
    const sequences: CommunicationSequence[] = [];
    for (const doc of [...open.docs, ...watched.docs]) {
      if (seen.has(doc.id) || doc.get("purged")) continue;
      seen.add(doc.id);
      try {
        sequences.push(assertRecord(doc.data()));
      } catch {
        // A record that needs reconciliation is left to its own controls.
      }
    }
    return sequences;
  }
  private async pageWhere(
    field: string,
    value: unknown,
    after: string | null,
    limit: number,
  ) {
    const bound = Math.min(100, Math.max(1, limit));
    const base = this.db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
      .where(field, "==", value)
      .orderBy(FieldPath.documentId());
    const page = await (after ? base.startAfter(after) : base).limit(bound).get();
    const sequences: CommunicationSequence[] = [];
    for (const doc of page.docs) {
      if (doc.get("purged")) continue;
      try {
        sequences.push(assertRecord(doc.data()));
      } catch {
        // An unreadable record is skipped here; its own controls report it.
      }
    }
    return {
      sequences,
      cursor: page.size === bound ? page.docs.at(-1)!.id : null,
    };
  }
  /** S275 R-S275-1: record why and when the watch ended; the marker drops with it. */
  async endReplyWatch(id: string, ended: ReplyWatchEnded) {
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(this.ref(id));
      const s = snapshot.exists ? assertRecord(snapshot.data()) : missing();
      if (s.replyWatchEnded || !replyWatchApplies(s)) return s;
      const next: CommunicationSequence = { ...s, replyWatchEnded: ended };
      tx.set(this.ref(id), storedSequence(next));
      return next;
    });
  }
  /**
   * S276 R-S276-2 / R-S276-4: pause the unsent reminders the recorded tenant response holds, each
   * in its own transaction that reads the message again. A message with an admitted attempt in
   * flight is marked for reconciliation, as a staff pause after claim is, so that attempt is still
   * reported truthfully when it settles. Nothing is sent, cancelled or read from Gmail.
   */
  async pauseForTenantResponse(input: {
    leaseId: string;
    response: RecordedTenantResponse;
    actorUid: string;
    nowMs: number;
  }): Promise<{ paused: string[] }> {
    const snapshot = await this.relatedQuery(input.leaseId).limit(100).get();
    const candidates = snapshot.docs.flatMap((doc) => {
      if (doc.get("purged")) return [];
      try {
        const s = assertRecord(doc.data());
        return s.state === "active" && tenantResponseHolds(s, input.response)
          ? [s.id]
          : [];
      } catch {
        return [];
      }
    });
    const paused: string[] = [];
    for (const id of candidates) {
      const written = await this.db.runTransaction(async (tx) => {
        const current = await tx.get(this.ref(id));
        if (!current.exists || current.get("purged")) return false;
        const s = assertRecord(current.data());
        if (s.state !== "active" || !tenantResponseHolds(s, input.response)) return false;
        const next: CommunicationSequence = {
          ...s,
          version: s.version + 1,
          state: s.unresolvedOccurrenceId ? "needs_reconciliation" : "paused",
          nextDueAtMs: null,
          pause: tenantResponsePause(input.response, input.actorUid, input.nowMs),
          updatedAtMs: input.nowMs,
        };
        tx.set(this.ref(id), storedSequence(next));
        tx.set(
          this.db
            .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.audit)
            .doc(
              sequenceHash([
                id,
                s.version,
                TENANT_RESPONSE_PAUSE_CAUSE,
                input.response.eventId,
                "audit",
              ]),
            ),
          {
            action: TENANT_RESPONSE_PAUSE_CAUSE,
            sequenceId: id,
            actorUid: input.actorUid,
            version: next.version,
            atMs: input.nowMs,
            state: next.state,
            ...communicationsRetentionFields("bodyless_audit", input.nowMs),
          },
        );
        return true;
      });
      if (written) paused.push(id);
    }
    return { paused };
  }
  async listOccurrences(sequenceId: string, limit = 200) {
    const snapshot = await this.db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences)
      .where("sequenceId", "==", sequenceId)
      .limit(limit + 1)
      .get();
    const occurrences = snapshot.docs
      .map((doc) => doc.data() as CommunicationOccurrence)
      .sort((left, right) => left.claimedAtMs - right.claimedAtMs)
      .slice(0, limit);
    return { occurrences, truncated: snapshot.docs.length > limit };
  }
  async getOccurrence(id: string) {
    const s = await this.db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences)
      .doc(id)
      .get();
    return s.exists ? (s.data() as CommunicationOccurrence) : null;
  }
  /** S272: every stored sequence for the lease, read as the one-current-message rules read them. */
  private relatedQuery(entityId: string) {
    return this.db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
      .where("context.entityId", "==", entityId);
  }
  async relatedRenewalSequences(entityId: string): Promise<RelatedSequenceView[]> {
    const snapshot = await this.relatedQuery(entityId).get();
    return relatedViews(snapshot.docs);
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
      if (
        next.context.entityType === "renewal_lease" &&
        (i.action === "send_authorized" || i.action === "schedule_authorized")
      )
        await assertRenewalDispositionVersion(
          tx,
          this.db,
          next.context.entityId,
          i.dispositionRevision ?? 0,
        );
      if (
        (i.action === "send_authorized" || i.action === "schedule_authorized") &&
        next.authorization?.signatureSetup
      ) {
        await assertSenderSignatureChoice(
          tx,
          this.db,
          {
            uid: next.authorization.approvedByUid,
            email: next.authorization.senderEmail,
          },
          next.authorization.signatureSetup,
        );
      }
      if (Buffer.byteLength(JSON.stringify(next), "utf8") > 750_000)
        throw new EditableLayerError(
          "This communication exceeds its supported size.",
          400,
        );
      // S272 ARCH-S272-2: the one-current-message rules on stored sequence state, in the
      // transaction that writes the authorization. Every initial authorization for a lease and
      // audience reads and writes one guard record, so two confirmations from two tabs serialize
      // and exactly one authorization exists; the later one then reads the first and is refused.
      let currentMessageGuard: FirebaseFirestore.DocumentReference | null = null;
      if (i.currentMessage && isCurrentMessageScope(next.context)) {
        const guard = this.db
          .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.operations)
          .doc(sequenceHash(currentMessageGuardKey(next.context)));
        const [, related] = await Promise.all([
          tx.get(guard),
          tx.get(this.relatedQuery(next.context.entityId)),
        ]);
        const refusal = currentMessageRefusal({
          subject: current ?? next,
          next: {
            ...(next.noticeCycleId !== undefined
              ? { noticeCycleId: next.noticeCycleId }
              : {}),
            confirmedCount: next.confirmedCount,
          },
          related: relatedViews(related.docs),
        });
        if (refusal) throw new CommunicationSequenceRefusedError(refusal);
        currentMessageGuard = guard;
      }
      let tenantOfferClaim: FirebaseFirestore.DocumentReference | null = null;
      if (i.initialTenantAuthorization && next.noticeCycleId) {
        const key = sequenceHash([
          "tenant-initial-offer",
          next.context.entityId,
          next.noticeCycleId,
        ]);
        const claim = this.db
          .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.operations)
          .doc(key);
        const owned = await tx.get(claim);
        if (owned.exists && owned.get("sequenceId") !== next.id)
          throw new EditableLayerError(
            "This cycle has an initial tenant offer. Open its communication to review or recover it.",
            409,
          );
        if (next.authorization?.immediateTenantOffer) {
          const related = await tx.get(
            this.db
              .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
              .where("context.entityId", "==", next.context.entityId),
          );
          if (
            related.docs.some((doc) => {
              if (doc.id === next.id || doc.get("purged")) return false;
              const prior = assertRecord(doc.data());
              return (
                prior.context.purpose === "renewal_tenant" &&
                !prior.context.replyTo &&
                Boolean(prior.authorization) &&
                (prior.noticeCycleId === next.noticeCycleId ||
                  (!prior.noticeCycleId &&
                    OPEN_SEQUENCE_STATES.some((state) => state === prior.state)))
              );
            })
          )
            throw new EditableLayerError(
              "Review the tenant offer already authorized for this lease before adding follow-ups.",
              409,
            );
          if (!owned.exists) tenantOfferClaim = claim;
        }
      }
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
      if (tenantOfferClaim)
        tx.create(tenantOfferClaim, {
          sequenceId: next.id,
          kind: "tenant_initial_offer",
          createdAtMs: i.nowMs,
        });
      if (currentMessageGuard)
        tx.set(currentMessageGuard, {
          kind: "renewal_current_message",
          sequenceId: next.id,
          updatedAtMs: i.nowMs,
          ...communicationsRetentionFields("bodyless_audit", i.nowMs),
        });
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
      // S272 R-S272-4 (ARCH-S272-2): an authorization granted before another communication for
      // the same lease, cycle and audience recorded a confirmed initial send never dispatches. This
      // claim admits nothing and pauses it with its own cause, in the same transaction; only
      // "Cancel future messages" remains for its unsent work.
      if (isCurrentMessageScope(s.context)) {
        const related = await tx.get(this.relatedQuery(s.context.entityId));
        const newer = newerInitialSend(s, relatedViews(related.docs));
        if (newer) {
          const paused: CommunicationSequence = {
            ...s,
            version: s.version + 1,
            state: "paused",
            nextDueAtMs: null,
            pause: {
              cause: "newer_message_sent",
              byUid: "communication-worker",
              atMs: nowMs,
              evidenceIds: [`communication:${newer.sequenceId}`],
            },
            updatedAtMs: nowMs,
          };
          tx.set(this.ref(id), storedSequence(paused));
          tx.set(
            this.db
              .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.audit)
              .doc(sequenceHash([id, s.version, "newer_message_sent", "audit"])),
            {
              action: "newer_message_sent",
              sequenceId: id,
              actorUid: "communication-worker",
              version: paused.version,
              atMs: nowMs,
              state: paused.state,
              ...communicationsRetentionFields("bodyless_audit", nowMs),
            },
          );
          return null;
        }
      }
      // S276 R-S276-3 (ARCH-S276-2): a reminder of an offer authorized before the tenant's response
      // was recorded never dispatches, even when the pause at save time was not written. This claim
      // reads the lease's work record in the same transaction, admits nothing and pauses the
      // message under the response's cause.
      if (tenantReminderScope(s)) {
        const heads = await Promise.all(
          renewalWorkRecordHeadRefs(this.db, s.context.entityId).map((ref) =>
            tx.get(ref),
          ),
        );
        const head = heads.find((snapshot) => snapshot.exists);
        const response = recordedTenantResponseOf(head?.data());
        if (response && tenantResponseHolds(s, response)) {
          const paused: CommunicationSequence = {
            ...s,
            version: s.version + 1,
            state: "paused",
            nextDueAtMs: null,
            pause: tenantResponsePause(response, response.actorUid, nowMs),
            updatedAtMs: nowMs,
          };
          tx.set(this.ref(id), storedSequence(paused));
          tx.set(
            this.db
              .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.audit)
              .doc(sequenceHash([id, s.version, TENANT_RESPONSE_PAUSE_CAUSE, "audit"])),
            {
              action: TENANT_RESPONSE_PAUSE_CAUSE,
              sequenceId: id,
              actorUid: "communication-worker",
              version: paused.version,
              atMs: nowMs,
              state: paused.state,
              ...communicationsRetentionFields("bodyless_audit", nowMs),
            },
          );
          return null;
        }
      }
      if (s.context.entityType === "renewal_lease")
        await assertRenewalDispositionVersion(
          tx,
          this.db,
          s.context.entityId,
          prepared.dispositionRevision ?? 0,
        );
      // S265 (ARCH-S265-4): the atomic recheck of the included tenant resources for this exact
      // occurrence, against the settings read in this transaction. A change after the dispatch
      // check admits nothing; the next check pauses the message for review.
      if (
        s.context.entityType === "renewal_lease" &&
        s.context.purpose === "renewal_tenant"
      ) {
        const settings = await tx.get(
          this.db.collection("renewal_resource_locations").doc("current"),
        );
        const parsed = RenewalResourceSettingsSchema.safeParse(
          settings.exists ? settings.data() : { version: 0, entries: {} },
        );
        const verdict = tenantResourceEffectVerdict({
          basis: authorizedOccurrenceBasis(a.resourceBasis, s.confirmedCount),
          content: (s.confirmedCount === 0 ? a.initial : a.followUp) ?? a.initial,
          uses: parsed.success
            ? tenantResourceUses(parsed.data, businessDateIso(nowMs))
            : null,
          recipients: [...a.to, ...a.cc],
          effect: "send",
        });
        if (!verdict.ok) return null;
        // S264 (R-S264-4): the authorized offer's charge rows were resolved from one mapping
        // version. A mapping revision after the dispatch check admits nothing; the next check
        // pauses the message for review.
        const offer = a.offerSnapshot?.snapshot;
        if (offer && offer.sourceLines > 0) {
          const mappingVersion = await offerChargeMappingVersionIn(tx, this.db);
          if (mappingVersion === null || mappingVersion !== offer.mappingVersion)
            return null;
        }
      }
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
        // S264 R-S264-6: the first message keeps the exact offer it carries, so a tenant answer
        // can name it after a later authorization replaces this one.
        ...(s.confirmedCount === 0 && a.offerSnapshot
          ? { offerSnapshot: a.offerSnapshot }
          : {}),
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
        const recoveredInitial =
          o.index === 0 &&
          a?.immediateTenantOffer === true &&
          s.state === "needs_reconciliation" &&
          s.pause?.cause === "send_unconfirmed" &&
          s.pause.evidenceIds.includes(o.id);
        const active = s.state === "active" || recoveredInitial;
        const beforeEnd =
          !a?.schedule?.endDate ||
          localDateAt(i.nowMs, a.schedule.timeZone) <= a.schedule.endDate;
        const nextDue = recoveredInitial && !beforeEnd ? null : due;
        const state = active
          ? nextDue === null
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
        // S273 R-S273-5: a first message whose send was not confirmed, settled by a readback, keeps
        // its earlier attempt (unconfirmed, then resolved), read only.
        const resolved = unsentAttemptOnSettle(s, current, i.nowMs);
        const next: CommunicationSequence = {
          ...s,
          state,
          confirmedCount: count,
          lastSentAtMs: sentAtMs,
          nextDueAtMs: state === "active" ? nextDue : null,
          ...(recoveredInitial ? { pause: null } : {}),
          ...(resolved
            ? { unsentHistory: appendUnsentHistory(s.unsentHistory, resolved) }
            : {}),
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
        // S233: the attempt's own reason names the pause; it never reads as an unreadable source.
        pause: s.pause ?? {
          cause:
            i.reason === "provider_refusal"
              ? "provider_refused"
              : i.reason === "paused_before_dispatch"
                ? "authorization_unavailable"
                : "send_unconfirmed",
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
          (s.state === "paused" && pause !== "unexpected_sender"));
      const next: CommunicationSequence = {
        ...s,
        version: s.version + (shouldPause ? 1 : 0),
        state: shouldPause && s.state !== "needs_reconciliation" ? "paused" : s.state,
        nextDueAtMs: shouldPause ? null : s.nextDueAtMs,
        pause: shouldPause
          ? {
              cause: pause as "reply" | "bounce" | "unexpected_sender",
              byUid: "communication-observer",
              atMs: i.checkedAtMs,
              evidenceIds: fresh,
            }
          : s.pause,
        observedMessageIds: [
          ...new Set([...s.observedMessageIds, ...i.messageIds]),
        ].slice(-2000),
        ...(s.inbound || i.messages?.length
          ? {
              inbound: [
                ...(s.inbound ?? []),
                ...(i.messages ?? []).filter((m) => fresh.includes(m.id)),
              ].slice(-INBOUND_EVIDENCE_LIMIT),
            }
          : {}),
        observation: {
          checkedAtMs: i.checkedAtMs,
          state: i.complete ? "current" : "unavailable",
          historyId: i.historyId,
          mailboxHistoryIds: i.mailboxHistoryIds ?? {},
          // S233 R-S233-4: an unclean check names why and keeps when the trouble began.
          ...(i.complete
            ? {}
            : {
                reason: i.reason ?? "read_failed",
                unavailableSinceMs:
                  s.observation?.state === "unavailable"
                    ? (s.observation.unavailableSinceMs ?? s.observation.checkedAtMs)
                    : i.checkedAtMs,
              }),
        },
        updatedAtMs: i.checkedAtMs,
      };
      tx.set(this.ref(id), storedSequence(next));
      return next;
    });
  }
}

/**
 * S276 R-S276-2: pause the unsent reminders a recorded tenant response holds, for the work-record
 * save and for "Stop them". Application records only: no send, no cancel, no Gmail call.
 */
export async function pauseTenantRemindersForResponse(
  input: Parameters<FirestoreCommunicationSequenceStore["pauseForTenantResponse"]>[0],
  db: Firestore = getAdminFirestore(),
): Promise<{ paused: string[] }> {
  return new FirestoreCommunicationSequenceStore(db).pauseForTenantResponse(input);
}

/**
 * S275 R-S275-6: the lease label each named renewal communication stores ("101 Sample Pl"), for a
 * notification or a Linked conversations row the caller already admitted by workflow access. One
 * bounded read by id; labels only, never a body, subject or address.
 */
export async function readCommunicationLabels(
  sequenceIds: readonly string[],
  db: Firestore = getAdminFirestore(),
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(sequenceIds.filter((id) => /^[A-Za-z0-9_-]{1,128}$/.test(id))),
  ].slice(0, 100);
  if (!ids.length) return new Map();
  const collection = db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences);
  const snapshots = await db.getAll(...ids.map((id) => collection.doc(id)));
  const labels = new Map<string, string>();
  for (const snapshot of snapshots) {
    if (!snapshot.exists || snapshot.get("purged")) continue;
    const context = snapshot.get("context") as { entityType?: string } | undefined;
    const label = snapshot.get("workflowLabel");
    if (
      context?.entityType === "renewal_lease" &&
      typeof label === "string" &&
      label.trim()
    )
      labels.set(snapshot.id, label.trim().slice(0, 200));
  }
  return labels;
}

/**
 * S234 R-S234-1: the replies people sent on this lease's owner renewal threads, newest first, as
 * the approval form's only reply choices. Evidence ids and times only; no message content.
 */
export async function listLeaseOwnerReplies(
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<import("@/lib/lease-renewal/owner-approval-evidence").OwnerReplyChoice[]> {
  const snapshot = await db
    .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
    .where("context.entityId", "==", leaseId)
    .limit(50)
    .get();
  return snapshot.docs
    .flatMap((doc) => {
      const context = doc.get("context") as
        | { entityType?: string; purpose?: string }
        | undefined;
      if (context?.entityType !== "renewal_lease" || context.purpose !== "renewal_owner")
        return [];
      const inbound =
        (doc.get("inbound") as CommunicationInboundEvidence[] | undefined) ?? [];
      return inbound
        .filter((entry) => entry.kind === "human")
        .map((entry) => ({
          sequenceId: doc.id,
          evidenceId: entry.id,
          senderEmail: entry.senderEmail,
          receivedAt: new Date(entry.receivedAtMs).toISOString(),
          threadId: entry.threadId,
          messageId: entry.messageId,
        }));
    })
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
}
