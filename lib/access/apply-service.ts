import { createHash } from "node:crypto";
import { v4 as uuidv4, v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can, type Capability } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { ACCESS_CATALOG_VERSION } from "@/lib/access/catalog";
import {
  canonicalizeAccessIntent,
  AccessRequestRefSchema,
  constantTimeHashEqual,
  deriveAdditiveAccessPlan,
  normalizeAccessReason,
  type AccessIntentV1,
  type NormalizedAccess,
} from "@/lib/access/contracts";
import {
  AccessEligibilityError,
  defaultAccessDirectoryAuth,
  readManagedDirectoryUser,
  type AccessDirectoryAuthLike,
  type ManagedDirectoryUser,
} from "@/lib/access/directory";
import type {
  AccessApplyPreviewV1,
  AccessRequestExecutionReceiptV1,
  AccessRequestRecordV1,
  AccessRequestRepository,
} from "@/lib/access/request-store";
import { getFirestoreAccessRequestRepository } from "@/lib/access/request-store-firestore";
import { toAccessRequestReceipt } from "@/lib/access/request-service";
import {
  recordAccessRequestAdminAudit,
  type AccessRequestAdminAuditV1,
} from "@/lib/firestore/access-request-admin-audits";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

const NormalizedAccessSchema = z
  .object({
    role: z.enum(["Editor", "Approver", "Admin"]),
    scope: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("all_spaces"), space_ids: z.tuple([]) }).strict(),
      z
        .object({
          kind: z.literal("named_spaces"),
          space_ids: z.array(z.string().min(1).max(128)).min(1).max(50),
        })
        .strict(),
    ]),
  })
  .strict();

const ApplyPreviewSchema = z
  .object({
    schema_version: z.literal("access-request-apply-preview-v1"),
    request_ref: AccessRequestRefSchema,
    request_version: z.number().int().safe().positive(),
    catalog_version: z.literal(ACCESS_CATALOG_VERSION),
    reviewer_uid: z.string().min(1).max(128),
    requester_uid: z.string().min(1).max(128),
    current_claim_fingerprint: z.string().regex(HASH_PATTERN),
    target_access: NormalizedAccessSchema,
    unrelated_claim_fingerprint: z.string().regex(HASH_PATTERN),
    nonce: z.string().regex(UUID_V4_PATTERN),
    expires_at: z.iso.datetime(),
  })
  .strict();

export const AccessApplyCommandSchema = z
  .object({
    schema_version: z.literal("access-request-apply-command-v1"),
    preview: ApplyPreviewSchema,
    preview_hash: z.string().regex(HASH_PATTERN),
  })
  .strict();

export const AccessDenyCommandSchema = z
  .object({
    request_version: z.number().int().safe().positive(),
    reason: z.string(),
  })
  .strict();

export const AccessResolutionCommandSchema = z
  .object({
    schema_version: z.literal("access-request-resolution-command-v1"),
    reason: z.string(),
  })
  .strict();

export interface AccessApplyServiceDependencies {
  readonly repository: AccessRequestRepository;
  readonly directoryAuth?: AccessDirectoryAuthLike;
  readonly now: () => Date;
  readonly createNonce: () => string;
  readonly createExecutionId: () => string;
  readonly createAuditRef: () => string;
  readonly writeAudit: (audit: AccessRequestAdminAuditV1) => Promise<void>;
}

export type AccessDecisionPreviewResponse =
  | {
      readonly status: "ready";
      readonly preview: AccessApplyPreviewV1;
      readonly preview_hash: string;
    }
  | {
      readonly status: "already_applied";
      readonly request: ReturnType<typeof toAccessRequestReceipt>;
    }
  | {
      readonly status: "superseded";
      readonly request: ReturnType<typeof toAccessRequestReceipt>;
    };

export type AccessApplyResponse = {
  readonly status:
    | "applied"
    | "already_applied"
    | "applying"
    | "audit_failed"
    | "reconciliation_required"
    | "superseded"
    | "stale_preview";
  readonly request: ReturnType<typeof toAccessRequestReceipt>;
  readonly message: string;
};

export class AccessApplyError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 | 500 | 503 = 400,
  ) {
    super(message);
    this.name = "AccessApplyError";
  }
}

