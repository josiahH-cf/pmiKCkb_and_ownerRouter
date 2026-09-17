// S119: the app-owned staff work status store. One current record per lease plus append-only
// activity, with the same versioned-save conventions as the renewal workspace: server-derived
// actor, expected-revision conflict detection and duplicate-operation protection. It reads the
// workspace head only to record which cycle was current; it never creates, advances or completes a
// cycle and it reaches no provider.

import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { RENEWAL_WORKSPACE_COLLECTIONS } from "@/lib/firestore/renewal-workspace";
import {
  RENEWAL_WORK_STATUSES,
  RENEWAL_WORK_STATUS_SCHEMA_VERSION,
  type RenewalWorkStatusActivity,
  type RenewalWorkStatusRecord,
} from "@/lib/lease-renewal/work-status";

export const RENEWAL_WORK_STATUS_COLLECTIONS = {
  head: "lease_renewal_work_status",
  activity: "lease_renewal_work_status_activity",
} as const;

const leaseId = z.string().regex(/^[1-9]\d*$/);

export const RenewalWorkStatusRecordSchema = z
  .object({
    schemaVersion: z.literal(RENEWAL_WORK_STATUS_SCHEMA_VERSION),
    leaseId,
    revision: z.number().int().positive(),
    status: z.enum(RENEWAL_WORK_STATUSES),
    recordedAt: z.string().datetime(),
    recordedByUid: z.string().min(1),
    recordedByLabel: z.string().min(1),
    cycleId: z.string().uuid().nullable(),
    eventId: z.string().uuid(),
  })
  .strict();

export const SaveRenewalWorkStatusSchema = z
  .object({
    leaseId,
    status: z.enum(RENEWAL_WORK_STATUSES),
    expectedRevision: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
  })
  .strict();
export type SaveRenewalWorkStatusInput = z.input<typeof SaveRenewalWorkStatusSchema>;

export function renewalWorkStatusDocId(id: string): string {
  return createHash("sha256").update(leaseId.parse(id)).digest("hex");
}

function assertActor(actor: AuthenticatedUser, write = false) {
  if (write) assertMutationAllowed(requireEnvironmentDescriptor());
  if (
    !can(actor.role, write ? "edit" : "read") ||
    (write && isVerificationAccount(actor))
  )
    throw new EditableLayerError(
      write
        ? "Editor access is required to save the staff work status. Continue read-only or ask an Admin to review your role."
        : "Renewal workspace read access is required.",
      403,
    );
}

function parseRecord(raw: unknown, id: string): RenewalWorkStatusRecord {
  const record = RenewalWorkStatusRecordSchema.parse(raw);
  if (record.leaseId !== id)
    throw new EditableLayerError(
      "The saved work status identity does not match this lease.",
      409,
    );
  return record;
}

function activityFromStored(
  id: string,
  raw: Record<string, unknown>,
): RenewalWorkStatusActivity {
  return {
    id,
    leaseId: String(raw.lease_id),
    revision: Number(raw.next_revision),
    previousStatus:
      typeof raw.previous_status === "string"
        ? z.enum(RENEWAL_WORK_STATUSES).parse(raw.previous_status)
        : null,
    status: z.enum(RENEWAL_WORK_STATUSES).parse(raw.next_status),
    recordedAt: String(raw.recorded_at),
    recordedByUid: String(raw.actor_uid),
    recordedByLabel: String(raw.actor_label),
    cycleId: typeof raw.cycle_id === "string" ? raw.cycle_id : null,
  };
}

