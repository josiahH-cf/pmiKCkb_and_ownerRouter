import { createHash } from "node:crypto";
import { v4 as uuidv4, v7 as uuidv7 } from "uuid";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  AccessRequestCancelCommandSchema,
  AccessRequestRefSchema,
  AccessRequestPreviewCommandSchema,
  AccessRequestSubmitCommandSchema,
  accessIntentLabel,
  buildAccessRequestPreview,
  canonicalizeAccessIntent,
  computeAccessIntentIdentity,
  computeAccessPreviewHash,
  constantTimeHashEqual,
  normalizeAccessReason,
  type AccessIntentV1,
  type AccessRequestPreviewV1,
  type AccessRequestReceiptV1,
} from "@/lib/access/contracts";
import {
  AccessEligibilityError,
  listManagedDirectoryUsersBounded,
  readManagedDirectoryUser,
  type AccessDirectoryAuthLike,
} from "@/lib/access/directory";
import { isAccessSpace } from "@/lib/access/catalog";
import {
  type AccessAdminListFilters,
  type AccessPreviewAttemptRecordV1,
  type AccessRequestHistoryItem,
  type AccessRequestActivityRecordV1,
  type AccessRequestRecordV1,
  type AccessRequestRepository,
  isActiveAccessRequestState,
} from "@/lib/access/request-store";
import { getFirestoreAccessRequestRepository } from "@/lib/access/request-store-firestore";

export interface AccessRequestServiceDependencies {
  readonly repository: AccessRequestRepository;
  readonly directoryAuth?: AccessDirectoryAuthLike;
  readonly now: () => Date;
  readonly createAttemptId: () => string;
  readonly createRequestId: () => string;
}

export type AccessRequestPreviewResponseV1 =
  | {
      readonly schema_version: "access-request-preview-response-v1";
      readonly status: "ready";
      readonly attempt_id: string;
      readonly expires_at: string;
      readonly preview_hash: string;
      readonly preview: AccessPreviewAttemptRecordV1["preview"];
    }
  | {
      readonly schema_version: "access-request-preview-response-v1";
      readonly status: "existing_request";
      readonly request: AccessRequestReceiptV1;
    };

export type AccessRequestSubmitResponseV1 =
  | {
      readonly schema_version: "access-request-submit-response-v1";
      readonly status: "created" | "replayed" | "existing_request";
      readonly message:
        | "Access request submitted."
        | "This access request was already submitted."
        | "An access request already covered this request.";
      readonly request: AccessRequestReceiptV1;
    }
  | {
      readonly schema_version: "access-request-submit-response-v1";
      readonly status: "stale_preview" | "idempotency_conflict" | "unavailable";
      readonly message:
        | "Access changed before submission. Review the latest preview."
        | "This access request could not be safely replayed. Start a new preview."
        | "Access requests are temporarily unavailable."
        | "Request status could not be verified. Check request status.";
      readonly commit_state: "not_committed" | "unknown";
    };

export interface AdminAccessRequestListItem extends AccessRequestRecordV1 {
  readonly requester_directory:
    | { readonly state: "eligible"; readonly current_label: string }
    | { readonly state: "unavailable" };
}

export interface AdminAccessRequestDetail {
  readonly request: AccessRequestRecordV1;
  readonly activity: readonly AccessRequestActivityRecordV1[];
  readonly requester_directory:
    | {
        readonly state: "eligible";
        readonly current_label: string;
        readonly current_access: import("@/lib/access/contracts").NormalizedAccess;
      }
    | { readonly state: "unavailable" };
}

export class AccessRequestError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 | 500 | 503 = 400,
  ) {
    super(message);
    this.name = "AccessRequestError";
  }
}