export async function previewAccessDecision(
  actor: AuthenticatedUser,
  requestId: string,
  dependencies: AccessApplyServiceDependencies = defaultDependencies(),
): Promise<AccessDecisionPreviewResponse> {
  const auth = dependencies.directoryAuth ?? defaultAccessDirectoryAuth();
  await assertCurrentAdmin(actor, auth);
  const request = await requireRequest(dependencies.repository, requestId);
  assertDifferentReviewer(actor, request);
  if (request.state === "applied") {
    return { status: "already_applied", request: toAccessRequestReceipt(request) };
  }
  if (request.state !== "pending") {
    throw new AccessApplyError("This access request is not pending review.", 409);
  }

  let target: ManagedDirectoryUser;
  try {
    target = await readManagedDirectoryUser(request.requester_uid, auth);
  } catch (error) {
    if (error instanceof AccessEligibilityError && error.status !== 503) {
      return supersedeDuringReview(
        actor,
        request,
        "The requester is no longer eligible for managed application access.",
        dependencies,
      );
    }
    throw error;
  }
  let plan;
  try {
    plan = deriveAdditiveAccessPlan(target.access, request.intent);
  } catch {
    let satisfied = false;
    try {
      satisfied = intentSatisfied(target.access, request.intent);
    } catch {
      satisfied = false;
    }
    if (satisfied) {
      const now = dependencies.now().toISOString();
      const auditRef = dependencies.createAuditRef();
      const execution = buildExecution({
        id: dependencies.createExecutionId(),
        reviewerUid: actor.uid,
        previewHash: fingerprint({ request: request.id, already_satisfied: true }),
        now,
        targetAccess: target.access,
        unrelatedFingerprint: fingerprint(extractUnrelatedClaims(target.customClaims)),
        auditRef,
      });
      try {
        await dependencies.writeAudit({
          schema_version: "access-request-admin-audit-v1",
          audit_ref: auditRef,
          request_id: request.id,
          request_version: request.version,
          execution_id: execution.execution_id,
          reviewer_uid: actor.uid,
          requester_uid: request.requester_uid,
          previous_access: target.access,
          target_access: target.access,
          current_claim_fingerprint: fingerprint(target.customClaims),
          unrelated_claim_fingerprint: execution.unrelated_claim_fingerprint,
          created_at: now,
        });
      } catch {
        throw new AccessApplyError(
          "The audit record could not be saved, so the request was not changed.",
          503,
        );
      }
      const applied = await dependencies.repository.markAlreadySatisfied({
        reviewerUid: actor.uid,
        requestId: request.id,
        expectedVersion: request.version,
        now,
        execution,
        activityId: uuidv7(),
      });
      if (!applied) throw new AccessApplyError("The request changed during review.", 409);
      return { status: "already_applied", request: toAccessRequestReceipt(applied) };
    }
    return supersedeDuringReview(
      actor,
      request,
      "The original request no longer has a safe additive plan in the current access catalog.",
      dependencies,
    );
  }

  const now = dependencies.now();
  const unrelatedClaims = extractUnrelatedClaims(target.customClaims);
  const preview: AccessApplyPreviewV1 = {
    schema_version: "access-request-apply-preview-v1",
    request_ref: request.id,
    request_version: request.version,
    catalog_version: ACCESS_CATALOG_VERSION,
    reviewer_uid: actor.uid,
    requester_uid: request.requester_uid,
    current_claim_fingerprint: fingerprint(target.customClaims),
    target_access: plan.target_access,
    unrelated_claim_fingerprint: fingerprint(unrelatedClaims),
    nonce: dependencies.createNonce(),
    expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
  };
  const previewHash = fingerprint(preview);
  await dependencies.repository.saveApplyPreview({
    schema_version: "access-request-apply-preview-record-v1",
    preview,
    preview_hash: previewHash,
    preserved_unrelated_claims: unrelatedClaims,
    created_at: now.toISOString(),
  });
  return { status: "ready", preview, preview_hash: previewHash };
}

