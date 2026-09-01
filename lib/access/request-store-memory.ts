import { createHash } from "node:crypto";

import type {
  AccessAdminListFilters,
  AccessApplyPreviewRecordV1,
  AccessPreviewAttemptRecordV1,
  AccessRequestAttemptIndexV1,
  AccessRequestActivityRecordV1,
  AccessRequestListPage,
  AccessRequestRecordV1,
  AccessRequestRepository,
  CommitAccessRequestResult,
} from "@/lib/access/request-store";
import { isActiveAccessRequestState } from "@/lib/access/request-store";

/** Deterministic test adapter; production uses the Firestore transaction adapter. */
export class InMemoryAccessRequestRepository implements AccessRequestRepository {
  readonly requests: AccessRequestRecordV1[] = [];
  readonly previews: AccessPreviewAttemptRecordV1[] = [];
  readonly attemptIndexes: AccessRequestAttemptIndexV1[] = [];
  readonly applyPreviews: AccessApplyPreviewRecordV1[] = [];
  readonly activities: AccessRequestActivityRecordV1[] = [];

  async findActiveRequest(requesterUid: string, identity: string) {
    return (
      this.requests.find(
        (record) =>
          record.requester_uid === requesterUid &&
          record.idempotency_identity === identity &&
          isActiveAccessRequestState(record.state),
      ) ?? null
    );
  }

  async savePreviewAttempt(attempt: AccessPreviewAttemptRecordV1) {
    const current = this.previews.find(
      (candidate) =>
        candidate.requester_uid === attempt.requester_uid &&
        candidate.identity === attempt.identity &&
        Date.parse(candidate.expires_at) > Date.parse(attempt.created_at),
    );
    if (current?.preview_hash === attempt.preview_hash) return current;
    for (let index = this.previews.length - 1; index >= 0; index -= 1) {
      const candidate = this.previews[index];
      if (
        candidate.requester_uid === attempt.requester_uid &&
        (candidate.identity === attempt.identity ||
          Date.parse(candidate.expires_at) <= Date.parse(attempt.created_at))
      ) {
        this.previews.splice(index, 1);
      }
    }
    const requesterPreviews = this.previews
      .filter((candidate) => candidate.requester_uid === attempt.requester_uid)
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
    while (requesterPreviews.length >= 20) {
      const evicted = requesterPreviews.shift();
      if (!evicted) break;
      const index = this.previews.findIndex((candidate) => candidate === evicted);
      if (index >= 0) this.previews.splice(index, 1);
    }
    this.previews.push(attempt);
    return attempt;
  }

  async getPreviewAttempt(requesterUid: string, attemptId: string) {
    return (
      this.previews.find(
        (attempt) =>
          attempt.requester_uid === requesterUid && attempt.attempt_id === attemptId,
      ) ?? null
    );
  }

  async getAttemptIndex(attemptId: string) {
    return this.attemptIndexes.find((index) => index.attempt_id === attemptId) ?? null;
  }

  async getRequest(requestId: string) {
    return this.requests.find((request) => request.id === requestId) ?? null;
  }

  async commitAccessRequest(input: {
    attempt: AccessPreviewAttemptRecordV1;
    request: AccessRequestRecordV1;
    committedAt: string;
  }): Promise<CommitAccessRequestResult> {
    const existingIndex = await this.getAttemptIndex(input.attempt.attempt_id);
    if (existingIndex) {
      if (
        existingIndex.requester_uid !== input.attempt.requester_uid ||
        existingIndex.identity !== input.attempt.identity ||
        existingIndex.preview_hash !== input.attempt.preview_hash
      ) {
        return { kind: "idempotency_conflict" };
      }
      const request = await this.getRequest(existingIndex.request_id);
      if (!request) return { kind: "idempotency_conflict" };
      return {
        kind:
          existingIndex.resolution_kind === "created" ? "replayed" : "existing_request",
        request,
      };
    }

    const active = await this.findActiveRequest(
      input.attempt.requester_uid,
      input.attempt.identity,
    );
    const request = active ?? input.request;
    const resolutionKind = active ? "existing_request" : "created";
    if (!active) {
      this.requests.push(input.request);
      this.activities.push({
        schema_version: "access-request-activity-v1",
        id: `activity-${input.request.id}-submitted`,
        request_id: input.request.id,
        request_version: input.request.version,
        actor_uid: input.attempt.requester_uid,
        action: "submitted",
        created_at: input.committedAt,
      });
    }
    this.attemptIndexes.push({
      schema_version: "access-request-attempt-index-v1",
      attempt_id: input.attempt.attempt_id,
      requester_uid: input.attempt.requester_uid,
      identity: input.attempt.identity,
      preview_hash: input.attempt.preview_hash,
      resolution_kind: resolutionKind,
      request_id: request.id,
      request_version: request.version,
      created_at: input.committedAt,
    });
    this.removePreview(input.attempt);
    return { kind: resolutionKind, request };
  }