export async function previewAccessRequest(
  actor: AuthenticatedUser,
  command: unknown,
  dependencies: AccessRequestServiceDependencies = defaultDependencies(),
): Promise<AccessRequestPreviewResponseV1> {
  const parsed = AccessRequestPreviewCommandSchema.parse(command);
  let intent: AccessIntentV1;
  let reason: string;
  try {
    intent = canonicalizeAccessIntent(parsed.intent);
    reason = normalizeAccessReason(parsed.reason);
  } catch {
    throw new AccessRequestError("Invalid access request body.", 400);
  }
  assertIntentUsesCurrentSpaces(intent);
  const directory = await readEligibleActor(actor, dependencies.directoryAuth);
  const identity = computeAccessIntentIdentity(actor.uid, intent);
  const active = await dependencies.repository.findActiveRequest(actor.uid, identity);
  if (active && isActiveAccessRequestState(active.state)) {
    return {
      schema_version: "access-request-preview-response-v1",
      status: "existing_request",
      request: toAccessRequestReceipt(active),
    };
  }

  let preview: AccessRequestPreviewV1;
  try {
    preview = buildAccessRequestPreview({
      requesterUid: actor.uid,
      requesterLabel: directory.label,
      intent,
      reason,
      baseline: directory.access,
    });
  } catch {
    throw new AccessRequestError("The selected request does not add access.", 400);
  }
  const issuedAt = dependencies.now();
  const attempt: AccessPreviewAttemptRecordV1 = {
    schema_version: "access-request-preview-attempt-v1",
    attempt_id: dependencies.createAttemptId(),
    requester_uid: actor.uid,
    identity,
    preview_hash: computeAccessPreviewHash(preview),
    preview,
    created_at: issuedAt.toISOString(),
    expires_at: new Date(issuedAt.getTime() + 15 * 60_000).toISOString(),
  };
  const saved = await dependencies.repository.savePreviewAttempt(attempt);
  return {
    schema_version: "access-request-preview-response-v1",
    status: "ready",
    attempt_id: saved.attempt_id,
    expires_at: saved.expires_at,
    preview_hash: saved.preview_hash,
    preview: saved.preview,
  };
}

export async function submitAccessRequest(
  actor: AuthenticatedUser,
  command: unknown,
  dependencies: AccessRequestServiceDependencies = defaultDependencies(),
): Promise<AccessRequestSubmitResponseV1> {
  const parsed = AccessRequestSubmitCommandSchema.parse(command);
  let indexed;
  try {
    indexed = await dependencies.repository.getAttemptIndex(parsed.attempt_id);
  } catch {
    return unavailableSubmit("unknown");
  }
  if (indexed) {
    if (
      indexed.requester_uid !== actor.uid ||
      !constantTimeHashEqual(indexed.preview_hash, parsed.preview_hash)
    ) {
      return idempotencyConflict();
    }
    let request: AccessRequestRecordV1 | null;
    try {
      request = await dependencies.repository.getRequest(indexed.request_id);
    } catch {
      return unavailableSubmit("unknown");
    }
    if (!request) return unavailableSubmit("unknown");
    if (
      request.requester_uid !== actor.uid ||
      request.idempotency_identity !== indexed.identity ||
      (indexed.resolution_kind === "created" &&
        request.creation_attempt_id !== indexed.attempt_id)
    ) {
      return idempotencyConflict();
    }
    return indexed.resolution_kind === "created"
      ? successResponse("replayed", request)
      : successResponse("existing_request", request);
  }

  let attempt: AccessPreviewAttemptRecordV1 | null;
  try {
    attempt = await dependencies.repository.getPreviewAttempt(
      actor.uid,
      parsed.attempt_id,
    );
  } catch {
    return unavailableSubmit("not_committed");
  }
  if (!attempt || !constantTimeHashEqual(attempt.preview_hash, parsed.preview_hash)) {
    return stalePreview();
  }
  const currentTime = dependencies.now();
  if (Date.parse(attempt.expires_at) <= currentTime.getTime()) return stalePreview();

  let directory;
  try {
    directory = await readEligibleActor(actor, dependencies.directoryAuth);
  } catch (error) {
    if (error instanceof AccessEligibilityError && error.status === 503) {
      return unavailableSubmit("not_committed");
    }
    throw error;
  }
  let rebuiltHash: string;
  try {
    const rebuilt = buildAccessRequestPreview({
      requesterUid: actor.uid,
      requesterLabel: directory.label,
      intent: attempt.preview.intent,
      reason: attempt.preview.reason,
      baseline: directory.access,
    });
    rebuiltHash = computeAccessPreviewHash(rebuilt);
  } catch {
    return stalePreview();
  }
  if (!constantTimeHashEqual(rebuiltHash, attempt.preview_hash)) return stalePreview();

  const request = requestFromAttempt(
    attempt,
    dependencies.createRequestId(),
    currentTime.toISOString(),
  );
  try {
    const result = await dependencies.repository.commitAccessRequest({
      attempt,
      request,
      committedAt: currentTime.toISOString(),
    });
    if (result.kind === "idempotency_conflict") return idempotencyConflict();
    return successResponse(result.kind, result.request);
  } catch {
    return {
      schema_version: "access-request-submit-response-v1",
      status: "unavailable",
      message: "Request status could not be verified. Check request status.",
      commit_state: "unknown",
    };
  }
}