export async function applyAccessDecision(
  actor: AuthenticatedUser,
  command: unknown,
  dependencies: AccessApplyServiceDependencies = defaultDependencies(),
): Promise<AccessApplyResponse> {
  const parsed = AccessApplyCommandSchema.parse(command);
  const auth = dependencies.directoryAuth ?? defaultAccessDirectoryAuth();
  await assertCurrentAdmin(actor, auth);
  const stored = await dependencies.repository.getApplyPreview(parsed.preview.nonce);
  if (
    !stored ||
    stored.preview_hash !== parsed.preview_hash ||
    !constantTimeHashEqual(stored.preview_hash, fingerprint(parsed.preview)) ||
    JSON.stringify(stored.preview) !== JSON.stringify(parsed.preview) ||
    stored.preview.reviewer_uid !== actor.uid
  ) {
    throw new AccessApplyError("This apply preview is not available.", 409);
  }

  let request = await requireRequest(dependencies.repository, stored.preview.request_ref);
  assertDifferentReviewer(actor, request);
  const replay = replayApplyOutcome(request, stored.preview_hash);
  if (replay) return replay;
  if (
    request.state !== "pending" ||
    request.version !== stored.preview.request_version ||
    Date.parse(stored.preview.expires_at) <= dependencies.now().getTime()
  ) {
    return staleApplyResponse(request);
  }

  const target = await readManagedDirectoryUser(request.requester_uid, auth);
  if (
    fingerprint(target.customClaims) !== stored.preview.current_claim_fingerprint ||
    fingerprint(extractUnrelatedClaims(target.customClaims)) !==
      stored.preview.unrelated_claim_fingerprint
  ) {
    return staleApplyResponse(request);
  }
  let refreshedTarget: NormalizedAccess;
  try {
    refreshedTarget = deriveAdditiveAccessPlan(
      target.access,
      request.intent,
    ).target_access;
  } catch {
    return staleApplyResponse(request);
  }
  if (JSON.stringify(refreshedTarget) !== JSON.stringify(stored.preview.target_access)) {
    return staleApplyResponse(request);
  }

  const startedAt = dependencies.now().toISOString();
  const auditRef = dependencies.createAuditRef();
  const execution = buildExecution({
    id: dependencies.createExecutionId(),
    reviewerUid: actor.uid,
    previewHash: stored.preview_hash,
    now: startedAt,
    targetAccess: stored.preview.target_access,
    unrelatedFingerprint: stored.preview.unrelated_claim_fingerprint,
    auditRef,
  });
  const claimed = await dependencies.repository.claimPendingForApply({
    requestId: request.id,
    expectedVersion: request.version,
    execution,
    now: startedAt,
    activityId: uuidv7(),
  });
  if (!claimed) {
    request = await requireRequest(dependencies.repository, request.id);
    return (
      replayApplyOutcome(request, stored.preview_hash) ?? staleApplyResponse(request)
    );
  }
  request = claimed;

  try {
    await dependencies.writeAudit({
      schema_version: "access-request-admin-audit-v1",
      audit_ref: auditRef,
      request_id: request.id,
      request_version: request.version,
      execution_id: execution.execution_id,
      reviewer_uid: actor.uid,
      requester_uid: request.requester_uid,
      previous_access: target.access,
      target_access: stored.preview.target_access,
      current_claim_fingerprint: stored.preview.current_claim_fingerprint,
      unrelated_claim_fingerprint: stored.preview.unrelated_claim_fingerprint,
      created_at: dependencies.now().toISOString(),
    });
  } catch {
    const released = await dependencies.repository.releaseApplyAfterAuditFailure({
      requestId: request.id,
      executionId: execution.execution_id,
      auditRef,
      now: dependencies.now().toISOString(),
      activityId: uuidv7(),
    });
    if (!released)
      throw new AccessApplyError("The audit failure could not be recorded.", 503);
    return {
      status: "audit_failed",
      message: "The audit record could not be saved, so access was not changed.",
      request: toAccessRequestReceipt(released),
    };
  }

  const nextClaims = buildMergedClaims(target.customClaims, stored.preview.target_access);
  try {
    await auth.setCustomUserClaims(request.requester_uid, nextClaims);
  } catch {
    return markReconciliationRequired(
      request,
      execution.execution_id,
      actor.uid,
      dependencies,
    );
  }

  let readback: ManagedDirectoryUser;
  try {
    readback = await readManagedDirectoryUser(request.requester_uid, auth);
  } catch {
    return markReconciliationRequired(
      request,
      execution.execution_id,
      actor.uid,
      dependencies,
    );
  }
  const exact =
    JSON.stringify(readback.access) === JSON.stringify(stored.preview.target_access) &&
    fingerprint(extractUnrelatedClaims(readback.customClaims)) ===
      stored.preview.unrelated_claim_fingerprint;
  if (!exact) {
    return markReconciliationRequired(
      request,
      execution.execution_id,
      actor.uid,
      dependencies,
      fingerprint(readback.customClaims),
    );
  }

  const applied = await dependencies.repository.completeApply({
    requestId: request.id,
    executionId: execution.execution_id,
    actorUid: actor.uid,
    state: "applied",
    readbackFingerprint: fingerprint(readback.customClaims),
    now: dependencies.now().toISOString(),
    activityId: uuidv7(),
    action: "applied",
  });
  if (!applied) {
    throw new AccessApplyError(
      "The claim changed but its request receipt could not be completed. Reconcile the request.",
      503,
    );
  }
  return {
    status: "applied",
    message:
      "Access was applied and verified. The requester must refresh their sign-in session.",
    request: toAccessRequestReceipt(applied),
  };
}

