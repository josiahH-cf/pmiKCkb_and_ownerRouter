import { createHash } from "node:crypto";

import { z } from "zod";

export const COMMUNICATIONS_RETENTION_POLICY_VERSION =
  "communications-retention:v1.0" as const;

export const COMMUNICATIONS_RETENTION_CLASSES = [
  "confirmation",
  "push_dedupe",
  "sync_audit",
  "workflow_link",
  "bodyless_audit",
] as const;

export type CommunicationsRetentionClass =
  (typeof COMMUNICATIONS_RETENTION_CLASSES)[number];

const DAY_MS = 24 * 60 * 60 * 1_000;

export const COMMUNICATIONS_RETENTION_MS = Object.freeze({
  confirmation: 30 * DAY_MS,
  push_dedupe: 7 * DAY_MS,
  sync_audit: 90 * DAY_MS,
  workflow_link: 365 * DAY_MS,
  bodyless_audit: 7 * 365 * DAY_MS,
}) satisfies Readonly<Record<CommunicationsRetentionClass, number>>;

export const GMAIL_CONFIRMATION_USABILITY_MS = 10 * 60 * 1_000;

export const COMMUNICATIONS_RETENTION_TARGETS = Object.freeze({
  gmail_send_confirmations: "confirmation",
  gmail_send_audit: "bodyless_audit",
  gmail_push_dedupe: "push_dedupe",
  gmail_sync_audit: "sync_audit",
  gmail_workflow_communications: "workflow_link",
  gmail_workflow_communication_audit: "bodyless_audit",
  gmail_retention_audit: "bodyless_audit",
  gmail_retention_cleanup_runs: "bodyless_audit",
}) satisfies Readonly<Record<string, CommunicationsRetentionClass>>;

export type CommunicationsRetentionCollection =
  keyof typeof COMMUNICATIONS_RETENTION_TARGETS;

export interface CommunicationsRetentionFields {
  retention_policy_version: typeof COMMUNICATIONS_RETENTION_POLICY_VERSION;
  retention_class: CommunicationsRetentionClass;
  retention_anchor_at_ms: number;
  /**
   * Canonical Firestore TTL field. Firestore TTL requires a Date/Timestamp, not numeric millis.
   * Applying a hold clears both expiry representations before native TTL can delete the record.
   */
  expires_at: Date | null;
  expires_at_ms: number | null;
  legal_hold: boolean;
}

export interface CommunicationsRetentionCandidate extends CommunicationsRetentionFields {
  collection: CommunicationsRetentionCollection;
  id: string;
}

export interface CommunicationsCleanupPlan {
  policyVersion: typeof COMMUNICATIONS_RETENTION_POLICY_VERSION;
  plannedAtMs: number;
  candidates: CommunicationsRetentionCandidate[];
  counts: Partial<Record<CommunicationsRetentionClass, number>>;
}

export const DEFAULT_COMMUNICATIONS_CLEANUP_LIMIT = 500;
export const MAX_COMMUNICATIONS_CLEANUP_LIMIT = 5_000;

const SafeIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !/[\/\r\n\u0000-\u001f\u007f]/.test(value));

export const CommunicationsLegalHoldInputSchema = z
  .object({
    action: z.enum(["hold", "release"]),
    caseReference: z.string().trim().min(1).max(200),
    collection: z.enum(
      Object.keys(COMMUNICATIONS_RETENTION_TARGETS) as [
        CommunicationsRetentionCollection,
        ...CommunicationsRetentionCollection[],
      ],
    ),
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(200)
      .regex(/^[A-Za-z0-9_-]+$/),
    reason: z.string().trim().min(8).max(500),
    recordId: SafeIdSchema,
  })
  .strict();

export type CommunicationsLegalHoldInput = z.output<
  typeof CommunicationsLegalHoldInputSchema
>;

export function communicationsRetentionFields(
  retentionClass: CommunicationsRetentionClass,
  anchorAtMs: number,
): CommunicationsRetentionFields {
  assertTimestamp(anchorAtMs);
  const expiresAtMs = retentionExpiryMs(retentionClass, anchorAtMs);
  return {
    retention_policy_version: COMMUNICATIONS_RETENTION_POLICY_VERSION,
    retention_class: retentionClass,
    retention_anchor_at_ms: anchorAtMs,
    expires_at: new Date(expiresAtMs),
    expires_at_ms: expiresAtMs,
    legal_hold: false,
  };
}