export async function listOwnAccessRequests(
  actor: AuthenticatedUser,
  options: { cursor?: string; limit?: number },
  dependencies: AccessRequestServiceDependencies = defaultDependencies(),
) {
  await readEligibleActor(actor, dependencies.directoryAuth);
  const page = await dependencies.repository.listOwnRequests(actor.uid, {
    cursor: options.cursor,
    limit: Math.min(50, Math.max(1, options.limit ?? 50)),
  });
  return {
    items: page.items.map(toAccessRequestHistoryItem),
    next_cursor: page.next_cursor,
  };
}

export async function cancelAccessRequest(
  actor: AuthenticatedUser,
  requestId: string,
  command: unknown,
  dependencies: AccessRequestServiceDependencies = defaultDependencies(),
) {
  const parsed = AccessRequestCancelCommandSchema.parse(command);
  const parsedRequestId = AccessRequestRefSchema.safeParse(requestId);
  if (!parsedRequestId.success) {
    throw new AccessRequestError("This access request is not available.", 404);
  }
  await readEligibleActor(actor, dependencies.directoryAuth);
  const updated = await dependencies.repository.cancelPendingRequest({
    requesterUid: actor.uid,
    requestId: parsedRequestId.data,
    expectedVersion: parsed.request_version,
    now: dependencies.now().toISOString(),
    activityId: uuidv7(),
  });
  if (!updated) {
    throw new AccessRequestError("This access request is not available.", 404);
  }
  return toAccessRequestReceipt(updated);
}

export async function listAdminAccessRequests(
  actor: AuthenticatedUser,
  filters: AccessAdminListFilters,
  dependencies: AccessRequestServiceDependencies = defaultDependencies(),
) {
  await assertCurrentAdmin(actor, dependencies.directoryAuth);
  const requesterQuery = filters.requester_query
    ? normalizeAdminRequesterFilter(filters.requester_query)
    : undefined;
  const page = await dependencies.repository.listAdminRequests(actor.uid, {
    ...filters,
    requester_query: requesterQuery,
    limit: Math.min(50, Math.max(1, filters.limit ?? 50)),
  });
  let directoryByUid: ReadonlyMap<
    string,
    Awaited<ReturnType<typeof listManagedDirectoryUsersBounded>>[number]
  > = new Map();
  try {
    const directory = await listManagedDirectoryUsersBounded(dependencies.directoryAuth);
    directoryByUid = new Map(directory.map((user) => [user.uid, user]));
  } catch {
    directoryByUid = new Map();
  }
  return {
    items: page.items.map((request): AdminAccessRequestListItem => {
      const current = directoryByUid.get(request.requester_uid);
      return {
        ...request,
        requester_directory: current
          ? { state: "eligible", current_label: current.label }
          : { state: "unavailable" },
      };
    }),
    next_cursor: page.next_cursor,
    pending_count: await dependencies.repository.countPendingRequests(),
  };
}

export async function getAdminAccessRequestDetail(
  actor: AuthenticatedUser,
  requestId: string,
  dependencies: AccessRequestServiceDependencies = defaultDependencies(),
): Promise<AdminAccessRequestDetail> {
  await assertCurrentAdmin(actor, dependencies.directoryAuth);
  const parsedRequestId = AccessRequestRefSchema.safeParse(requestId);
  if (!parsedRequestId.success) {
    throw new AccessRequestError("This access request is not available.", 404);
  }
  const request = await dependencies.repository.getRequest(parsedRequestId.data);
  if (!request)
    throw new AccessRequestError("This access request is not available.", 404);
  const activity = await dependencies.repository.listRequestActivity(request.id, 200);
  try {
    const current = await readManagedDirectoryUser(
      request.requester_uid,
      dependencies.directoryAuth,
    );
    return {
      request,
      activity,
      requester_directory: {
        state: "eligible",
        current_label: current.label,
        current_access: current.access,
      },
    };
  } catch {
    return { request, activity, requester_directory: { state: "unavailable" } };
  }
}

