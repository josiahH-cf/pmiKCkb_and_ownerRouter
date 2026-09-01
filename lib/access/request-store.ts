import type {
  AccessIntentV1,
  AccessRequestPreviewV1,
  AccessRequestReceiptV1,
  AccessRequestState,
  NormalizedAccess,
} from "@/lib/access/contracts";

export interface AccessPreviewAttemptRecordV1 {
  readonly schema_version: "access-request-preview-attempt-v1";
  readonly attempt_id: string;
  readonly requester_uid: string;
  readonly identity: string;
  readonly preview_hash: string;
  readonly preview: AccessRequestPreviewV1;
  readonly created_at: string;
  readonly expires_at: string;
}

export interface AccessRequestAttemptIndexV1 {
  readonly schema_version: "access-request-attempt-index-v1";
  readonly attempt_id: string;
  readonly requester_uid: string;
  readonly identity: string;
  readonly preview_hash: string;
  readonly resolution_kind: "created" | "existing_request";
  readonly request_id: string;
  readonly request_version: number;
  readonly created_at: string;
}

export interface AccessRequestExecutionReceiptV1 {
  readonly execution_id: string;
  readonly reviewer_uid: string;
  readonly apply_preview_hash: string;
  readonly started_at: string;
  readonly completed_at?: string;
  readonly audit_ref?: string;
  readonly target_access: NormalizedAccess;
  readonly unrelated_claim_fingerprint: string;
  readonly readback_fingerprint?: string;
  readonly outcome?:
    | "applied"
    | "reconciliation_required"
    | "already_satisfied"
    | "audit_failed";
}

export interface AccessApplyPreviewV1 {
  readonly schema_version: "access-request-apply-preview-v1";
  readonly request_ref: string;
  readonly request_version: number;
  readonly catalog_version: "catalog-v1";
  readonly reviewer_uid: string;
  readonly requester_uid: string;
  readonly current_claim_fingerprint: string;
  readonly target_access: NormalizedAccess;
  readonly unrelated_claim_fingerprint: string;
  readonly nonce: string;
  readonly expires_at: string;
}

export interface AccessApplyPreviewRecordV1 {
  readonly schema_version: "access-request-apply-preview-record-v1";
  readonly preview: AccessApplyPreviewV1;
  readonly preview_hash: string;
  readonly preserved_unrelated_claims: Readonly<Record<string, unknown>>;
  readonly created_at: string;
}

export interface AccessRequestRecordV1 {
  readonly schema_version: "access-request-record-v1";
  readonly id: string;
  readonly version: number;
  readonly requester_uid: string;
  readonly requester_label: string;
  readonly intent: AccessIntentV1;
  readonly intent_label_snapshot: string;
  readonly baseline_access: NormalizedAccess;
  readonly baseline_fingerprint: string;
  readonly target_access: NormalizedAccess;
  readonly added_capability_keys: readonly string[];
  readonly added_space_ids: readonly string[];
  readonly all_spaces_added: boolean;
  readonly reason: string;
  readonly state: AccessRequestState;
  readonly idempotency_identity: string;
  readonly creation_attempt_id: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly reviewer_uid?: string;
  readonly decision_reason?: string;
  readonly execution?: AccessRequestExecutionReceiptV1;
}

export interface AccessRequestActivityRecordV1 {
  readonly schema_version: "access-request-activity-v1";
  readonly id: string;
  readonly request_id: string;
  readonly request_version: number;
  readonly actor_uid: string;
  readonly action:
    | "submitted"
    | "cancelled"
    | "denied"
    | "apply_started"
    | "audit_failed"
    | "applied"
    | "reconciliation_required"
    | "reconciled"
    | "superseded";
  readonly created_at: string;
  readonly reason?: string;
}

export interface AccessRequestHistoryItem extends AccessRequestReceiptV1 {
  readonly requester_reason: string;
  readonly decision_reason?: string;
}

export interface AccessRequestListPage<T> {
  readonly items: readonly T[];
  readonly next_cursor: string | null;
}

export interface AccessAdminListFilters {
  readonly requester_uid?: string;
  readonly requester_query?: string;
  readonly intent_kind?: AccessIntentV1["intent_kind"];
  readonly catalog_key?: string;
  readonly space_id?: string;
  readonly state?: AccessRequestState;
  readonly minimum_waiting_minutes?: number;
  readonly cursor?: string;
  readonly limit?: number;
}

