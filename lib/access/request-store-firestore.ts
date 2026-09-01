import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { getAdminFirestore } from "@/lib/firestore/admin";
import type {
  AccessAdminListFilters,
  AccessApplyPreviewRecordV1,
  AccessPreviewAttemptRecordV1,
  AccessRequestActivityRecordV1,
  AccessRequestAttemptIndexV1,
  AccessRequestListPage,
  AccessRequestRecordV1,
  AccessRequestRepository,
  CommitAccessRequestResult,
} from "@/lib/access/request-store";
import { isActiveAccessRequestState } from "@/lib/access/request-store";
import {
  parseAccessActiveIntentPointer,
  parseAccessApplyPreviewRecord,
  parseAccessPreviewIntentPointer,
  parseAccessPreviewAttemptRecord,
  parseAccessRequestActivityRecord,
  parseAccessRequestAttemptIndex,
  parseAccessRequestRecord,
} from "@/lib/access/request-records";

const COLLECTIONS = {
  requests: "access_requests",
  previews: "access_request_previews",
  previewIntents: "access_request_preview_intents",
  attemptIndexes: "access_request_attempt_indexes",
  activeIntents: "access_request_active_intents",
  activity: "access_request_activity",
} as const;

const MAX_DIRECTORY_SCAN = 1001;

let singleton: FirestoreAccessRequestRepository | undefined;

export function getFirestoreAccessRequestRepository() {
  singleton ??= new FirestoreAccessRequestRepository(getAdminFirestore());
  return singleton;
}

export class FirestoreAccessRequestRepository implements AccessRequestRepository {
  constructor(private readonly db: Firestore) {}

  async findActiveRequest(requesterUid: string, identity: string) {
    const pointer = await this.db
      .collection(COLLECTIONS.activeIntents)
      .doc(activeIntentKey(requesterUid, identity))
      .get();
    if (!pointer.exists) return null;
    const pointerRecord = parseAccessActiveIntentPointer(pointer.data());
    if (
      pointerRecord.requester_uid !== requesterUid ||
      pointerRecord.identity !== identity
    ) {
      throw new Error("Access request active-intent pointer is inconsistent.");
    }
    const request = await this.getRequest(pointerRecord.request_id);
    if (
      !request ||
      request.requester_uid !== requesterUid ||
      request.idempotency_identity !== identity
    ) {
      throw new Error("Access request active-intent pointer is inconsistent.");
    }
    return request && isActiveAccessRequestState(request.state) ? request : null;
  }