export async function getRenewalWorkStatus(
  actor: AuthenticatedUser,
  id: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalWorkStatusRecord | null> {
  assertActor(actor);
  const snapshot = await db
    .collection(RENEWAL_WORK_STATUS_COLLECTIONS.head)
    .doc(renewalWorkStatusDocId(id))
    .get();
  return snapshot.exists ? parseRecord(snapshot.data(), id) : null;
}

/** Every current staff status keyed by lease id, for the one bulk desk read. */
export async function listRenewalWorkStatuses(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<Map<string, RenewalWorkStatusRecord>> {
  assertActor(actor);
  const docs = await db.collection(RENEWAL_WORK_STATUS_COLLECTIONS.head).get();
  return new Map(
    docs.docs.map((doc) => {
      const record = RenewalWorkStatusRecordSchema.parse(doc.data());
      if (doc.id !== renewalWorkStatusDocId(record.leaseId))
        throw new EditableLayerError("A saved work status identity is invalid.", 409);
      return [record.leaseId, record];
    }),
  );
}

export async function listRenewalWorkStatusActivity(
  actor: AuthenticatedUser,
  id: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalWorkStatusActivity[]> {
  assertActor(actor);
  leaseId.parse(id);
  const result = await db
    .collection(RENEWAL_WORK_STATUS_COLLECTIONS.activity)
    .where("lease_id", "==", id)
    .get();
  return result.docs
    .map((doc) => activityFromStored(doc.id, doc.data()))
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.revision - b.revision);
}

/**
 * Save one lease's staff status. Atomic optimistic concurrency on the head revision, immutable
 * request identity by operation id, and the current cycle (if any) read inside the same
 * transaction. The workspace itself is never written.
 */
export async function saveRenewalWorkStatus(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
): Promise<{
  record: RenewalWorkStatusRecord;
  history: RenewalWorkStatusActivity[];
  duplicate: boolean;
}> {
  assertActor(actor, true);
  const input = SaveRenewalWorkStatusSchema.parse(raw);
  const requestHash = hashExecutionPreview({ actorUid: actor.uid, ...input });
  const head = db
    .collection(RENEWAL_WORK_STATUS_COLLECTIONS.head)
    .doc(renewalWorkStatusDocId(input.leaseId));
  const event = db
    .collection(RENEWAL_WORK_STATUS_COLLECTIONS.activity)
    .doc(input.operationId);
  const workspaceHead = db
    .collection(RENEWAL_WORKSPACE_COLLECTIONS.head)
    .doc(renewalWorkStatusDocId(input.leaseId));
  const duplicate = await db.runTransaction(async (tx) => {
    const [snapshot, prior, workspace] = await Promise.all([
      tx.get(head),
      tx.get(event),
      tx.get(workspaceHead),
    ]);
    if (prior.exists) {
      if (prior.get("request_hash") !== requestHash)
        throw new EditableLayerError(
          "This recorded status request changed. Reload before saving it again.",
          409,
        );
      return true;
    }
    const current = snapshot.exists ? parseRecord(snapshot.data(), input.leaseId) : null;
    if ((current?.revision ?? 0) !== input.expectedRevision)
      throw new EditableLayerError(
        "Another operator saved this status. Reload to review the current value before saving.",
        409,
      );
    const rawCycleId = workspace.exists ? workspace.get("cycleId") : null;
    const cycleId =
      typeof rawCycleId === "string" && z.string().uuid().safeParse(rawCycleId).success
        ? rawCycleId
        : null;
    const now = new Date().toISOString();
    const next = RenewalWorkStatusRecordSchema.parse({
      schemaVersion: RENEWAL_WORK_STATUS_SCHEMA_VERSION,
      leaseId: input.leaseId,
      revision: (current?.revision ?? 0) + 1,
      status: input.status,
      recordedAt: now,
      recordedByUid: actor.uid,
      recordedByLabel: actor.email,
      cycleId,
      eventId: input.operationId,
    } satisfies RenewalWorkStatusRecord);
    tx.set(head, next);
    tx.create(event, {
      lease_id: input.leaseId,
      request_hash: requestHash,
      actor_uid: actor.uid,
      actor_label: actor.email,
      recorded_at: now,
      previous_status: current?.status ?? null,
      next_status: next.status,
      previous_revision: current?.revision ?? 0,
      next_revision: next.revision,
      cycle_id: cycleId,
    });
    return false;
  });
  const [record, history] = await Promise.all([
    getRenewalWorkStatus(actor, input.leaseId, db),
    listRenewalWorkStatusActivity(actor, input.leaseId, db),
  ]);
  if (!record)
    throw new EditableLayerError(
      "The saved status could not be read back. Reload before saving again.",
      409,
    );
  return { record, history, duplicate };
}