export type CommitAccessRequestResult =
  | { readonly kind: "created"; readonly request: AccessRequestRecordV1 }
  | { readonly kind: "replayed"; readonly request: AccessRequestRecordV1 }
  | { readonly kind: "existing_request"; readonly request: AccessRequestRecordV1 }
  | { readonly kind: "idempotency_conflict" };

export interface AccessRequestRepository {
  findActiveRequest(
    requesterUid: string,
    identity: string,
  ): Promise<AccessRequestRecordV1 | null>;
  savePreviewAttempt(
    attempt: AccessPreviewAttemptRecordV1,
  ): Promise<AccessPreviewAttemptRecordV1>;
  getPreviewAttempt(
    requesterUid: string,
    attemptId: string,
  ): Promise<AccessPreviewAttemptRecordV1 | null>;
  getAttemptIndex(attemptId: string): Promise<AccessRequestAttemptIndexV1 | null>;
  getRequest(requestId: string): Promise<AccessRequestRecordV1 | null>;
  commitAccessRequest(input: {
    attempt: AccessPreviewAttemptRecordV1;
    request: AccessRequestRecordV1;
    committedAt: string;
  }): Promise<CommitAccessRequestResult>;
  listOwnRequests(
    requesterUid: string,
    options: { cursor?: string; limit: number },
  ): Promise<AccessRequestListPage<AccessRequestRecordV1>>;
  listAdminRequests(
    reviewerUid: string,
    filters: AccessAdminListFilters,
  ): Promise<AccessRequestListPage<AccessRequestRecordV1>>;
  countPendingRequests(): Promise<number>;
  listRequestActivity(
    requestId: string,
    limit: number,
  ): Promise<readonly AccessRequestActivityRecordV1[]>;
  cancelPendingRequest(input: {
    requesterUid: string;
    requestId: string;
    expectedVersion: number;
    now: string;
    activityId: string;
  }): Promise<AccessRequestRecordV1 | null>;
  saveApplyPreview(preview: AccessApplyPreviewRecordV1): Promise<void>;
  getApplyPreview(nonce: string): Promise<AccessApplyPreviewRecordV1 | null>;
  denyPendingRequest(input: {
    reviewerUid: string;
    requestId: string;
    expectedVersion: number;
    reason: string;
    now: string;
    activityId: string;
  }): Promise<AccessRequestRecordV1 | null>;
  supersedePendingRequest(input: {
    reviewerUid: string;
    requestId: string;
    expectedVersion: number;
    reason: string;
    now: string;
    activityId: string;
  }): Promise<AccessRequestRecordV1 | null>;
  supersedeReconciliationRequest(input: {
    reviewerUid: string;
    requestId: string;
    expectedVersion: number;
    executionId: string;
    reason: string;
    now: string;
    activityId: string;
  }): Promise<AccessRequestRecordV1 | null>;
  markAlreadySatisfied(input: {
    reviewerUid: string;
    requestId: string;
    expectedVersion: number;
    now: string;
    execution: AccessRequestExecutionReceiptV1;
    activityId: string;
  }): Promise<AccessRequestRecordV1 | null>;
  claimPendingForApply(input: {
    requestId: string;
    expectedVersion: number;
    execution: AccessRequestExecutionReceiptV1;
    now: string;
    activityId: string;
  }): Promise<AccessRequestRecordV1 | null>;
  releaseApplyAfterAuditFailure(input: {
    requestId: string;
    executionId: string;
    auditRef: string;
    now: string;
    activityId: string;
  }): Promise<AccessRequestRecordV1 | null>;
  completeApply(input: {
    requestId: string;
    executionId: string;
    actorUid: string;
    state: "applied" | "reconciliation_required";
    readbackFingerprint?: string;
    now: string;
    activityId: string;
    action: "applied" | "reconciliation_required" | "reconciled";
  }): Promise<AccessRequestRecordV1 | null>;
}

export const ACTIVE_ACCESS_REQUEST_STATES: readonly AccessRequestState[] = [
  "pending",
  "applying",
  "reconciliation_required",
];

export function isActiveAccessRequestState(state: AccessRequestState) {
  return ACTIVE_ACCESS_REQUEST_STATES.includes(state);
}
