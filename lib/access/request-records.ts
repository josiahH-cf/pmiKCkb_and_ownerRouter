import { createHash } from "node:crypto";
import { z } from "zod";

import { ACCESS_CAPABILITIES, isAccessSpace } from "@/lib/access/catalog";
import {
  ACCESS_REQUEST_STATES,
  AccessRequestPreviewSchema,
  canonicalizeAccessIntent,
  computeAccessIntentIdentity,
  computeAccessPreviewHash,
  deriveAdditiveAccessPlan,
  normalizeAccessReason,
  normalizePlainLabel,
  validateNormalizedAccess,
  type AccessIntentV1,
  type NormalizedAccess,
} from "@/lib/access/contracts";
import type {
  AccessApplyPreviewRecordV1,
  AccessPreviewAttemptRecordV1,
  AccessRequestActivityRecordV1,
  AccessRequestAttemptIndexV1,
  AccessRequestRecordV1,
} from "@/lib/access/request-store";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const IDENTITY_PATTERN = /^access-intent-v1:[A-Za-z0-9_-]{43}$/;
const REQUEST_REF_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DIGEST_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const PreviewIntentPointerSchema = z
  .object({
    requester_uid: z.string().min(1).max(128),
    identity: z.string().regex(IDENTITY_PATTERN),
    preview_key: z.string().regex(DIGEST_KEY_PATTERN),
    updated_at: z.iso.datetime(),
  })
  .strict();

const ActiveIntentPointerSchema = z
  .object({
    requester_uid: z.string().min(1).max(128),
    identity: z.string().regex(IDENTITY_PATTERN),
    request_id: z.string().regex(REQUEST_REF_PATTERN),
    updated_at: z.iso.datetime(),
  })
  .strict();

const StoredIntentSchema = z
  .object({
    schema_version: z.literal("access-intent-v1"),
    intent_kind: z.enum(["capability", "role", "spaces"]),
    catalog_version: z.literal("catalog-v1"),
    catalog_key: z.string().min(1).max(128),
    scope: z
      .object({
        kind: z.enum(["global", "named_spaces", "all_spaces"]),
        space_ids: z.array(z.string().regex(SPACE_ID_PATTERN)).max(50),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      const canonical = canonicalizeAccessIntent(value);
      if (JSON.stringify(canonical) !== JSON.stringify(value)) {
        context.addIssue({
          code: "custom",
          message: "Stored access intent is not canonical.",
        });
      }
      if (
        canonical.scope.kind === "named_spaces" &&
        canonical.scope.space_ids.some((space) => !isAccessSpace(space))
      ) {
        context.addIssue({
          code: "custom",
          message: "Stored access intent has an unknown Space.",
        });
      }
    } catch {
      context.addIssue({ code: "custom", message: "Stored access intent is invalid." });
    }
  });

const StoredAccessSchema = z
  .object({
    role: z.enum(["Editor", "Approver", "Admin"]),
    scope: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("all_spaces"), space_ids: z.tuple([]) }).strict(),
      z
        .object({
          kind: z.literal("named_spaces"),
          space_ids: z.array(z.string().regex(SPACE_ID_PATTERN)).min(1).max(50),
        })
        .strict(),
    ]),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      validateNormalizedAccess(value);
      if (
        value.scope.kind === "named_spaces" &&
        value.scope.space_ids.some((space) => !isAccessSpace(space))
      ) {
        context.addIssue({
          code: "custom",
          message: "Stored access has an unknown Space.",
        });
      }
    } catch {
      context.addIssue({ code: "custom", message: "Stored access is invalid." });
    }
  });

const ExecutionSchema = z
  .object({
    execution_id: z.string().regex(REQUEST_REF_PATTERN),
    reviewer_uid: z.string().min(1).max(128),
    apply_preview_hash: z.string().regex(HASH_PATTERN),
    started_at: z.iso.datetime(),
    completed_at: z.iso.datetime().optional(),
    audit_ref: z.string().regex(REQUEST_REF_PATTERN).optional(),
    target_access: StoredAccessSchema,
    unrelated_claim_fingerprint: z.string().regex(HASH_PATTERN),
    readback_fingerprint: z.string().regex(HASH_PATTERN).optional(),
    outcome: z
      .enum(["applied", "reconciliation_required", "already_satisfied", "audit_failed"])
      .optional(),
  })
  .strict();