  async savePreviewAttempt(attempt: AccessPreviewAttemptRecordV1) {
    const pointerRef = this.db
      .collection(COLLECTIONS.previewIntents)
      .doc(activeIntentKey(attempt.requester_uid, attempt.identity));
    const previewRef = this.db
      .collection(COLLECTIONS.previews)
      .doc(previewKey(attempt.requester_uid, attempt.attempt_id));

    return this.db.runTransaction(async (transaction) => {
      const pointer = await transaction.get(pointerRef);
      const pointerRecord = pointer.exists
        ? parseAccessPreviewIntentPointer(pointer.data())
        : undefined;
      if (
        pointerRecord &&
        (pointerRecord.requester_uid !== attempt.requester_uid ||
          pointerRecord.identity !== attempt.identity)
      ) {
        throw new Error("Access request preview pointer is inconsistent.");
      }
      const oldKey = pointerRecord?.preview_key;
      let old:
        | {
            ref: FirebaseFirestore.DocumentReference;
            record: AccessPreviewAttemptRecordV1;
          }
        | undefined;
      if (typeof oldKey === "string") {
        const oldRef = this.db.collection(COLLECTIONS.previews).doc(oldKey);
        const oldSnapshot = await transaction.get(oldRef);
        if (oldSnapshot.exists) {
          const record = parseAccessPreviewAttemptRecord(oldSnapshot.data());
          if (
            record.requester_uid !== attempt.requester_uid ||
            record.identity !== attempt.identity
          ) {
            throw new Error("Access request preview pointer is inconsistent.");
          }
          old = { ref: oldRef, record };
        }
      }

      const requesterSnapshot = await transaction.get(
        this.db
          .collection(COLLECTIONS.previews)
          .where("requester_uid", "==", attempt.requester_uid)
          .limit(41),
      );
      if (requesterSnapshot.size >= 41) {
        throw new Error("Access request preview storage exceeded its bounded read.");
      }
      const candidates = requesterSnapshot.docs.map((document) => ({
        ref: document.ref,
        record: parseAccessPreviewAttemptRecord(document.data()),
      }));
      const now = Date.parse(attempt.created_at);
      const reuse =
        old &&
        old.record.preview_hash === attempt.preview_hash &&
        Date.parse(old.record.expires_at) > now
          ? old
          : undefined;
      const excludedId = reuse ? undefined : old?.ref.id;
      const deletionIds = new Set<string>();
      if (excludedId) deletionIds.add(excludedId);
      candidates
        .filter(
          (candidate) =>
            candidate.record.identity === attempt.identity &&
            candidate.ref.id !== reuse?.ref.id,
        )
        .forEach((candidate) => deletionIds.add(candidate.ref.id));
      const open = candidates
        .filter((candidate) => !deletionIds.has(candidate.ref.id))
        .filter((candidate) => Date.parse(candidate.record.expires_at) > now)
        .sort((left, right) =>
          left.record.created_at.localeCompare(right.record.created_at),
        );
      const expired = candidates
        .filter((candidate) => !deletionIds.has(candidate.ref.id))
        .filter((candidate) => Date.parse(candidate.record.expires_at) <= now)
        .sort((left, right) =>
          left.record.created_at.localeCompare(right.record.created_at),
        );
      const openLimit = reuse ? 20 : 19;
      open.slice(0, Math.max(0, open.length - openLimit)).forEach((candidate) => {
        deletionIds.add(candidate.ref.id);
      });
      if (deletionIds.size > 20) {
        throw new Error(
          "Access request preview storage could not enforce its open-attempt cap.",
        );
      }
      expired.slice(0, 20 - deletionIds.size).forEach((candidate) => {
        deletionIds.add(candidate.ref.id);
      });
      const refsById = new Map(
        candidates.map((candidate) => [candidate.ref.id, candidate.ref]),
      );
      if (old) refsById.set(old.ref.id, old.ref);
      for (const id of deletionIds) {
        const ref = refsById.get(id);
        if (ref) transaction.delete(ref);
      }

      if (reuse) return reuse.record;
      transaction.set(previewRef, attempt);
      transaction.set(pointerRef, {
        requester_uid: attempt.requester_uid,
        identity: attempt.identity,
        preview_key: previewRef.id,
        updated_at: attempt.created_at,
      });
      return attempt;
    });
  }

  async getPreviewAttempt(requesterUid: string, attemptId: string) {
    const snapshot = await this.db
      .collection(COLLECTIONS.previews)
      .doc(previewKey(requesterUid, attemptId))
      .get();
    return snapshot.exists ? parseAccessPreviewAttemptRecord(snapshot.data()) : null;
  }

  async getAttemptIndex(attemptId: string) {
    const snapshot = await this.db
      .collection(COLLECTIONS.attemptIndexes)
      .doc(attemptIndexKey(attemptId))
      .get();
    return snapshot.exists ? parseAccessRequestAttemptIndex(snapshot.data()) : null;
  }

  async getRequest(requestId: string) {
    const snapshot = await this.db.collection(COLLECTIONS.requests).doc(requestId).get();
    return snapshot.exists ? parseAccessRequestRecord(snapshot.data()) : null;
  }