export async function denyAccessRequest(
  actor: AuthenticatedUser,
  requestId: string,
  command: unknown,
  dependencies: AccessApplyServiceDependencies = defaultDependencies(),
) {
  const parsed = AccessDenyCommandSchema.parse(command);
  const auth = dependencies.directoryAuth ?? defaultAccessDirectoryAuth();
  await assertCurrentAdmin(actor, auth);
  const request = await requireRequest(dependencies.repository, requestId);
  assertDifferentReviewer(actor, request);
  const reason = normalizeDecisionReason(parsed.reason);
  const denied = await dependencies.repository.denyPendingRequest({
    reviewerUid: actor.uid,
    requestId,
    expectedVersion: parsed.request_version,
    reason,
    now: dependencies.now().toISOString(),
    activityId: uuidv7(),
  });
  if (!denied) throw new AccessApplyError("The request changed during review.", 409);
  return toAccessRequestReceipt(denied);
}

export async function reconcileAccessRequest(
  actor: AuthenticatedUser,
  requestId: string,
  dependencies: AccessApplyServiceDependencies = defaultDependencies(),
): Promise<AccessApplyResponse> {
  const auth = dependencies.directoryAuth ?? defaultAccessDirectoryAuth();
  await assertCurrentAdmin(actor, auth);
  const request = await requireRequest(dependencies.repository, requestId);
  assertDifferentReviewer(actor, request);
  if (request.state === "applied") {
    return {
      status: "already_applied",
      message: "Access is already applied.",
      request: toAccessRequestReceipt(request),
    };
  }
  if (
    !["applying", "reconciliation_required"].includes(request.state) ||
    !request.execution
  ) {
    throw new AccessApplyError("This request does not need reconciliation.", 409);
  }

  let readback: ManagedDirectoryUser | null = null;
  try {
    readback = await readManagedDirectoryUser(request.requester_uid, auth);
  } catch {
    readback = null;
  }
  const exact =
    readback !== null &&
    JSON.stringify(readback.access) === JSON.stringify(request.execution.target_access) &&
    fingerprint(extractUnrelatedClaims(readback.customClaims)) ===
      request.execution.unrelated_claim_fingerprint;
  const completed = await dependencies.repository.completeApply({
    requestId: request.id,
    executionId: request.execution.execution_id,
    actorUid: actor.uid,
    state: exact ? "applied" : "reconciliation_required",
    readbackFingerprint: readback ? fingerprint(readback.customClaims) : undefined,
    now: dependencies.now().toISOString(),
    activityId: uuidv7(),
    action: exact ? "reconciled" : "reconciliation_required",
  });
  if (!completed)
    throw new AccessApplyError("The request changed during reconciliation.", 409);
  return {
    status: exact ? "applied" : "reconciliation_required",
    message: exact
      ? "Access readback now matches the approved target."
      : "Access still could not be confirmed. Use People and Access for a reviewed correction.",
    request: toAccessRequestReceipt(completed),
  };
}

/**
 * Close the durable result after an Admin has used the separately audited People and Access path.
 * This method only reads Firebase claims and changes request bookkeeping; it never writes a claim.
 */