export function refreshCommunicationsRetention(
  current: CommunicationsRetentionFields,
  retentionClass: CommunicationsRetentionClass,
  anchorAtMs: number,
): CommunicationsRetentionFields {
  const next = communicationsRetentionFields(retentionClass, anchorAtMs);
  return current.legal_hold
    ? { ...next, legal_hold: true, expires_at: null, expires_at_ms: null }
    : next;
}

export function retentionExpiryMs(
  retentionClass: CommunicationsRetentionClass,
  anchorAtMs: number,
) {
  assertTimestamp(anchorAtMs);
  return anchorAtMs + COMMUNICATIONS_RETENTION_MS[retentionClass];
}

export function parseRetentionCandidate(
  collection: CommunicationsRetentionCollection,
  id: string,
  value: unknown,
): CommunicationsRetentionCandidate | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const retentionClass = COMMUNICATIONS_RETENTION_TARGETS[collection];
  const validAnchor =
    typeof record.retention_anchor_at_ms === "number" &&
    Number.isFinite(record.retention_anchor_at_ms);
  const legalHold = record.legal_hold;
  const expiresAtMs = firestoreDateToMs(record.expires_at);
  const validExpiry =
    (typeof record.expires_at_ms === "number" &&
      Number.isFinite(record.expires_at_ms) &&
      expiresAtMs === record.expires_at_ms) ||
    (legalHold === true && record.expires_at_ms === null && record.expires_at === null);
  if (
    record.retention_policy_version !== COMMUNICATIONS_RETENTION_POLICY_VERSION ||
    record.retention_class !== retentionClass ||
    !validAnchor ||
    !validExpiry ||
    typeof legalHold !== "boolean"
  ) {
    return null;
  }
  return {
    collection,
    id,
    retention_policy_version: COMMUNICATIONS_RETENTION_POLICY_VERSION,
    retention_class: retentionClass,
    retention_anchor_at_ms: record.retention_anchor_at_ms as number,
    expires_at:
      typeof record.expires_at_ms === "number" ? new Date(record.expires_at_ms) : null,
    expires_at_ms: typeof record.expires_at_ms === "number" ? record.expires_at_ms : null,
    legal_hold: legalHold,
  };
}

/** Bodyless migration projection for legacy rows that have valid numeric expiry but no TTL Date. */
export function communicationsRetentionTtlMigration(
  collection: CommunicationsRetentionCollection,
  value: unknown,
): Pick<CommunicationsRetentionFields, "expires_at" | "expires_at_ms"> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const retentionClass = COMMUNICATIONS_RETENTION_TARGETS[collection];
  if (
    record.retention_policy_version !== COMMUNICATIONS_RETENTION_POLICY_VERSION ||
    record.retention_class !== retentionClass ||
    typeof record.retention_anchor_at_ms !== "number" ||
    !Number.isFinite(record.retention_anchor_at_ms) ||
    typeof record.legal_hold !== "boolean"
  ) {
    return null;
  }
  if (record.legal_hold) {
    return record.expires_at_ms === null
      ? { expires_at: null, expires_at_ms: null }
      : null;
  }
  const expected = retentionExpiryMs(retentionClass, record.retention_anchor_at_ms);
  return record.expires_at_ms === expected
    ? { expires_at: new Date(expected), expires_at_ms: expected }
    : null;
}

export function isCommunicationsCleanupEligible(
  candidate: CommunicationsRetentionCandidate,
  nowMs: number,
) {
  return (
    candidate.retention_policy_version === COMMUNICATIONS_RETENTION_POLICY_VERSION &&
    candidate.retention_class ===
      COMMUNICATIONS_RETENTION_TARGETS[candidate.collection] &&
    typeof candidate.expires_at_ms === "number" &&
    candidate.expires_at_ms ===
      retentionExpiryMs(candidate.retention_class, candidate.retention_anchor_at_ms) &&
    !candidate.legal_hold &&
    candidate.expires_at_ms <= nowMs
  );
}

/**
 * Legal hold suppresses native TTL by clearing `expires_at` and `expires_at_ms`; it does not extend the product's
 * normal usability window. Derive that window from the immutable policy class and anchor.
 */