  async commitAccessRequest(input: {
    attempt: AccessPreviewAttemptRecordV1;
    request: AccessRequestRecordV1;
    committedAt: string;
  }): Promise<CommitAccessRequestResult> {
    return this.db.runTransaction(async (transaction) => {
      const indexRef = this.db
        .collection(COLLECTIONS.attemptIndexes)
        .doc(attemptIndexKey(input.attempt.attempt_id));
      const indexSnapshot = await transaction.get(indexRef);
      if (indexSnapshot.exists) {
        const index = parseAccessRequestAttemptIndex(indexSnapshot.data());
        if (
          index.requester_uid !== input.attempt.requester_uid ||
          index.identity !== input.attempt.identity ||
          index.preview_hash !== input.attempt.preview_hash
        ) {
          return { kind: "idempotency_conflict" };
        }
        const requestSnapshot = await transaction.get(
          this.db.collection(COLLECTIONS.requests).doc(index.request_id),
        );
        if (!requestSnapshot.exists) return { kind: "idempotency_conflict" };
        const indexedRequest = parseAccessRequestRecord(requestSnapshot.data());
        if (
          indexedRequest.requester_uid !== index.requester_uid ||
          indexedRequest.idempotency_identity !== index.identity ||
          (index.resolution_kind === "created" &&
            indexedRequest.creation_attempt_id !== index.attempt_id)
        ) {
          return { kind: "idempotency_conflict" };
        }
        return {
          kind: index.resolution_kind === "created" ? "replayed" : "existing_request",
          request: indexedRequest,
        };
      }

      const previewRef = this.db
        .collection(COLLECTIONS.previews)
        .doc(previewKey(input.attempt.requester_uid, input.attempt.attempt_id));
      const previewSnapshot = await transaction.get(previewRef);
      if (!previewSnapshot.exists) return { kind: "idempotency_conflict" };
      const storedAttempt = parseAccessPreviewAttemptRecord(previewSnapshot.data());
      if (
        storedAttempt.attempt_id !== input.attempt.attempt_id ||
        storedAttempt.requester_uid !== input.attempt.requester_uid ||
        storedAttempt.identity !== input.attempt.identity ||
        storedAttempt.preview_hash !== input.attempt.preview_hash ||
        storedAttempt.created_at !== input.attempt.created_at ||
        storedAttempt.expires_at !== input.attempt.expires_at
      ) {
        return { kind: "idempotency_conflict" };
      }

      const activeRef = this.db
        .collection(COLLECTIONS.activeIntents)
        .doc(activeIntentKey(input.attempt.requester_uid, input.attempt.identity));
      const activeSnapshot = await transaction.get(activeRef);
      let resolvedRequest = input.request;
      let resolutionKind: "created" | "existing_request" = "created";
      if (activeSnapshot.exists) {
        const activePointer = parseAccessActiveIntentPointer(activeSnapshot.data());
        if (
          activePointer.requester_uid !== input.attempt.requester_uid ||
          activePointer.identity !== input.attempt.identity
        ) {
          throw new Error("Access request active-intent pointer is inconsistent.");
        }
        const existingSnapshot = await transaction.get(
          this.db.collection(COLLECTIONS.requests).doc(activePointer.request_id),
        );
        if (!existingSnapshot.exists) {
          throw new Error("Access request active-intent pointer is inconsistent.");
        }
        const existing = parseAccessRequestRecord(existingSnapshot.data());
        if (
          existing.requester_uid !== input.attempt.requester_uid ||
          existing.idempotency_identity !== input.attempt.identity
        ) {
          throw new Error("Access request active-intent pointer is inconsistent.");
        }
        if (isActiveAccessRequestState(existing.state)) {
          resolvedRequest = existing;
          resolutionKind = "existing_request";
        }
      }

      const previewPointerRef = this.db
        .collection(COLLECTIONS.previewIntents)
        .doc(activeIntentKey(input.attempt.requester_uid, input.attempt.identity));
      const previewPointerSnapshot = await transaction.get(previewPointerRef);
      let deletePreviewPointer = false;
      if (previewPointerSnapshot.exists) {
        const previewPointer = parseAccessPreviewIntentPointer(
          previewPointerSnapshot.data(),
        );
        if (
          previewPointer.requester_uid !== input.attempt.requester_uid ||
          previewPointer.identity !== input.attempt.identity
        ) {
          throw new Error("Access request preview pointer is inconsistent.");
        }
        deletePreviewPointer = previewPointer.preview_key === previewRef.id;
      }

      if (resolutionKind === "created") {
        transaction.create(
          this.db.collection(COLLECTIONS.requests).doc(input.request.id),
          input.request,
        );
        transaction.set(activeRef, {
          requester_uid: input.attempt.requester_uid,
          identity: input.attempt.identity,
          request_id: input.request.id,
          updated_at: input.committedAt,
        });
        appendActivity(transaction, this.db, {
          schema_version: "access-request-activity-v1",
          id: uuidv7(),
          request_id: input.request.id,
          request_version: input.request.version,
          actor_uid: input.attempt.requester_uid,
          action: "submitted",
          created_at: input.committedAt,
        });
      }

      const index: AccessRequestAttemptIndexV1 = {
        schema_version: "access-request-attempt-index-v1",
        attempt_id: input.attempt.attempt_id,
        requester_uid: input.attempt.requester_uid,
        identity: input.attempt.identity,
        preview_hash: input.attempt.preview_hash,
        resolution_kind: resolutionKind,
        request_id: resolvedRequest.id,
        request_version: resolvedRequest.version,
        created_at: input.committedAt,
      };
      transaction.create(indexRef, index);
      transaction.delete(previewRef);
      if (deletePreviewPointer) transaction.delete(previewPointerRef);
      return { kind: resolutionKind, request: resolvedRequest };
    });
  }