export async function resolveAccessRequestAfterCorrection(
  actor: AuthenticatedUser,
  requestId: string,
  command: unknown,
  dependencies: AccessApplyServiceDependencies = defaultDependencies(),
): Promise<AccessApplyResponse> {
  const parsed = AccessResolutionCommandSchema.parse(command);
  const reason = normalizeDecisionReason(parsed.reason);
  const auth = dependencies.directoryAuth ?? defaultAccessDirectoryAuth();
  await assertCurrentAdmin(actor, auth);
  const request = await requireRequest(dependencies.repository, requestId);
  assertDifferentReviewer(actor, request);
  if (request.state !== "reconciliation_required" || !request.execution) {
    throw new AccessApplyError(
      "This request is not awaiting a reviewed resolution.",
      409,
    );
  }

  const readback = await readManagedDirectoryUser(request.requester_uid, auth);
  if (accessSatisfiesTarget(readback.access, request.execution.target_access)) {
    const applied = await dependencies.repository.completeApply({
      requestId: request.id,
      executionId: request.execution.execution_id,
      actorUid: actor.uid,
      state: "applied",
      readbackFingerprint: fingerprint(readback.customClaims),
      now: dependencies.now().toISOString(),
      activityId: uuidv7(),
      action: "reconciled",
    });
    if (!applied) {
      throw new AccessApplyError("The request changed during reviewed resolution.", 409);
    }
    return {
      status: "applied",
      message:
        "Current directory access satisfies the approved target. The requester must refresh their sign-in session.",
      request: toAccessRequestReceipt(applied),
    };
  }

  const superseded = await dependencies.repository.supersedeReconciliationRequest({
    reviewerUid: actor.uid,
    requestId: request.id,
    expectedVersion: request.version,
    executionId: request.execution.execution_id,
    reason,
    now: dependencies.now().toISOString(),
    activityId: uuidv7(),
  });
  if (!superseded) {
    throw new AccessApplyError("The request changed during reviewed resolution.", 409);
  }
  return {
    status: "superseded",
    message:
      "The approved target is no longer the reviewed outcome. The request was superseded.",
    request: toAccessRequestReceipt(superseded),
  };
}

function defaultDependencies(): AccessApplyServiceDependencies {
  return {
    repository: getFirestoreAccessRequestRepository(),
    now: () => new Date(),
    createNonce: uuidv4,
    createExecutionId: uuidv7,
    createAuditRef: uuidv7,
    writeAudit: recordAccessRequestAdminAudit,
  };
}

async function assertCurrentAdmin(
  actor: AuthenticatedUser,
  auth: AccessDirectoryAuthLike,
) {
  if (!can(actor.role, "manageAdmin")) {
    throw new AccessApplyError("Admin access is required.", 403);
  }
  const directory = await readManagedDirectoryUser(actor.uid, auth);
  if (
    directory.email.toLowerCase() !== actor.email.toLowerCase() ||
    directory.access.role !== "Admin"
  ) {
    throw new AccessApplyError("Admin access is required.", 403);
  }
}

function assertDifferentReviewer(
  actor: AuthenticatedUser,
  request: AccessRequestRecordV1,
) {
  if (actor.uid === request.requester_uid) {
    throw new AccessApplyError("You cannot review your own access request.", 403);
  }
}

async function requireRequest(repository: AccessRequestRepository, requestId: string) {
  const parsedId = AccessRequestRefSchema.safeParse(requestId);
  if (!parsedId.success)
    throw new AccessApplyError("This access request is not available.", 404);
  const request = await repository.getRequest(parsedId.data);
  if (!request) throw new AccessApplyError("This access request is not available.", 404);
  return request;
}

async function supersedeDuringReview(
  actor: AuthenticatedUser,
  request: AccessRequestRecordV1,
  reason: string,
  dependencies: AccessApplyServiceDependencies,
): Promise<AccessDecisionPreviewResponse> {
  const updated = await dependencies.repository.supersedePendingRequest({
    reviewerUid: actor.uid,
    requestId: request.id,
    expectedVersion: request.version,
    reason,
    now: dependencies.now().toISOString(),
    activityId: uuidv7(),
  });
  if (!updated) throw new AccessApplyError("The request changed during review.", 409);
  return { status: "superseded", request: toAccessRequestReceipt(updated) };
}

function buildExecution(input: {
  id: string;
  reviewerUid: string;
  previewHash: string;
  now: string;
  targetAccess: NormalizedAccess;
  unrelatedFingerprint: string;
  auditRef: string;
}): AccessRequestExecutionReceiptV1 {
  return {
    execution_id: input.id,
    reviewer_uid: input.reviewerUid,
    apply_preview_hash: input.previewHash,
    started_at: input.now,
    target_access: input.targetAccess,
    unrelated_claim_fingerprint: input.unrelatedFingerprint,
    audit_ref: input.auditRef,
  };
}

