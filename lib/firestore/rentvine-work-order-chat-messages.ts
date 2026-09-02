// S100 imported work-order chat store. One document per (RentVine account reference, messageID)
// holds the bounded display body, truncation state, full-content payload hash, provider ids and
// instant, mapping state, allowlisted attachment metadata, sync-attempt reference, and the fixed
// 365-day workflow_link retention stamp anchored at FIRST successful import. Duplicate sync,
// view, mapping review, draft creation, and changed-payload quarantine never refresh the anchor.
// Changed duplicate payloads are never overwritten; they land in the restricted review lane with
// both hashes and no duplicated body. Browser code cannot read or write this collection.

import { type Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firestore/admin";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  COMMUNICATIONS_RETENTION_MS,
  COMMUNICATIONS_RETENTION_POLICY_VERSION,
} from "@/lib/gmail-hub/retention-contract";
import type { ChatRowDisposition } from "@/lib/integrations/rentvine/chat-contract";

export const WORK_ORDER_CHAT_COLLECTION = "rentvine_work_order_chat_messages";

const AttachmentSchema = z
  .object({
    file_attachment_id: z.number().int().positive(),
    file_id: z.number().int().positive(),
    title: z.string().max(500),
    file_name: z.string().max(500),
    file_type: z.string().max(500),
    preview_file_name: z.string().max(500).nullable(),
  })
  .strict();

export const WorkOrderChatMessageSchema = z
  .object({
    lane: z.literal("message"),
    account_ref: z.string().min(1).max(200),
    message_id: z.number().int().positive(),
    ticket_ref: z.string().min(1).max(200),
    work_order_id: z.string().regex(/^[1-9][0-9]*$/),
    role: z.enum(["manager", "tenant"]),
    user_id: z.number().int().positive().nullable(),
    contact_id: z.number().int().positive().nullable(),
    created_at_iso: z.string().min(20).max(40),
    body: z.string().max(20_000),
    truncated: z.boolean(),
    payload_hash: z.string().regex(/^[a-f0-9]{64}$/),
    attachments: z.array(AttachmentSchema).max(20),
    mapping_state: z.enum(["resident_bound", "needs_mapping", "nonresident"]),
    resident_lease_id: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .nullable(),
    resident_lease_tenant_id: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .nullable(),
    resident_source_version: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    sync_attempt_ref: z.string().min(1).max(300),
    retention_policy_version: z.literal(COMMUNICATIONS_RETENTION_POLICY_VERSION),
    retention_class: z.literal("workflow_link"),
    retention_anchor_at_ms: z.number().int().positive(),
    expires_at: z.string().min(20).max(40),
    expires_at_ms: z.number().int().positive(),
    legal_hold: z.literal(false),
  })
  .strict();

export const WorkOrderChatReviewSchema = z
  .object({
    lane: z.literal("review"),
    account_ref: z.string().min(1).max(200),
    message_id: z.number().int().positive(),
    ticket_ref: z.string().min(1).max(200),
    work_order_id: z.string().regex(/^[1-9][0-9]*$/),
    reason: z.enum([
      "unknown_role",
      "role_id_shape_mismatch",
      "invalid_attachment_metadata",
      "provider_message_changed",
    ]),
    payload_hash: z.string().regex(/^[a-f0-9]{64}$/),
    prior_payload_hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    created_at_iso: z.string().min(20).max(40).nullable(),
    sync_attempt_ref: z.string().min(1).max(300),
    retention_policy_version: z.literal(COMMUNICATIONS_RETENTION_POLICY_VERSION),
    retention_class: z.literal("workflow_link"),
    retention_anchor_at_ms: z.number().int().positive(),
    expires_at: z.string().min(20).max(40),
    expires_at_ms: z.number().int().positive(),
    legal_hold: z.literal(false),
  })
  .strict();

export type WorkOrderChatMessage = z.infer<typeof WorkOrderChatMessageSchema>;
export type WorkOrderChatReview = z.infer<typeof WorkOrderChatReviewSchema>;

export interface ChatSyncCounts {
  new_messages: number;
  already_synced: number;
  needs_mapping: number;
  review: number;
  rejected: number;
  truncated: number;
}

export interface ResidentBinding {
  /** Chat contact ids that resolved to exactly one fresh lease-tenant match. */
  contactId: number;
  leaseId: string;
  leaseTenantId: string;
  sourceVersion: string;
}

function messageDocId(accountRef: string, messageId: number): string {
  return `${accountRef.replaceAll("/", "_")}:${messageId}`;
}