  async listOwnRequests(
    requesterUid: string,
    options: { cursor?: string; limit: number },
  ) {
    const snapshot = await this.db
      .collection(COLLECTIONS.requests)
      .where("requester_uid", "==", requesterUid)
      .limit(MAX_DIRECTORY_SCAN)
      .get();
    assertBoundedSnapshot(snapshot.size);
    const ordered = snapshot.docs
      .map((document) => parseAccessRequestRecord(document.data()))
      .sort(compareOwnHistory);
    return pageRecords(ordered, requesterUid, options);
  }

  async listAdminRequests(reviewerUid: string, filters: AccessAdminListFilters) {
    const snapshot = await this.db
      .collection(COLLECTIONS.requests)
      .limit(MAX_DIRECTORY_SCAN)
      .get();
    assertBoundedSnapshot(snapshot.size);
    const now = Date.now();
    const ordered = snapshot.docs
      .map((document) => parseAccessRequestRecord(document.data()))
      .filter((request) =>
        filters.requester_uid ? request.requester_uid === filters.requester_uid : true,
      )
      .filter((request) =>
        filters.requester_query
          ? request.requester_uid.toLocaleLowerCase().includes(filters.requester_query) ||
            request.requester_label.toLocaleLowerCase().includes(filters.requester_query)
          : true,
      )
      .filter((request) =>
        filters.intent_kind ? request.intent.intent_kind === filters.intent_kind : true,
      )
      .filter((request) =>
        filters.catalog_key ? request.intent.catalog_key === filters.catalog_key : true,
      )
      .filter((request) =>
        filters.space_id
          ? request.intent.scope.kind === "named_spaces" &&
            request.intent.scope.space_ids.includes(filters.space_id)
          : true,
      )
      .filter((request) => (filters.state ? request.state === filters.state : true))
      .filter((request) =>
        filters.minimum_waiting_minutes === undefined
          ? true
          : now - Date.parse(request.created_at) >=
            filters.minimum_waiting_minutes * 60_000,
      )
      .sort(compareAdminQueue);
    return pageRecords(ordered, `admin:${reviewerUid}:${filterIdentity(filters)}`, {
      cursor: filters.cursor,
      limit: filters.limit ?? 50,
    });
  }

  async countPendingRequests() {
    const snapshot = await this.db
      .collection(COLLECTIONS.requests)
      .where("state", "==", "pending")
      .count()
      .get();
    return snapshot.data().count;
  }

  async listRequestActivity(requestId: string, limit: number) {
    const boundedLimit = Math.min(200, Math.max(1, limit));
    const snapshot = await this.db
      .collection(COLLECTIONS.activity)
      .where("request_id", "==", requestId)
      .limit(boundedLimit + 1)
      .get();
    if (snapshot.size > boundedLimit) {
      throw new Error("Access request activity exceeded its bounded read.");
    }
    return snapshot.docs
      .map((document) => parseAccessRequestActivityRecord(document.data()))
      .sort(
        (left, right) =>
          left.created_at.localeCompare(right.created_at) ||
          left.id.localeCompare(right.id),
      );
  }

