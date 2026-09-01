import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { can, type Capability, type Role } from "@/lib/auth/roles";
import {
  ACCESS_CAPABILITIES,
  ACCESS_CATALOG_VERSION,
  capabilityCatalogEntry,
  isAccessCapability,
  isAccessRole,
  isAccessSpace,
  minimumRoleForCapability,
} from "@/lib/access/catalog";
import { ROLES } from "@/lib/constants";

export const ACCESS_INTENT_SCHEMA_VERSION = "access-intent-v1" as const;
export const ACCESS_PREVIEW_SCHEMA_VERSION = "access-request-preview-v1" as const;
export const ACCESS_RECEIPT_SCHEMA_VERSION = "access-request-receipt-v1" as const;
export const ACCESS_PREVIEW_COMMAND_SCHEMA_VERSION =
  "access-request-preview-command-v1" as const;
export const ACCESS_SUBMIT_COMMAND_SCHEMA_VERSION =
  "access-request-submit-command-v1" as const;
export const ACCESS_SUBMIT_RESPONSE_SCHEMA_VERSION =
  "access-request-submit-response-v1" as const;
export const ACCESS_INDEPENDENT_CONDITIONS_STATEMENT =
  "Access approval does not change action availability, provider readiness, or required human confirmation." as const;

const SPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
export const ACCESS_REQUEST_REF_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
export const AccessRequestRefSchema = z.string().regex(ACCESS_REQUEST_REF_PATTERN);

export type AccessScopeKind = "global" | "named_spaces" | "all_spaces";

export interface AccessIntentV1 {
  readonly schema_version: typeof ACCESS_INTENT_SCHEMA_VERSION;
  readonly intent_kind: "capability" | "role" | "spaces";
  readonly catalog_version: typeof ACCESS_CATALOG_VERSION;
  readonly catalog_key: string;
  readonly scope: {
    readonly kind: AccessScopeKind;
    readonly space_ids: readonly string[];
  };
}

export interface NormalizedAccess {
  readonly role: Role;
  readonly scope:
    | { readonly kind: "all_spaces"; readonly space_ids: readonly [] }
    | { readonly kind: "named_spaces"; readonly space_ids: readonly string[] };
}

export interface AdditiveAccessPlan {
  readonly baseline_access: NormalizedAccess;
  readonly target_access: NormalizedAccess;
  readonly added_capability_keys: readonly Capability[];
  readonly added_space_ids: readonly string[];
  readonly all_spaces_added: boolean;
}

export interface AccessRequestPreviewV1 extends AdditiveAccessPlan {
  readonly schema_version: typeof ACCESS_PREVIEW_SCHEMA_VERSION;
  readonly requester_uid: string;
  readonly requester_label: string;
  readonly intent: AccessIntentV1;
  readonly reason: string;
  readonly independent_conditions_statement: typeof ACCESS_INDEPENDENT_CONDITIONS_STATEMENT;
}

export const ACCESS_REQUEST_STATES = [
  "pending",
  "applying",
  "applied",
  "denied",
  "cancelled",
  "superseded",
  "reconciliation_required",
] as const;
export type AccessRequestState = (typeof ACCESS_REQUEST_STATES)[number];

export const ACCESS_OUTCOME_SUMMARIES: Readonly<Record<AccessRequestState, string>> = {
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
};

export interface AccessRequestReceiptV1 {
  readonly schema_version: typeof ACCESS_RECEIPT_SCHEMA_VERSION;
  readonly request_ref: string;
  readonly request_version: number;
  readonly intent_kind: AccessIntentV1["intent_kind"];
  readonly intent_label: string;
  readonly state: AccessRequestState;
  readonly outcome_summary: string;
  readonly created_at: string;
  readonly updated_at: string;
}

const RawIntentSchema = z
  .object({
    schema_version: z.literal(ACCESS_INTENT_SCHEMA_VERSION),
    intent_kind: z.enum(["capability", "role", "spaces"]),
    catalog_version: z.literal(ACCESS_CATALOG_VERSION),
    catalog_key: z.string().min(1).max(128),
    scope: z
      .object({
        kind: z.enum(["global", "named_spaces", "all_spaces"]),
        space_ids: z.array(z.string().regex(SPACE_ID_PATTERN)).max(50),
      })
      .strict(),
  })
  .strict();