function retentionStamp(nowMs: number) {
  const expiresAtMs = nowMs + COMMUNICATIONS_RETENTION_MS.workflow_link;
  return {
    retention_policy_version: COMMUNICATIONS_RETENTION_POLICY_VERSION,
    retention_class: "workflow_link" as const,
    retention_anchor_at_ms: nowMs,
    expires_at: new Date(expiresAtMs).toISOString(),
    expires_at_ms: expiresAtMs,
    legal_hold: false as const,
  };
}

function requireEditor(actor: AuthenticatedUser): void {
  if (!can(actor.role, "edit")) {
    throw new EditableLayerError("Chat sync requires the edit capability.", 403);
  }
}

/**
 * Commit one valid bounded page atomically: creates, duplicate counting, changed-payload
 * quarantine, and per-row mapping dispositions. Rejected rows are counted but never stored.
 */
export async function commitChatSyncPage(
  actor: AuthenticatedUser,
  input: {
    accountRef: string;
    ticketRef: string;
    workOrderId: string;
    syncAttemptRef: string;
    dispositions: ChatRowDisposition[];
    /** Fresh unique resident matches by chat contact id (auto-bind during this same sync). */
    residentBindings: ReadonlyMap<number, ResidentBinding>;
    nowMs: number;
  },
  db: Firestore = getAdminFirestore(),
): Promise<ChatSyncCounts> {
  requireEditor(actor);
  const counts: ChatSyncCounts = {
    new_messages: 0,
    already_synced: 0,
    needs_mapping: 0,
    review: 0,
    rejected: 0,
    truncated: 0,
  };
  const collection = db.collection(WORK_ORDER_CHAT_COLLECTION);

  await db.runTransaction(async (transaction) => {
    const writes: { id: string; record: WorkOrderChatMessage | WorkOrderChatReview }[] =
      [];
    for (const disposition of input.dispositions) {
      if (disposition.kind === "rejected") {
        counts.rejected += 1;
        continue;
      }
      if (disposition.kind === "review") {
        counts.review += 1;
        const id = `${messageDocId(input.accountRef, disposition.messageId)}:review:${disposition.payloadHash.slice(0, 12)}`;
        const existing = await transaction.get(collection.doc(id));
        if (existing.exists) continue;
        writes.push({
          id,
          record: WorkOrderChatReviewSchema.parse({
            lane: "review",
            account_ref: input.accountRef,
            message_id: disposition.messageId,
            ticket_ref: input.ticketRef,
            work_order_id: input.workOrderId,
            reason: disposition.reason,
            payload_hash: disposition.payloadHash,
            prior_payload_hash: null,
            created_at_iso: disposition.createdAtIso,
            sync_attempt_ref: input.syncAttemptRef,
            ...retentionStamp(input.nowMs),
          }),
        });
        continue;
      }

      const id = messageDocId(input.accountRef, disposition.messageId);
      const existing = await transaction.get(collection.doc(id));
      if (existing.exists) {
        const current = existing.data() as WorkOrderChatMessage;
        if (current.payload_hash === disposition.payloadHash) {
          counts.already_synced += 1;
          continue;
        }
        // Changed duplicate: quarantine with both hashes; the stored record stays untouched.
        counts.review += 1;
        const reviewId = `${id}:review:${disposition.payloadHash.slice(0, 12)}`;
        const existingReview = await transaction.get(collection.doc(reviewId));
        if (existingReview.exists) continue;
        writes.push({
          id: reviewId,
          record: WorkOrderChatReviewSchema.parse({
            lane: "review",
            account_ref: input.accountRef,
            message_id: disposition.messageId,
            ticket_ref: input.ticketRef,
            work_order_id: input.workOrderId,
            reason: "provider_message_changed",
            payload_hash: disposition.payloadHash,
            prior_payload_hash: current.payload_hash,
            created_at_iso: disposition.createdAtIso,
            sync_attempt_ref: input.syncAttemptRef,
            ...retentionStamp(input.nowMs),
          }),
        });
        continue;
      }

      counts.new_messages += 1;
      if (disposition.truncated) counts.truncated += 1;
      const binding =
        disposition.role === "tenant" && disposition.contactId !== null
          ? input.residentBindings.get(disposition.contactId)
          : undefined;
      const mappingState =
        disposition.role === "manager"
          ? "nonresident"
          : binding
            ? "resident_bound"
            : "needs_mapping";
      if (mappingState === "needs_mapping") counts.needs_mapping += 1;
      writes.push({
        id,
        record: WorkOrderChatMessageSchema.parse({
          lane: "message",
          account_ref: input.accountRef,
          message_id: disposition.messageId,
          ticket_ref: input.ticketRef,
          work_order_id: input.workOrderId,
          role: disposition.role,
          user_id: disposition.userId,
          contact_id: disposition.contactId,
          created_at_iso: disposition.createdAtIso,
          body: disposition.body,
          truncated: disposition.truncated,
          payload_hash: disposition.payloadHash,
          attachments: disposition.attachments.map((entry) => ({
            file_attachment_id: entry.fileAttachmentId,
            file_id: entry.fileId,
            title: entry.title,
            file_name: entry.fileName,
            file_type: entry.fileType,
            preview_file_name: entry.previewFileName,
          })),
          mapping_state: mappingState,
          resident_lease_id: binding?.leaseId ?? null,
          resident_lease_tenant_id: binding?.leaseTenantId ?? null,
          resident_source_version: binding?.sourceVersion ?? null,
          sync_attempt_ref: input.syncAttemptRef,
          ...retentionStamp(input.nowMs),
        }),
      });
    }
    for (const write of writes) {
      transaction.set(collection.doc(write.id), write.record);
    }
  });
  return counts;
}