  async cancelPendingRequest(input: {
    requesterUid: string;
    requestId: string;
    expectedVersion: number;
    now: string;
    activityId: string;
  }) {
    return this.db.runTransaction(async (transaction) => {
      const requestRef = this.db.collection(COLLECTIONS.requests).doc(input.requestId);
      const snapshot = await transaction.get(requestRef);
      if (!snapshot.exists) return null;
      const current = parseAccessRequestRecord(snapshot.data());
      if (
        current.requester_uid !== input.requesterUid ||
        current.state !== "pending" ||
        current.version !== input.expectedVersion
      ) {
        return null;
      }
      const updated: AccessRequestRecordV1 = {
        ...current,
        state: "cancelled",
        version: current.version + 1,
        updated_at: input.now,
      };
      transaction.set(requestRef, updated);
      transaction.delete(
        this.db
          .collection(COLLECTIONS.activeIntents)
          .doc(activeIntentKey(current.requester_uid, current.idempotency_identity)),
      );
      appendActivity(transaction, this.db, {
        schema_version: "access-request-activity-v1",
        id: input.activityId,
        request_id: current.id,
        request_version: updated.version,
        actor_uid: input.requesterUid,
        action: "cancelled",
        created_at: input.now,
      });
      return updated;
    });
  }

  async saveApplyPreview(preview: AccessApplyPreviewRecordV1) {
    await this.db
      .collection("access_request_apply_previews")
      .doc(digest(`apply-preview\u0000${preview.preview.nonce}`))
      .set(preview);
  }

  async getApplyPreview(nonce: string) {
    const snapshot = await this.db
      .collection("access_request_apply_previews")
      .doc(digest(`apply-preview\u0000${nonce}`))
      .get();
    return snapshot.exists ? parseAccessApplyPreviewRecord(snapshot.data()) : null;
  }