export const AccessRequestPreviewCommandSchema = z
  .object({
    schema_version: z.literal(ACCESS_PREVIEW_COMMAND_SCHEMA_VERSION),
    intent: RawIntentSchema,
    reason: z.string(),
  })
  .strict();

export const AccessRequestSubmitCommandSchema = z
  .object({
    schema_version: z.literal(ACCESS_SUBMIT_COMMAND_SCHEMA_VERSION),
    attempt_id: z.string().regex(UUID_V4_PATTERN),
    preview_hash: z.string().regex(HASH_PATTERN),
  })
  .strict();

export const AccessRequestCancelCommandSchema = z
  .object({
    schema_version: z.literal("access-request-cancel-command-v1"),
    request_version: z.number().int().safe().positive(),
  })
  .strict();

export const AccessRequestReceiptSchema = z
  .object({
    schema_version: z.literal(ACCESS_RECEIPT_SCHEMA_VERSION),
    request_ref: AccessRequestRefSchema,
    request_version: z.number().int().safe().positive(),
    intent_kind: z.enum(["capability", "role", "spaces"]),
    intent_label: z.string().min(1).max(160),
    state: z.enum(ACCESS_REQUEST_STATES),
    outcome_summary: z.string().min(1).max(240),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    let labelIsCanonical = false;
    try {
      labelIsCanonical =
        value.intent_label === normalizePlainLabel(value.intent_label, 160);
    } catch {
      labelIsCanonical = false;
    }
    if (
      !labelIsCanonical ||
      value.outcome_summary !== ACCESS_OUTCOME_SUMMARIES[value.state] ||
      Date.parse(value.updated_at) < Date.parse(value.created_at)
    ) {
      context.addIssue({ code: "custom", message: "Invalid access request receipt." });
    }
  });

const NormalizedAccessContractSchema = z
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
  .strict();

export const AccessRequestPreviewSchema = z
  .object({
    schema_version: z.literal(ACCESS_PREVIEW_SCHEMA_VERSION),
    requester_uid: z.string().min(1).max(128),
    requester_label: z.string().min(1).max(160),
    intent: RawIntentSchema,
    reason: z.string().min(10).max(500),
    baseline_access: NormalizedAccessContractSchema,
    target_access: NormalizedAccessContractSchema,
    added_capability_keys: z.array(z.enum(ACCESS_CAPABILITIES)).max(7),
    added_space_ids: z.array(z.string().regex(SPACE_ID_PATTERN)).max(50),
    all_spaces_added: z.boolean(),
    independent_conditions_statement: z.literal(ACCESS_INDEPENDENT_CONDITIONS_STATEMENT),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      const intent = canonicalizeAccessIntent(value.intent);
      const baseline = value.baseline_access as NormalizedAccess;
      validateNormalizedAccess(baseline);
      if (
        baseline.scope.kind === "named_spaces" &&
        baseline.scope.space_ids.some((space) => !isAccessSpace(space))
      ) {
        throw new Error("Unknown baseline Space.");
      }
      const plan = deriveAdditiveAccessPlan(baseline, intent);
      const expected = {
        intent,
        target_access: plan.target_access,
        added_capability_keys: plan.added_capability_keys,
        added_space_ids: plan.added_space_ids,
        all_spaces_added: plan.all_spaces_added,
      };
      const actual = {
        intent: value.intent,
        target_access: value.target_access,
        added_capability_keys: value.added_capability_keys,
        added_space_ids: value.added_space_ids,
        all_spaces_added: value.all_spaces_added,
      };
      if (
        value.requester_label !== normalizePlainLabel(value.requester_label, 160) ||
        value.reason !== normalizeAccessReason(value.reason) ||
        JSON.stringify(actual) !== JSON.stringify(expected)
      ) {
        throw new Error("Preview values are inconsistent.");
      }
    } catch {
      context.addIssue({ code: "custom", message: "Invalid access request preview." });
    }
  });

