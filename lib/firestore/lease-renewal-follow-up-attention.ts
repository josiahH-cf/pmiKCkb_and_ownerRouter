// Audited app-owned lifecycle for one exact S75 due item. A due item is projected elsewhere; this
// store only records a human dismissal/reopen decision by its value-free evidence identity. It does
// not read or alter Gmail, policy, a client system of record, or any message content.

import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";

export const RENEWAL_FOLLOW_UP_ATTENTION_COLLECTION = "lease_renewal_follow_up_attention";
export const RENEWAL_FOLLOW_UP_ATTENTION_ACTIVITY_COLLECTION =
  "lease_renewal_follow_up_attention_activity";

const IsoDateTime = z.string().datetime({ offset: true });
const ExactAttentionSchema = z
  .object({
    leaseId: z.string().trim().min(1).max(120),
    dedupeKey: z.string().trim().min(1).max(1_000),
    dueAtIso: IsoDateTime,
    lastContactAtIso: IsoDateTime,
    policyVersion: z.number().int().positive(),
    policyScope: z.enum(["global", "property", "lease"]),
    sourceRefs: z.array(z.string().trim().min(1).max(300)).min(4).max(8),
  })
  .strict()
  .superRefine((attention, context) => {
    if (!attention.dedupeKey.startsWith(`renewal-follow-up-v1:${attention.leaseId}:`)) {
      context.addIssue({
        code: "custom",
        path: ["dedupeKey"],
        message: "The follow-up identity does not match the exact lease.",
      });
    }
    if (new Set(attention.sourceRefs).size !== attention.sourceRefs.length) {
      context.addIssue({
        code: "custom",
        path: ["sourceRefs"],
        message: "Follow-up source references must be unique.",
      });
    }
  });

export const RenewalFollowUpAttentionTransitionSchema = z
  .object({
    action: z.enum(["dismiss", "reopen"]),
    attention: ExactAttentionSchema,
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export type RenewalFollowUpAttentionTransitionInput = z.infer<
  typeof RenewalFollowUpAttentionTransitionSchema
>;

interface RenewalFollowUpAttentionRecord {
  id: string;
  lease_id: string;
  dedupe_key: string;
  state: "open" | "dismissed";
  due_at: string;
  last_contact_at: string;
  policy_version: number;
  policy_scope: "global" | "property" | "lease";
  source_refs: string[];
  record_version: number;
  last_idempotency_hash: string;
  last_reason_hash: string;
  created_at: string;
  updated_at: string;
  updated_by_uid: string;
}

export interface RenewalFollowUpAttentionTransitionResult {
  state: "open" | "dismissed";
  recordVersion: number;
  duplicate: boolean;
}

function assertCanRead(actor: AuthenticatedUser) {
  if (!can(actor.role, "read")) {
    throw new EditableLayerError("Renewal follow-up attention is unavailable.", 403);
  }
}

function assertCanEdit(actor: AuthenticatedUser) {
  if (!can(actor.role, "edit")) {
    throw new EditableLayerError(
      "Editor access is required to change renewal follow-up attention.",
      403,
    );
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function recordId(dedupeKey: string): string {
  return sha256(dedupeKey);
}

/** Return only exact keys currently dismissed; no customer labels or message data leave the store. */
export async function listDismissedRenewalFollowUpKeys(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<string[]> {
  assertCanRead(actor);
  try {
    const snapshot = await db
      .collection(RENEWAL_FOLLOW_UP_ATTENTION_COLLECTION)
      .where("state", "==", "dismissed")
      .get();
    return snapshot.docs
      .map((doc) => doc.data() as Partial<RenewalFollowUpAttentionRecord>)
      .filter(
        (
          record,
        ): record is Partial<RenewalFollowUpAttentionRecord> & {
          dedupe_key: string;
        } => typeof record.dedupe_key === "string",
      )
      .map((record) => record.dedupe_key)
      .sort();
  } catch {
    // Read failure must not suppress real attention.
    return [];
  }
}

export async function transitionRenewalFollowUpAttention(
  actor: AuthenticatedUser,
  rawInput: RenewalFollowUpAttentionTransitionInput,
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<RenewalFollowUpAttentionTransitionResult> {
  assertCanEdit(actor);
  const input = RenewalFollowUpAttentionTransitionSchema.parse(rawInput);
  const id = recordId(input.attention.dedupeKey);
  const ref = db.collection(RENEWAL_FOLLOW_UP_ATTENTION_COLLECTION).doc(id);
  const idempotencyHash = sha256(input.idempotencyKey);
  const reasonHash = sha256(input.reason);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists
      ? (snapshot.data() as RenewalFollowUpAttentionRecord)
      : null;
    if (existing?.last_idempotency_hash === idempotencyHash) {
      return {
        state: existing.state,
        recordVersion: existing.record_version,
        duplicate: true,
      };
    }

    const nextState = input.action === "dismiss" ? "dismissed" : "open";
    if (input.action === "dismiss" && existing?.state === "dismissed") {
      throw new EditableLayerError("That exact follow-up is already dismissed.", 409);
    }
    if (input.action === "reopen" && (!existing || existing.state !== "dismissed")) {
      throw new EditableLayerError(
        "That exact follow-up must be dismissed before it can be reopened.",
        409,
      );
    }

    const record: RenewalFollowUpAttentionRecord = {
      id,
      lease_id: input.attention.leaseId,
      dedupe_key: input.attention.dedupeKey,
      state: nextState,
      due_at: input.attention.dueAtIso,
      last_contact_at: input.attention.lastContactAtIso,
      policy_version: input.attention.policyVersion,
      policy_scope: input.attention.policyScope,
      source_refs: [...input.attention.sourceRefs],
      record_version: (existing?.record_version ?? 0) + 1,
      last_idempotency_hash: idempotencyHash,
      last_reason_hash: reasonHash,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      updated_by_uid: actor.uid,
    };
    transaction.set(ref, record);
    transaction.create(
      db.collection(RENEWAL_FOLLOW_UP_ATTENTION_ACTIVITY_COLLECTION).doc(uuidv7()),
      {
        attention_id: id,
        lease_id: record.lease_id,
        dedupe_key: record.dedupe_key,
        action: input.action === "dismiss" ? "dismissed" : "reopened",
        record_version: record.record_version,
        policy_version: record.policy_version,
        policy_scope: record.policy_scope,
        source_refs: record.source_refs,
        reason_hash: reasonHash,
        actor_uid: actor.uid,
        created_at: now,
      },
    );
    return {
      state: record.state,
      recordVersion: record.record_version,
      duplicate: false,
    };
  });
}