  async denyPendingRequest(input: {
    reviewerUid: string;
    requestId: string;
    expectedVersion: number;
    reason: string;
    now: string;
    activityId: string;
  }) {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.db.collection(COLLECTIONS.requests).doc(input.requestId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const current = parseAccessRequestRecord(snapshot.data());
      if (current.state !== "pending" || current.version !== input.expectedVersion)
        return null;
      const updated: AccessRequestRecordV1 = {
        ...current,
        state: "denied",
        version: current.version + 1,
        reviewer_uid: input.reviewerUid,
        decision_reason: input.reason,
        updated_at: input.now,
      };
      transaction.set(ref, updated);
      deleteActivePointer(transaction, this.db, current);
      appendActivity(transaction, this.db, {
        schema_version: "access-request-activity-v1",
        id: input.activityId,
        request_id: current.id,
        request_version: updated.version,
        actor_uid: input.reviewerUid,
        action: "denied",
        created_at: input.now,
        reason: input.reason,
      });
      return updated;
    });
  }

  async markAlreadySatisfied(input: {
    reviewerUid: string;
    requestId: string;
    expectedVersion: number;
    now: string;
    execution: import("@/lib/access/request-store").AccessRequestExecutionReceiptV1;
    activityId: string;
  }) {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.db.collection(COLLECTIONS.requests).doc(input.requestId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const current = parseAccessRequestRecord(snapshot.data());
      if (current.state !== "pending" || current.version !== input.expectedVersion)
        return null;
      const updated: AccessRequestRecordV1 = {
        ...current,
        state: "applied",
        version: current.version + 1,
        reviewer_uid: input.reviewerUid,
        execution: {
          ...input.execution,
          outcome: "already_satisfied",
          completed_at: input.now,
        },
        updated_at: input.now,
      };
      transaction.set(ref, updated);
      deleteActivePointer(transaction, this.db, current);
      appendActivity(transaction, this.db, {
        schema_version: "access-request-activity-v1",
        id: input.activityId,
        request_id: current.id,
        request_version: updated.version,
        actor_uid: input.reviewerUid,
        action: "applied",
        created_at: input.now,
      });
      return updated;
    });
  }

  async supersedePendingRequest(input: {
    reviewerUid: string;
    requestId: string;
    expectedVersion: number;
    reason: string;
    now: string;
    activityId: string;
  }) {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.db.collection(COLLECTIONS.requests).doc(input.requestId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const current = parseAccessRequestRecord(snapshot.data());
      if (current.state !== "pending" || current.version !== input.expectedVersion)
        return null;
      const updated: AccessRequestRecordV1 = {
        ...current,
        state: "superseded",
        version: current.version + 1,
        reviewer_uid: input.reviewerUid,
        decision_reason: input.reason,
        updated_at: input.now,
      };
      transaction.set(ref, updated);
      deleteActivePointer(transaction, this.db, current);
      appendActivity(transaction, this.db, {
        schema_version: "access-request-activity-v1",
        id: input.activityId,
        request_id: current.id,
        request_version: updated.version,
        actor_uid: input.reviewerUid,
        action: "superseded",
        created_at: input.now,
        reason: input.reason,
      });
      return updated;
    });
  }

  async supersedeReconciliationRequest(input: {
    reviewerUid: string;
    requestId: string;
    expectedVersion: number;
    executionId: string;
    reason: string;
    now: string;
    activityId: string;
  }) {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.db.collection(COLLECTIONS.requests).doc(input.requestId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const current = parseAccessRequestRecord(snapshot.data());
      if (
        current.state !== "reconciliation_required" ||
        current.version !== input.expectedVersion ||
        current.execution?.execution_id !== input.executionId
      ) {
        return null;
      }
      const updated: AccessRequestRecordV1 = {
        ...current,
        state: "superseded",
        version: current.version + 1,
        decision_reason: input.reason,
        updated_at: input.now,
      };
      transaction.set(ref, updated);
      deleteActivePointer(transaction, this.db, current);
      appendActivity(transaction, this.db, {
        schema_version: "access-request-activity-v1",
        id: input.activityId,
        request_id: current.id,
        request_version: updated.version,
        actor_uid: input.reviewerUid,
        action: "superseded",
        created_at: input.now,
        reason: input.reason,
      });
      return updated;
    });
  }

  async claimPendingForApply(input: {
    requestId: string;
    expectedVersion: number;
    execution: import("@/lib/access/request-store").AccessRequestExecutionReceiptV1;
    now: string;
    activityId: string;
  }) {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.db.collection(COLLECTIONS.requests).doc(input.requestId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const current = parseAccessRequestRecord(snapshot.data());
      if (current.state !== "pending" || current.version !== input.expectedVersion)
        return null;
      const updated: AccessRequestRecordV1 = {
        ...current,
        state: "applying",
        version: current.version + 1,
        reviewer_uid: input.execution.reviewer_uid,
        execution: input.execution,
        updated_at: input.now,
      };
      transaction.set(ref, updated);
      appendActivity(transaction, this.db, {
        schema_version: "access-request-activity-v1",
        id: input.activityId,
        request_id: current.id,
        request_version: updated.version,
        actor_uid: input.execution.reviewer_uid,
        action: "apply_started",
        created_at: input.now,
      });
      return updated;
    });
  }

  async releaseApplyAfterAuditFailure(input: {
    requestId: string;
    executionId: string;
    auditRef: string;
    now: string;
    activityId: string;
  }) {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.db.collection(COLLECTIONS.requests).doc(input.requestId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const current = parseAccessRequestRecord(snapshot.data());
      if (
        current.state !== "applying" ||
        current.execution?.execution_id !== input.executionId
      ) {
        return null;
      }
      const updated: AccessRequestRecordV1 = {
        ...current,
        state: "pending",
        version: current.version + 1,
        execution: {
          ...current.execution,
          audit_ref: input.auditRef,
          outcome: "audit_failed",
          completed_at: input.now,
        },
        updated_at: input.now,
      };
      transaction.set(ref, updated);
      appendActivity(transaction, this.db, {
        schema_version: "access-request-activity-v1",
        id: input.activityId,
        request_id: current.id,
        request_version: updated.version,
        actor_uid: current.execution.reviewer_uid,
        action: "audit_failed",
        created_at: input.now,
      });
      return updated;
    });
  }

  async completeApply(input: {
    requestId: string;
    executionId: string;
    actorUid: string;
    state: "applied" | "reconciliation_required";
    readbackFingerprint?: string;
    now: string;
    activityId: string;
    action: "applied" | "reconciliation_required" | "reconciled";
  }) {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.db.collection(COLLECTIONS.requests).doc(input.requestId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const current = parseAccessRequestRecord(snapshot.data());
      if (
        !["applying", "reconciliation_required"].includes(current.state) ||
        current.execution?.execution_id !== input.executionId
      ) {
        return null;
      }
      const updated: AccessRequestRecordV1 = {
        ...current,
        state: input.state,
        version: current.version + 1,
        execution: {
          ...current.execution,
          outcome: input.state,
          completed_at: input.now,
          ...(input.readbackFingerprint
            ? { readback_fingerprint: input.readbackFingerprint }
            : {}),
        },
        updated_at: input.now,
      };
      transaction.set(ref, updated);
      if (input.state === "applied") deleteActivePointer(transaction, this.db, current);
      appendActivity(transaction, this.db, {
        schema_version: "access-request-activity-v1",
        id: input.activityId,
        request_id: current.id,
        request_version: updated.version,
        actor_uid: input.actorUid,
        action: input.action,
        created_at: input.now,
      });
      return updated;
    });
  }
}