export const AccessRequestPreviewResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      schema_version: z.literal("access-request-preview-response-v1"),
      status: z.literal("ready"),
      attempt_id: z.string().regex(UUID_V4_PATTERN),
      expires_at: z.iso.datetime(),
      preview_hash: z.string().regex(HASH_PATTERN),
      preview: AccessRequestPreviewSchema,
    })
    .strict(),
  z
    .object({
      schema_version: z.literal("access-request-preview-response-v1"),
      status: z.literal("existing_request"),
      request: AccessRequestReceiptSchema,
    })
    .strict(),
]);

export const AccessRequestSubmitResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      schema_version: z.literal(ACCESS_SUBMIT_RESPONSE_SCHEMA_VERSION),
      status: z.literal("created"),
      message: z.literal("Access request submitted."),
      request: AccessRequestReceiptSchema,
    })
    .strict(),
  z
    .object({
      schema_version: z.literal(ACCESS_SUBMIT_RESPONSE_SCHEMA_VERSION),
      status: z.literal("replayed"),
      message: z.literal("This access request was already submitted."),
      request: AccessRequestReceiptSchema,
    })
    .strict(),
  z
    .object({
      schema_version: z.literal(ACCESS_SUBMIT_RESPONSE_SCHEMA_VERSION),
      status: z.literal("existing_request"),
      message: z.literal("An access request already covered this request."),
      request: AccessRequestReceiptSchema,
    })
    .strict(),
  z
    .object({
      schema_version: z.literal(ACCESS_SUBMIT_RESPONSE_SCHEMA_VERSION),
      status: z.literal("stale_preview"),
      message: z.literal("Access changed before submission. Review the latest preview."),
      commit_state: z.literal("not_committed"),
    })
    .strict(),
  z
    .object({
      schema_version: z.literal(ACCESS_SUBMIT_RESPONSE_SCHEMA_VERSION),
      status: z.literal("idempotency_conflict"),
      message: z.literal(
        "This access request could not be safely replayed. Start a new preview.",
      ),
      commit_state: z.literal("unknown"),
    })
    .strict(),
  z
    .object({
      schema_version: z.literal(ACCESS_SUBMIT_RESPONSE_SCHEMA_VERSION),
      status: z.literal("unavailable"),
      message: z.union([
        z.literal("Access requests are temporarily unavailable."),
        z.literal("Request status could not be verified. Check request status."),
      ]),
      commit_state: z.enum(["not_committed", "unknown"]),
    })
    .strict()
    .superRefine((value, context) => {
      const valid =
        (value.commit_state === "not_committed" &&
          value.message === "Access requests are temporarily unavailable.") ||
        (value.commit_state === "unknown" &&
          value.message ===
            "Request status could not be verified. Check request status.");
      if (!valid)
        context.addIssue({ code: "custom", message: "Invalid unavailable pair." });
    }),
]);

export function canonicalizeAccessIntent(input: unknown): AccessIntentV1 {
  const raw = RawIntentSchema.parse(input);
  const spaceIds = [...new Set(raw.scope.space_ids)].sort(compareCodePoint);
  const scope = { kind: raw.scope.kind, space_ids: spaceIds } as const;

  if ((scope.kind === "global" || scope.kind === "all_spaces") && spaceIds.length) {
    throw new Error(
      scope.kind === "all_spaces"
        ? "All-spaces scope cannot contain Space ids."
        : "Global scope cannot contain Space ids.",
    );
  }
  if (scope.kind === "named_spaces" && spaceIds.length === 0) {
    throw new Error("Named-Space scope requires at least one Space id.");
  }

  if (raw.intent_kind === "capability") {
    if (!isAccessCapability(raw.catalog_key)) {
      throw new Error("Unknown access capability.");
    }
    if (scope.kind === "all_spaces") {
      throw new Error("Capability requests cannot select All spaces.");
    }
    if (
      scope.kind === "named_spaces" &&
      !capabilityCatalogEntry(raw.catalog_key).namedSpaceRequestable
    ) {
      throw new Error("This capability is not requestable for a named Space.");
    }
  } else if (raw.intent_kind === "role") {
    if (!isAccessRole(raw.catalog_key)) throw new Error("Unknown access role.");
    if (scope.kind !== "global" || spaceIds.length) {
      throw new Error("Role requests must use global scope.");
    }
  } else {
    if (raw.catalog_key !== "named_spaces" && raw.catalog_key !== "all_spaces") {
      throw new Error("Unknown Space access intent.");
    }
    if (raw.catalog_key !== scope.kind) {
      throw new Error("Space request key and scope must match.");
    }
  }

  return {
    schema_version: ACCESS_INTENT_SCHEMA_VERSION,
    intent_kind: raw.intent_kind,
    catalog_version: ACCESS_CATALOG_VERSION,
    catalog_key: raw.catalog_key,
    scope: { kind: scope.kind, space_ids: spaceIds },
  };
}