const PreviewAttemptSchema = z
  .object({
    schema_version: z.literal("access-request-preview-attempt-v1"),
    attempt_id: z.string().regex(UUID_V4_PATTERN),
    requester_uid: z.string().min(1).max(128),
    identity: z.string().regex(IDENTITY_PATTERN),
    preview_hash: z.string().regex(HASH_PATTERN),
    preview: AccessRequestPreviewSchema,
    created_at: z.iso.datetime(),
    expires_at: z.iso.datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    let previewIsValid = true;
    try {
      const plan = deriveAdditiveAccessPlan(
        value.preview.baseline_access as NormalizedAccess,
        value.preview.intent as AccessIntentV1,
      );
      const expected = {
        target_access: plan.target_access,
        added_capability_keys: plan.added_capability_keys,
        added_space_ids: plan.added_space_ids,
        all_spaces_added: plan.all_spaces_added,
      };
      const actual = {
        target_access: value.preview.target_access,
        added_capability_keys: value.preview.added_capability_keys,
        added_space_ids: value.preview.added_space_ids,
        all_spaces_added: value.preview.all_spaces_added,
      };
      previewIsValid =
        value.preview.requester_label ===
          normalizePlainLabel(value.preview.requester_label, 160) &&
        value.preview.reason === normalizeAccessReason(value.preview.reason) &&
        JSON.stringify(expected) === JSON.stringify(actual);
    } catch {
      previewIsValid = false;
    }
    if (
      !previewIsValid ||
      value.requester_uid !== value.preview.requester_uid ||
      value.identity !==
        computeAccessIntentIdentity(value.requester_uid, value.preview.intent) ||
      value.preview_hash !== computeAccessPreviewHash(value.preview) ||
      Date.parse(value.expires_at) <= Date.parse(value.created_at)
    ) {
      context.addIssue({
        code: "custom",
        message: "Stored preview attempt is inconsistent.",
      });
    }
  });

const AttemptIndexSchema = z
  .object({
    schema_version: z.literal("access-request-attempt-index-v1"),
    attempt_id: z.string().regex(UUID_V4_PATTERN),
    requester_uid: z.string().min(1).max(128),
    identity: z.string().regex(IDENTITY_PATTERN),
    preview_hash: z.string().regex(HASH_PATTERN),
    resolution_kind: z.enum(["created", "existing_request"]),
    request_id: z.string().regex(REQUEST_REF_PATTERN),
    request_version: z.number().int().safe().positive(),
    created_at: z.iso.datetime(),
  })
  .strict();

const RequestSchema = z
  .object({
    schema_version: z.literal("access-request-record-v1"),
    id: z.string().regex(REQUEST_REF_PATTERN),
    version: z.number().int().safe().positive(),
    requester_uid: z.string().min(1).max(128),
    requester_label: z.string().min(1).max(160),
    intent: StoredIntentSchema,
    intent_label_snapshot: z.string().min(1).max(160),
    baseline_access: StoredAccessSchema,
    baseline_fingerprint: z.string().regex(HASH_PATTERN),
    target_access: StoredAccessSchema,
    added_capability_keys: z.array(z.enum(ACCESS_CAPABILITIES)).max(7),
    added_space_ids: z.array(z.string().regex(SPACE_ID_PATTERN)).max(50),
    all_spaces_added: z.boolean(),
    reason: z.string().min(1).max(500),
    state: z.enum(ACCESS_REQUEST_STATES),
    idempotency_identity: z.string().regex(IDENTITY_PATTERN),
    creation_attempt_id: z.string().regex(UUID_V4_PATTERN),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
    reviewer_uid: z.string().min(1).max(128).optional(),
    decision_reason: z.string().min(1).max(500).optional(),
    execution: ExecutionSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      const intent = value.intent as AccessIntentV1;
      const baseline = value.baseline_access as NormalizedAccess;
      const plan = deriveAdditiveAccessPlan(baseline, intent);
      const expected = {
        target_access: plan.target_access,
        added_capability_keys: plan.added_capability_keys,
        added_space_ids: plan.added_space_ids,
        all_spaces_added: plan.all_spaces_added,
      };
      const actual = {
        target_access: value.target_access,
        added_capability_keys: value.added_capability_keys,
        added_space_ids: value.added_space_ids,
        all_spaces_added: value.all_spaces_added,
      };
      if (
        value.requester_label !== normalizePlainLabel(value.requester_label, 160) ||
        value.reason !== normalizeAccessReason(value.reason) ||
        value.baseline_fingerprint !== hashJson(value.baseline_access) ||
        value.idempotency_identity !==
          computeAccessIntentIdentity(value.requester_uid, intent) ||
        JSON.stringify(actual) !== JSON.stringify(expected)
      ) {
        context.addIssue({
          code: "custom",
          message: "Stored access request is inconsistent.",
        });
      }
      if (
        value.decision_reason !== undefined &&
        value.decision_reason !== normalizeAccessReason(value.decision_reason, 1)
      ) {
        context.addIssue({
          code: "custom",
          message: "Stored decision reason is invalid.",
        });
      }
    } catch {
      context.addIssue({ code: "custom", message: "Stored access request is invalid." });
    }
  });