  async listOwnRequests(
    requesterUid: string,
    options: { cursor?: string; limit: number },
  ) {
    const ordered = this.requests
      .filter((request) => request.requester_uid === requesterUid)
      .sort(compareOwnHistory);
    return pageRecords(ordered, requesterUid, options);
  }

  async listAdminRequests(reviewerUid: string, filters: AccessAdminListFilters) {
    const now = Date.now();
    const ordered = this.requests
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
    return this.requests.filter((request) => request.state === "pending").length;
  }

  async listRequestActivity(requestId: string, limit: number) {
    return this.activities
      .filter((activity) => activity.request_id === requestId)
      .sort(
        (left, right) =>
          left.created_at.localeCompare(right.created_at) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, Math.min(200, Math.max(1, limit)));
  }

  async cancelPendingRequest(input: {
    requesterUid: string;
    requestId: string;
    expectedVersion: number;
    now: string;
    activityId: string;
  }) {
    const index = this.requests.findIndex(
      (request) =>
        request.id === input.requestId && request.requester_uid === input.requesterUid,
    );
    if (index < 0) return null;
    const current = this.requests[index];
    if (current.state !== "pending" || current.version !== input.expectedVersion)
      return null;
    const updated: AccessRequestRecordV1 = {
      ...current,
      state: "cancelled",
      version: current.version + 1,
      updated_at: input.now,
    };
    this.requests[index] = updated;
    this.activities.push({
      schema_version: "access-request-activity-v1",
      id: input.activityId,
      request_id: updated.id,
      request_version: updated.version,
      actor_uid: input.requesterUid,
      action: "cancelled",
      created_at: input.now,
    });
    return updated;
  }

  async saveApplyPreview(preview: AccessApplyPreviewRecordV1) {
    const existing = this.applyPreviews.findIndex(
      (candidate) => candidate.preview.nonce === preview.preview.nonce,
    );
    if (existing >= 0) this.applyPreviews[existing] = preview;
    else this.applyPreviews.push(preview);
  }

  async getApplyPreview(nonce: string) {
    return this.applyPreviews.find((preview) => preview.preview.nonce === nonce) ?? null;
  }

  async denyPendingRequest(input: {
    reviewerUid: string;
    requestId: string;
    expectedVersion: number;
    reason: string;
    now: string;
    activityId: string;
  }) {
    const updated = this.updateRequest(input.requestId, (current) => {
      if (current.state !== "pending" || current.version !== input.expectedVersion)
        return null;
      return {
        ...current,
        state: "denied",
        version: current.version + 1,
        reviewer_uid: input.reviewerUid,
        decision_reason: input.reason,
        updated_at: input.now,
      };
    });
    if (updated) {
      this.activities.push({
        schema_version: "access-request-activity-v1",
        id: input.activityId,
        request_id: updated.id,
        request_version: updated.version,
        actor_uid: input.reviewerUid,
        action: "denied",
        created_at: input.now,
        reason: input.reason,
      });
    }
    return updated;
  }