export function normalizeAccessReason(input: string, minimum = 10): string {
  const normalized = input.normalize("NFC").trim().replace(/\s+/gu, " ");
  const length = Array.from(normalized).length;
  if (length < minimum || length > 500) {
    throw new Error(`Reason must be between ${minimum} and 500 characters.`);
  }
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(normalized)) {
    throw new Error("Control characters are not allowed in a reason.");
  }
  if (/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(normalized)) {
    throw new Error("Bidirectional control characters are not allowed in a reason.");
  }
  if (/[<>]/u.test(normalized)) {
    throw new Error("Markup is not allowed in a reason.");
  }
  if (/\b(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|data:|javascript:)/iu.test(normalized)) {
    throw new Error("URLs are not allowed in a reason.");
  }
  return normalized;
}

export function computeAccessIntentIdentity(
  requesterUid: string,
  intent: AccessIntentV1,
): string {
  const canonical = canonicalizeAccessIntent(intent);
  const bytes = JSON.stringify({
    domain: "access-request:v1",
    requester_uid: requesterUid,
    intent: canonical,
  });
  return `access-intent-v1:${createHash("sha256").update(bytes, "utf8").digest("base64url")}`;
}

export function deriveAdditiveAccessPlan(
  baseline: NormalizedAccess,
  intentInput: AccessIntentV1,
): AdditiveAccessPlan {
  const intent = canonicalizeAccessIntent(intentInput);
  validateNormalizedAccess(baseline);
  let targetRole = baseline.role;
  let targetScope: NormalizedAccess["scope"] = cloneScope(baseline.scope);

  if (intent.intent_kind === "capability") {
    const capability = intent.catalog_key as Capability;
    targetRole = higherRole(baseline.role, minimumRoleForCapability(capability));
    if (intent.scope.kind === "named_spaces") {
      targetScope = addNamedSpaces(baseline.scope, intent.scope.space_ids);
    }
  } else if (intent.intent_kind === "role") {
    const requestedRole = intent.catalog_key as Role;
    if (roleIndex(requestedRole) <= roleIndex(baseline.role)) {
      throw new Error("The selected role does not add access.");
    }
    targetRole = requestedRole;
  } else if (intent.scope.kind === "all_spaces") {
    targetScope = { kind: "all_spaces", space_ids: [] };
  } else {
    targetScope = addNamedSpaces(baseline.scope, intent.scope.space_ids);
  }

  const addedCapabilityKeys = ACCESS_CAPABILITIES.filter(
    (capability) => can(targetRole, capability) && !can(baseline.role, capability),
  );
  const addedSpaceIds =
    baseline.scope.kind === "named_spaces" && targetScope.kind === "named_spaces"
      ? (targetScope.space_ids as readonly string[]).filter(
          (id) => !(baseline.scope.space_ids as readonly string[]).includes(id),
        )
      : [];
  const allSpacesAdded =
    baseline.scope.kind === "named_spaces" && targetScope.kind === "all_spaces";

  if (!addedCapabilityKeys.length && !addedSpaceIds.length && !allSpacesAdded) {
    throw new Error("The selected request does not add access.");
  }

  return {
    baseline_access: cloneAccess(baseline),
    target_access: { role: targetRole, scope: targetScope },
    added_capability_keys: addedCapabilityKeys,
    added_space_ids: addedSpaceIds,
    all_spaces_added: allSpacesAdded,
  };
}