export function isCommunicationsRecordActive(
  collection: CommunicationsRetentionCollection,
  id: string,
  value: unknown,
  nowMs: number,
) {
  const candidate = parseRetentionCandidate(collection, id, value);
  return Boolean(
    candidate &&
    retentionExpiryMs(candidate.retention_class, candidate.retention_anchor_at_ms) >
      nowMs,
  );
}

export function planCommunicationsCleanup(
  candidates: readonly CommunicationsRetentionCandidate[],
  nowMs: number,
  limit = DEFAULT_COMMUNICATIONS_CLEANUP_LIMIT,
): CommunicationsCleanupPlan {
  assertCommunicationsCleanupLimit(limit);
  const eligible = candidates
    .filter((candidate) => isCommunicationsCleanupEligible(candidate, nowMs))
    .sort(
      (left, right) =>
        // Eligibility above proves the stored expiry equals this deterministic value. Recomputing it
        // here keeps held/null records out of arithmetic even if a caller supplies a broad type.
        retentionExpiryMs(left.retention_class, left.retention_anchor_at_ms) -
          retentionExpiryMs(right.retention_class, right.retention_anchor_at_ms) ||
        left.collection.localeCompare(right.collection) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, limit);
  const counts: Partial<Record<CommunicationsRetentionClass, number>> = {};
  for (const candidate of eligible) {
    counts[candidate.retention_class] = (counts[candidate.retention_class] ?? 0) + 1;
  }
  return {
    policyVersion: COMMUNICATIONS_RETENTION_POLICY_VERSION,
    plannedAtMs: nowMs,
    candidates: eligible,
    counts,
  };
}

export function assertCommunicationsCleanupLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_COMMUNICATIONS_CLEANUP_LIMIT) {
    throw new Error(
      `Communications cleanup limit must be between 1 and ${MAX_COMMUNICATIONS_CLEANUP_LIMIT}.`,
    );
  }
}

export function legalHoldAuditId(
  input: Pick<CommunicationsLegalHoldInput, "collection" | "recordId" | "idempotencyKey">,
) {
  return sha256(
    `${input.collection}\u0000${input.recordId}\u0000${input.idempotencyKey}`,
  );
}

export function buildCommunicationsLegalHoldTransition(input: {
  actorUid: string;
  candidate: CommunicationsRetentionCandidate;
  decision: CommunicationsLegalHoldInput;
  nowMs: number;
}) {
  const legalHold = input.decision.action === "hold";
  return {
    legalHold,
    update: {
      legal_hold: legalHold,
      expires_at: legalHold
        ? null
        : new Date(
            retentionExpiryMs(
              input.candidate.retention_class,
              input.candidate.retention_anchor_at_ms,
            ),
          ),
      expires_at_ms: legalHold
        ? null
        : retentionExpiryMs(
            input.candidate.retention_class,
            input.candidate.retention_anchor_at_ms,
          ),
      ...(legalHold
        ? {
            held_at_ms: input.nowMs,
            held_by_uid: input.actorUid,
            hold_case_ref_hash: hashRetentionText(input.decision.caseReference),
            hold_reason_hash: hashRetentionText(input.decision.reason),
          }
        : {
            held_at_ms: null,
            held_by_uid: null,
            hold_case_ref_hash: null,
            hold_reason_hash: null,
            released_at_ms: input.nowMs,
            released_by_uid: input.actorUid,
          }),
    },
    audit: {
      action: legalHold ? "legal_hold_applied" : "legal_hold_released",
      actor_uid: input.actorUid,
      collection: input.decision.collection,
      record_id_hash: hashRetentionText(input.decision.recordId),
      reason_hash: hashRetentionText(input.decision.reason),
      case_ref_hash: hashRetentionText(input.decision.caseReference),
      created_at_ms: input.nowMs,
      ...bodylessRetentionAuditFields(input.nowMs),
    },
  } as const;
}

export function hashRetentionText(value: string) {
  return sha256(value.trim());
}

export function bodylessRetentionAuditFields(createdAtMs: number) {
  return communicationsRetentionFields("bodyless_audit", createdAtMs);
}

function assertTimestamp(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Retention timestamps must be finite and non-negative.");
  }
}

function firestoreDateToMs(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