function extractUnrelatedClaims(claims: Readonly<Record<string, unknown>>) {
  const result = structuredClone(claims) as Record<string, unknown>;
  delete result.role;
  delete result.scopes;
  return result;
}

function buildMergedClaims(
  current: Readonly<Record<string, unknown>>,
  target: NormalizedAccess,
) {
  const claims = structuredClone(current) as Record<string, unknown>;
  claims.role = target.role;
  if (target.scope.kind === "all_spaces") delete claims.scopes;
  else claims.scopes = [...target.scope.space_ids];
  return claims;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function intentSatisfied(access: NormalizedAccess, intentInput: AccessIntentV1) {
  const intent = canonicalizeAccessIntent(intentInput);
  if (intent.intent_kind === "role") {
    return (
      roleRank(access.role) >= roleRank(intent.catalog_key as NormalizedAccess["role"])
    );
  }
  if (intent.intent_kind === "capability") {
    const hasCapability = can(access.role, intent.catalog_key as Capability);
    return hasCapability && scopeSatisfied(access, intent);
  }
  return scopeSatisfied(access, intent);
}

function scopeSatisfied(access: NormalizedAccess, intent: AccessIntentV1) {
  if (intent.scope.kind === "global") return true;
  if (intent.scope.kind === "all_spaces") return access.scope.kind === "all_spaces";
  return (
    access.scope.kind === "all_spaces" ||
    intent.scope.space_ids.every((space) =>
      (access.scope.space_ids as readonly string[]).includes(space),
    )
  );
}

function roleRank(role: NormalizedAccess["role"]) {
  return { Editor: 0, Approver: 1, Admin: 2 }[role];
}

function normalizeDecisionReason(value: string) {
  try {
    return normalizeAccessReason(value, 1);
  } catch {
    throw new AccessApplyError("Enter a valid plain-English reason.", 400);
  }
}

function replayApplyOutcome(
  request: AccessRequestRecordV1,
  previewHash: string,
): AccessApplyResponse | null {
  const execution = request.execution;
  if (!execution || execution.apply_preview_hash !== previewHash) return null;
  if (execution.outcome === "audit_failed") {
    return {
      status: "audit_failed",
      message: "The audit record could not be saved, so access was not changed.",
      request: toAccessRequestReceipt(request),
    };
  }
  if (request.state === "applied") {
    return {
      status: "applied",
      message: "Access was already applied and verified.",
      request: toAccessRequestReceipt(request),
    };
  }
  if (request.state === "applying") {
    return {
      status: "applying",
      message: "Access application is already in progress.",
      request: toAccessRequestReceipt(request),
    };
  }
  if (request.state === "reconciliation_required") {
    return {
      status: "reconciliation_required",
      message: "The access result requires read-only reconciliation.",
      request: toAccessRequestReceipt(request),
    };
  }
  return null;
}

function staleApplyResponse(request: AccessRequestRecordV1): AccessApplyResponse {
  return {
    status: "stale_preview",
    message: "Access changed before approval. Review a fresh apply preview.",
    request: toAccessRequestReceipt(request),
  };
}

async function markReconciliationRequired(
  request: AccessRequestRecordV1,
  executionId: string,
  actorUid: string,
  dependencies: AccessApplyServiceDependencies,
  readbackFingerprint?: string,
): Promise<AccessApplyResponse> {
  const updated = await dependencies.repository.completeApply({
    requestId: request.id,
    executionId,
    actorUid,
    state: "reconciliation_required",
    readbackFingerprint,
    now: dependencies.now().toISOString(),
    activityId: uuidv7(),
    action: "reconciliation_required",
  });
  if (!updated) {
    throw new AccessApplyError("The uncertain claim result could not be recorded.", 503);
  }
  return {
    status: "reconciliation_required",
    message: "The access result could not be confirmed. Reconcile before any correction.",
    request: toAccessRequestReceipt(updated),
  };
}

function accessSatisfiesTarget(current: NormalizedAccess, target: NormalizedAccess) {
  if (roleRank(current.role) < roleRank(target.role)) return false;
  if (target.scope.kind === "all_spaces") return current.scope.kind === "all_spaces";
  return (
    current.scope.kind === "all_spaces" ||
    target.scope.space_ids.every((space) =>
      (current.scope.space_ids as readonly string[]).includes(space),
    )
  );
}