function appendActivity(
  transaction: Transaction,
  db: Firestore,
  activity: AccessRequestActivityRecordV1,
) {
  transaction.create(db.collection(COLLECTIONS.activity).doc(activity.id), activity);
}

function deleteActivePointer(
  transaction: Transaction,
  db: Firestore,
  request: AccessRequestRecordV1,
) {
  transaction.delete(
    db
      .collection(COLLECTIONS.activeIntents)
      .doc(activeIntentKey(request.requester_uid, request.idempotency_identity)),
  );
}

function activeIntentKey(requesterUid: string, identity: string) {
  return digest(`active\u0000${requesterUid}\u0000${identity}`);
}

function previewKey(requesterUid: string, attemptId: string) {
  return digest(`preview\u0000${requesterUid}\u0000${attemptId}`);
}

function attemptIndexKey(attemptId: string) {
  return digest(`attempt\u0000${attemptId}`);
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

function pageRecords<T extends AccessRequestRecordV1>(
  ordered: readonly T[],
  ownerKey: string,
  options: { cursor?: string; limit: number },
): AccessRequestListPage<T> {
  const limit = Math.min(50, Math.max(1, options.limit));
  let start = 0;
  if (options.cursor) {
    const index = ordered.findIndex(
      (record) => cursorFor(ownerKey, record) === options.cursor,
    );
    if (index < 0) throw new Error("Invalid access request cursor.");
    start = index + 1;
  }
  const items = ordered.slice(start, start + limit);
  return {
    items,
    next_cursor:
      start + items.length < ordered.length && items.length
        ? cursorFor(ownerKey, items.at(-1)!)
        : null,
  };
}

function cursorFor(ownerKey: string, record: AccessRequestRecordV1) {
  return digest(
    `access-request-cursor:v1\u0000${ownerKey}\u0000${record.updated_at}\u0000${record.id}`,
  );
}

function compareOwnHistory(left: AccessRequestRecordV1, right: AccessRequestRecordV1) {
  return (
    right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id)
  );
}

function compareAdminQueue(left: AccessRequestRecordV1, right: AccessRequestRecordV1) {
  return (
    left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
  );
}

function filterIdentity(filters: AccessAdminListFilters) {
  return JSON.stringify({
    requester_uid: filters.requester_uid ?? null,
    requester_query: filters.requester_query ?? null,
    intent_kind: filters.intent_kind ?? null,
    catalog_key: filters.catalog_key ?? null,
    space_id: filters.space_id ?? null,
    state: filters.state ?? null,
    minimum_waiting_minutes: filters.minimum_waiting_minutes ?? null,
  });
}

function assertBoundedSnapshot(size: number) {
  if (size >= MAX_DIRECTORY_SCAN) {
    throw new Error("Access request listing exceeded its safe bounded read.");
  }
}