  async markAlreadySatisfied(input: {
    reviewerUid: string;
    requestId: string;
    expectedVersion: number;
    now: string;
    execution: import("@/lib/access/request-store").AccessRequestExecutionReceiptV1;
    activityId: string;
  }) {
    const updated = this.updateRequest(input.requestId, (current) => {
      if (current.state !== "pending" || current.version !== input.expectedVersion)
        return null;
      return {
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
    });
    if (updated) {
      this.activities.push({
        schema_version: "access-request-activity-v1",
        id: input.activityId,
        request_id: updated.id,
        request_version: updated.version,
        actor_uid: input.reviewerUid,
        action: "applied",
        created_at: input.now,
      });
    }
    return updated;
  }

  async supersedePendingRequest(input: {
    reviewerUid: string;
    requestId: string;
    expectedVersion: number;
    reason: string;
    now: string;
    activityId: string;
  }) {
    const updated = this.updateRequest(input.requestId, (current) => {
      if (current.state !== "pending" || current.version !== input.expectedVersion)
        return null;
      return {
        ...current,
        state: "superseded",
        version: current.version + 1,
        reviewer_uid: input.reviewerUid,
        decision_reason: input.reason,
        updated_at: input.now,
      };
    });
    if (updated) {
      this.activities.push({
        schema_version: "access-request-activity-v1",
        id: input.activityId,
        request_id: updated.id,
        request_version: updated.version,
        actor_uid: input.reviewerUid,
        action: "superseded",
        created_at: input.now,
        reason: input.reason,
      });
    }
    return updated;
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
    const updated = this.updateRequest(input.requestId, (current) => {
      if (
        current.state !== "reconciliation_required" ||
        current.version !== input.expectedVersion ||
        current.execution?.execution_id !== input.executionId
      ) {
        return null;
      }
      return {
        ...current,
        state: "superseded",
        version: current.version + 1,
        decision_reason: input.reason,
        updated_at: input.now,
      };
    });
    if (updated) {
      this.activities.push({
        schema_version: "access-request-activity-v1",
        id: input.activityId,
        request_id: updated.id,
        request_version: updated.version,
        actor_uid: input.reviewerUid,
        action: "superseded",
        created_at: input.now,
        reason: input.reason,
      });
    }
    return updated;
  }

  async claimPendingForApply(input: {
    requestId: string;
    expectedVersion: number;
    execution: import("@/lib/access/request-store").AccessRequestExecutionReceiptV1;
    now: string;
    activityId: string;
  }) {
    const updated = this.updateRequest(input.requestId, (current) => {
      if (current.state !== "pending" || current.version !== input.expectedVersion)
        return null;
      return {
        ...current,
        state: "applying",
        version: current.version + 1,
        reviewer_uid: input.execution.reviewer_uid,
        execution: input.execution,
        updated_at: input.now,
      };
    });
    if (updated) {
      this.activities.push({
        schema_version: "access-request-activity-v1",
        id: input.activityId,
        request_id: updated.id,
        request_version: updated.version,
        actor_uid: input.execution.reviewer_uid,
        action: "apply_started",
        created_at: input.now,
      });
    }
    return updated;
  }

  async releaseApplyAfterAuditFailure(input: {
    requestId: string;
    executionId: string;
    auditRef: string;
    now: string;
    activityId: string;
  }) {
    const updated = this.updateRequest(input.requestId, (current) => {
      if (
        current.state !== "applying" ||
        current.execution?.execution_id !== input.executionId
      ) {
        return null;
      }
      return {
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
    });
    if (updated) {
      this.activities.push({
        schema_version: "access-request-activity-v1",
        id: input.activityId,
        request_id: updated.id,
        request_version: updated.version,
        actor_uid: updated.execution!.reviewer_uid,
        action: "audit_failed",
        created_at: input.now,
      });
    }
    return updated;
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
    const updated = this.updateRequest(input.requestId, (current) => {
      if (
        !["applying", "reconciliation_required"].includes(current.state) ||
        current.execution?.execution_id !== input.executionId
      ) {
        return null;
      }
      return {
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
    });
    if (updated) {
      this.activities.push({
        schema_version: "access-request-activity-v1",
        id: input.activityId,
        request_id: updated.id,
        request_version: updated.version,
        actor_uid: input.actorUid,
        action: input.action,
        created_at: input.now,
      });
    }
    return updated;
  }

  private updateRequest(
    requestId: string,
    updater: (current: AccessRequestRecordV1) => AccessRequestRecordV1 | null,
  ) {
    const index = this.requests.findIndex((request) => request.id === requestId);
    if (index < 0) return null;
    const updated = updater(this.requests[index]);
    if (!updated) return null;
    this.requests[index] = updated;
    return updated;
  }

  private removePreview(attempt: AccessPreviewAttemptRecordV1) {
    const index = this.previews.findIndex(
      (candidate) =>
        candidate.requester_uid === attempt.requester_uid &&
        candidate.attempt_id === attempt.attempt_id,
    );
    if (index >= 0) this.previews.splice(index, 1);
  }
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
  const hasMore = start + items.length < ordered.length;
  return {
    items,
    next_cursor: hasMore && items.length ? cursorFor(ownerKey, items.at(-1)!) : null,
  };
}

function cursorFor(ownerKey: string, record: AccessRequestRecordV1) {
  return createHash("sha256")
    .update(
      `access-request-cursor:v1\u0000${ownerKey}\u0000${record.updated_at}\u0000${record.id}`,
    )
    .digest("base64url");
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