const ActivitySchema = z
  .object({
    schema_version: z.literal("access-request-activity-v1"),
    id: z.string().regex(REQUEST_REF_PATTERN),
    request_id: z.string().regex(REQUEST_REF_PATTERN),
    request_version: z.number().int().safe().positive(),
    actor_uid: z.string().min(1).max(128),
    action: z.enum([
      "submitted",
      "cancelled",
      "denied",
      "apply_started",
      "audit_failed",
      "applied",
      "reconciliation_required",
      "reconciled",
      "superseded",
    ]),
    created_at: z.iso.datetime(),
    reason: z.string().min(1).max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.reason !== undefined) {
      try {
        if (value.reason !== normalizeAccessReason(value.reason, 1)) {
          context.addIssue({
            code: "custom",
            message: "Stored activity reason is invalid.",
          });
        }
      } catch {
        context.addIssue({
          code: "custom",
          message: "Stored activity reason is invalid.",
        });
      }
    }
  });

const ApplyPreviewSchema = z
  .object({
    schema_version: z.literal("access-request-apply-preview-v1"),
    request_ref: z.string().regex(REQUEST_REF_PATTERN),
    request_version: z.number().int().safe().positive(),
    catalog_version: z.literal("catalog-v1"),
    reviewer_uid: z.string().min(1).max(128),
    requester_uid: z.string().min(1).max(128),
    current_claim_fingerprint: z.string().regex(HASH_PATTERN),
    target_access: StoredAccessSchema,
    unrelated_claim_fingerprint: z.string().regex(HASH_PATTERN),
    nonce: z.string().regex(UUID_V4_PATTERN),
    expires_at: z.iso.datetime(),
  })
  .strict();

const ApplyPreviewRecordSchema = z
  .object({
    schema_version: z.literal("access-request-apply-preview-record-v1"),
    preview: ApplyPreviewSchema,
    preview_hash: z.string().regex(HASH_PATTERN),
    preserved_unrelated_claims: z.record(z.string(), z.unknown()),
    created_at: z.iso.datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.preview_hash !== hashStable(value.preview) ||
      Object.prototype.hasOwnProperty.call(value.preserved_unrelated_claims, "role") ||
      Object.prototype.hasOwnProperty.call(value.preserved_unrelated_claims, "scopes")
    ) {
      context.addIssue({
        code: "custom",
        message: "Stored apply preview is inconsistent.",
      });
    }
  });

export function parseAccessPreviewAttemptRecord(
  value: unknown,
): AccessPreviewAttemptRecordV1 {
  return PreviewAttemptSchema.parse(value) as AccessPreviewAttemptRecordV1;
}

export function parseAccessRequestAttemptIndex(
  value: unknown,
): AccessRequestAttemptIndexV1 {
  return AttemptIndexSchema.parse(value) as AccessRequestAttemptIndexV1;
}

export function parseAccessRequestRecord(value: unknown): AccessRequestRecordV1 {
  return RequestSchema.parse(value) as AccessRequestRecordV1;
}

export function parseAccessRequestActivityRecord(
  value: unknown,
): AccessRequestActivityRecordV1 {
  return ActivitySchema.parse(value) as AccessRequestActivityRecordV1;
}

export function parseAccessApplyPreviewRecord(
  value: unknown,
): AccessApplyPreviewRecordV1 {
  return ApplyPreviewRecordSchema.parse(value) as AccessApplyPreviewRecordV1;
}

export function parseAccessPreviewIntentPointer(value: unknown) {
  return PreviewIntentPointerSchema.parse(value);
}

export function parseAccessActiveIntentPointer(value: unknown) {
  return ActiveIntentPointerSchema.parse(value);
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function hashStable(value: unknown) {
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