export function buildAccessRequestPreview(input: {
  requesterUid: string;
  requesterLabel: string;
  intent: AccessIntentV1;
  reason: string;
  baseline: NormalizedAccess;
}): AccessRequestPreviewV1 {
  const requesterLabel = normalizePlainLabel(input.requesterLabel, 160);
  const reason = normalizeAccessReason(input.reason);
  const intent = canonicalizeAccessIntent(input.intent);
  const plan = deriveAdditiveAccessPlan(input.baseline, intent);
  return {
    schema_version: ACCESS_PREVIEW_SCHEMA_VERSION,
    requester_uid: input.requesterUid,
    requester_label: requesterLabel,
    intent,
    reason,
    baseline_access: plan.baseline_access,
    target_access: plan.target_access,
    added_capability_keys: plan.added_capability_keys,
    added_space_ids: plan.added_space_ids,
    all_spaces_added: plan.all_spaces_added,
    independent_conditions_statement: ACCESS_INDEPENDENT_CONDITIONS_STATEMENT,
  };
}

export function computeAccessPreviewHash(preview: AccessRequestPreviewV1): string {
  return createHash("sha256").update(JSON.stringify(preview), "utf8").digest("hex");
}

export function constantTimeHashEqual(left: string, right: string): boolean {
  if (!HASH_PATTERN.test(left) || !HASH_PATTERN.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function accessIntentLabel(intent: AccessIntentV1): string {
  if (intent.intent_kind === "capability") {
    return capabilityCatalogEntry(intent.catalog_key as Capability).label;
  }
  if (intent.intent_kind === "role") return `Request ${intent.catalog_key} role`;
  return intent.catalog_key === "all_spaces"
    ? "Request All spaces"
    : "Request Space access";
}

export function normalizePlainLabel(input: string, maximum: number): string {
  const result = input.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (
    !result ||
    Array.from(result).length > maximum ||
    /[\u0000-\u001f\u007f-\u009f<>]/u.test(result)
  ) {
    throw new Error("Invalid access label.");
  }
  return result;
}

export function validateNormalizedAccess(access: NormalizedAccess): void {
  if (!isAccessRole(access.role)) throw new Error("Invalid access role.");
  const ids = access.scope.space_ids;
  if (access.scope.kind === "all_spaces") {
    if (ids.length) throw new Error("All-spaces access cannot contain Space ids.");
    return;
  }
  if (!ids.length || ids.length > 50 || ids.some((id) => !SPACE_ID_PATTERN.test(id))) {
    throw new Error("Invalid named-Space access.");
  }
  const canonical = [...new Set(ids)].sort(compareCodePoint);
  if (JSON.stringify(canonical) !== JSON.stringify(ids)) {
    throw new Error("Named-Space access must be unique and canonical.");
  }
}

function higherRole(left: Role, right: Role): Role {
  return roleIndex(left) >= roleIndex(right) ? left : right;
}

function roleIndex(role: Role) {
  return ROLES.indexOf(role);
}

function addNamedSpaces(
  baseline: NormalizedAccess["scope"],
  requested: readonly string[],
): NormalizedAccess["scope"] {
  if (baseline.kind === "all_spaces") return { kind: "all_spaces", space_ids: [] };
  return {
    kind: "named_spaces",
    space_ids: [...new Set([...baseline.space_ids, ...requested])].sort(compareCodePoint),
  };
}

function cloneScope(scope: NormalizedAccess["scope"]): NormalizedAccess["scope"] {
  return scope.kind === "all_spaces"
    ? { kind: "all_spaces", space_ids: [] }
    : { kind: "named_spaces", space_ids: [...scope.space_ids] };
}

function cloneAccess(access: NormalizedAccess): NormalizedAccess {
  return { role: access.role, scope: cloneScope(access.scope) };
}

function compareCodePoint(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