export function toAccessRequestReceipt(
  record: AccessRequestRecordV1,
): AccessRequestReceiptV1 {
  const summaries = {
    pending: "An Admin has not reviewed this request yet.",
    applying: "An Admin approved this request and access is being verified.",
    applied:
      "This access is active. Refresh your sign-in session if it is not available yet.",
    denied: "An Admin denied this request. Open My access for the reason.",
    cancelled: "You cancelled this request.",
    superseded:
      "This request no longer matches current access. Open My access to review it.",
    reconciliation_required:
      "The access result could not be confirmed. Open My access for the current status.",
  } as const;
  return {
    schema_version: "access-request-receipt-v1",
    request_ref: record.id,
    request_version: record.version,
    intent_kind: record.intent.intent_kind,
    intent_label: record.intent_label_snapshot,
    state: record.state,
    outcome_summary: summaries[record.state],
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function defaultDependencies(): AccessRequestServiceDependencies {
  return {
    repository: getFirestoreAccessRequestRepository(),
    now: () => new Date(),
    createAttemptId: uuidv4,
    createRequestId: uuidv7,
  };
}

async function readEligibleActor(
  actor: AuthenticatedUser,
  auth: AccessDirectoryAuthLike | undefined,
) {
  let directory;
  try {
    directory = await readManagedDirectoryUser(actor.uid, auth);
  } catch (error) {
    if (error instanceof AccessEligibilityError && error.status !== 503) {
      throw new AccessRequestError(
        "This account is not eligible for access requests.",
        403,
      );
    }
    throw error;
  }
  if (directory.email.toLowerCase() !== actor.email.toLowerCase()) {
    throw new AccessRequestError(
      "This account is not eligible for access requests.",
      403,
    );
  }
  return directory;
}

function assertIntentUsesCurrentSpaces(intent: AccessIntentV1) {
  if (intent.scope.kind === "named_spaces") {
    if (intent.scope.space_ids.some((space) => !isAccessSpace(space))) {
      throw new AccessRequestError("The selected Space is not available.", 400);
    }
  }
}

function requestFromAttempt(
  attempt: AccessPreviewAttemptRecordV1,
  id: string,
  createdAt: string,
): AccessRequestRecordV1 {
  return {
    schema_version: "access-request-record-v1",
    id,
    version: 1,
    requester_uid: attempt.requester_uid,
    requester_label: attempt.preview.requester_label,
    intent: attempt.preview.intent,
    intent_label_snapshot: accessIntentLabel(attempt.preview.intent),
    baseline_access: attempt.preview.baseline_access,
    baseline_fingerprint: fingerprint(attempt.preview.baseline_access),
    target_access: attempt.preview.target_access,
    added_capability_keys: attempt.preview.added_capability_keys,
    added_space_ids: attempt.preview.added_space_ids,
    all_spaces_added: attempt.preview.all_spaces_added,
    reason: attempt.preview.reason,
    state: "pending",
    idempotency_identity: attempt.identity,
    creation_attempt_id: attempt.attempt_id,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function toAccessRequestHistoryItem(
  record: AccessRequestRecordV1,
): AccessRequestHistoryItem {
  return {
    ...toAccessRequestReceipt(record),
    requester_reason: record.reason,
    decision_reason: record.decision_reason,
  };
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function successResponse(
  status: "created" | "replayed" | "existing_request",
  request: AccessRequestRecordV1,
): AccessRequestSubmitResponseV1 {
  const messages = {
    created: "Access request submitted.",
    replayed: "This access request was already submitted.",
    existing_request: "An access request already covered this request.",
  } as const;
  return {
    schema_version: "access-request-submit-response-v1",
    status,
    message: messages[status],
    request: toAccessRequestReceipt(request),
  };
}

function stalePreview(): AccessRequestSubmitResponseV1 {
  return {
    schema_version: "access-request-submit-response-v1",
    status: "stale_preview",
    message: "Access changed before submission. Review the latest preview.",
    commit_state: "not_committed",
  };
}

function idempotencyConflict(): AccessRequestSubmitResponseV1 {
  return {
    schema_version: "access-request-submit-response-v1",
    status: "idempotency_conflict",
    message: "This access request could not be safely replayed. Start a new preview.",
    commit_state: "unknown",
  };
}

function unavailableSubmit(
  commitState: "not_committed" | "unknown",
): AccessRequestSubmitResponseV1 {
  return {
    schema_version: "access-request-submit-response-v1",
    status: "unavailable",
    message:
      commitState === "not_committed"
        ? "Access requests are temporarily unavailable."
        : "Request status could not be verified. Check request status.",
    commit_state: commitState,
  };
}

async function assertCurrentAdmin(
  actor: AuthenticatedUser,
  auth: AccessDirectoryAuthLike | undefined,
) {
  if (!can(actor.role, "manageAdmin")) {
    throw new AccessRequestError("Admin access is required.", 403);
  }
  const directory = await readManagedDirectoryUser(actor.uid, auth);
  if (
    directory.email.toLowerCase() !== actor.email.toLowerCase() ||
    directory.access.role !== "Admin"
  ) {
    throw new AccessRequestError("Admin access is required.", 403);
  }
}

function normalizeAdminRequesterFilter(value: string) {
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (
    !normalized ||
    Array.from(normalized).length > 160 ||
    /[\u0000-\u001f\u007f-\u009f<>]/u.test(normalized)
  ) {
    throw new AccessRequestError("Invalid access-review filter.", 400);
  }
  return normalized.toLocaleLowerCase();
}