/** Read the stored thread (messages plus review rows) for one ticket, oldest first. */
export async function listWorkOrderChatRecords(
  actor: AuthenticatedUser,
  ticketRef: string,
  db: Firestore = getAdminFirestore(),
): Promise<(WorkOrderChatMessage | WorkOrderChatReview)[]> {
  if (!can(actor.role, "edit")) {
    throw new EditableLayerError(
      "Reading imported chat requires the edit capability.",
      403,
    );
  }
  const snapshot = await db
    .collection(WORK_ORDER_CHAT_COLLECTION)
    .where("ticket_ref", "==", ticketRef)
    .get();
  const rows = snapshot.docs.map((doc) => {
    const data = doc.data() as { lane?: string };
    return data.lane === "review"
      ? WorkOrderChatReviewSchema.parse(doc.data())
      : WorkOrderChatMessageSchema.parse(doc.data());
  });
  rows.sort((a, b) => (a.created_at_iso ?? "").localeCompare(b.created_at_iso ?? ""));
  return rows;
}

/** Load one stored resident-origin message for the draft workflow. */
export async function getWorkOrderChatMessage(
  actor: AuthenticatedUser,
  accountRef: string,
  messageId: number,
  db: Firestore = getAdminFirestore(),
): Promise<WorkOrderChatMessage | null> {
  if (!can(actor.role, "edit")) {
    throw new EditableLayerError(
      "Reading imported chat requires the edit capability.",
      403,
    );
  }
  const snapshot = await db
    .collection(WORK_ORDER_CHAT_COLLECTION)
    .doc(messageDocId(accountRef, messageId))
    .get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as { lane?: string };
  if (data.lane !== "message") return null;
  return WorkOrderChatMessageSchema.parse(snapshot.data());
}

/**
 * Rerun-only mapping update: replace the mapping fields of one stored tenant-role message with a
 * fresh unique source result. Never accepts a person/email; only the same compare-and-commit
 * source algorithm's output. The retention anchor never changes.
 */
export async function applyRerunResidentBinding(
  actor: AuthenticatedUser,
  input: {
    accountRef: string;
    messageId: number;
    binding: ResidentBinding | null;
  },
  db: Firestore = getAdminFirestore(),
): Promise<"resident_bound" | "needs_mapping"> {
  requireEditor(actor);
  const ref = db
    .collection(WORK_ORDER_CHAT_COLLECTION)
    .doc(messageDocId(input.accountRef, input.messageId));
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      throw new EditableLayerError("The chat message is not stored.", 404);
    }
    const current = WorkOrderChatMessageSchema.parse(snapshot.data());
    if (current.role !== "tenant") {
      throw new EditableLayerError(
        "Only a tenant-role message can bind a resident.",
        409,
      );
    }
    if (
      input.binding &&
      current.contact_id !== null &&
      input.binding.contactId !== current.contact_id
    ) {
      throw new EditableLayerError(
        "The rerun result does not match this message's contact identity.",
        409,
      );
    }
    const state = input.binding ? "resident_bound" : "needs_mapping";
    transaction.update(ref, {
      mapping_state: state,
      resident_lease_id: input.binding?.leaseId ?? null,
      resident_lease_tenant_id: input.binding?.leaseTenantId ?? null,
      resident_source_version: input.binding?.sourceVersion ?? null,
    });
    return state;
  });
}
