// S157/S156/S158: the app-owned lease-bound working record store. One current document per lease
// plus append-only activity. Each field saves on its own: a per-field revision detects a real
// concurrent edit of that field, an operation id makes a retry return the first result instead of
// appending again, and unrelated fields never conflict. The actor and time come from the server.
// It reaches no provider and creates no renewal cycle, staff activity or milestone.

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
import {
  RENEWAL_WORKING_RECORD_SCHEMA_VERSION,
  WORKING_VALUE_ORIGINS,
  parseWorkingFieldValue,
  sameWorkingValue,
  workingFieldKind,
  type RenewalWorkingActivity,
  type RenewalWorkingRecord,
  type WorkingValue,
} from "@/lib/lease-renewal/working-record";

export const RENEWAL_WORKING_RECORD_COLLECTIONS = {
  head: "lease_renewal_working_records",
  activity: "lease_renewal_working_record_activity",
} as const;

const leaseId = z.string().regex(/^[1-9]\d*$/);
const storedValue = z.union([
  z.number(),
  z.string(),
  z.object({ tabTitle: z.string(), rowNumber: z.number() }).strict(),
  z.object({ tabTitle: z.string(), cell: z.string() }).strict(),
]);
const entrySchema = z
  .object({
    value: storedValue.nullable(),
    revision: z.number().int().positive(),
    eventId: z.string().uuid(),
    recordedAt: z.string().datetime(),
    recordedByUid: z.string().min(1),
    recordedByLabel: z.string().min(1),
    origin: z.enum(WORKING_VALUE_ORIGINS),
    sourceLabel: z.string().min(1).max(120).optional(),
    context: z.string().min(1).max(1000).optional(),
  })
  .strict();

export const RenewalWorkingRecordSchema = z
  .object({
    schemaVersion: z.literal(RENEWAL_WORKING_RECORD_SCHEMA_VERSION),
    leaseId,
    revision: z.number().int().positive(),
    fields: z.record(z.string(), entrySchema),
  })
  .strict();

export const SaveRenewalWorkingFieldSchema = z
  .object({
    leaseId,
    field: z.string().min(1).max(80),
    /** Null deliberately clears the working value; the source value then stands alone. */
    value: z.unknown().nullable(),
    /** The field revision the editor last read; 0 when the field has never been saved. */
    expectedRevision: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
    origin: z.enum(WORKING_VALUE_ORIGINS).default("staff_entry"),
    sourceLabel: z.string().trim().min(1).max(120).optional(),
    context: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();
export type SaveRenewalWorkingFieldInput = z.input<typeof SaveRenewalWorkingFieldSchema>;

export function renewalWorkingRecordDocId(id: string): string {
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
        ? "Editor access is required to save working information. Continue read-only or ask an Admin to review your role."
        : "Renewal workspace read access is required.",
      403,
    );
}

/** The lease's working-record head, for a reader that needs it inside its own transaction. */
export function renewalWorkingRecordRef(db: Firestore, id: string) {
  return db
    .collection(RENEWAL_WORKING_RECORD_COLLECTIONS.head)
    .doc(renewalWorkingRecordDocId(id));
}
export function parseRenewalWorkingRecord(
  raw: unknown,
  id: string,
): RenewalWorkingRecord {
  return parseRecord(raw, id);
}
function parseRecord(raw: unknown, id: string): RenewalWorkingRecord {
  const record = RenewalWorkingRecordSchema.parse(raw) as RenewalWorkingRecord;
  if (record.leaseId !== id)
    throw new EditableLayerError(
      "The saved working record identity does not match this lease.",
      409,
    );
  return record;
}

function activityFromStored(
  id: string,
  raw: Record<string, unknown>,
): RenewalWorkingActivity {
  const value = storedValue.nullable().parse(raw.next_value ?? null);
  const previous = storedValue.nullable().parse(raw.previous_value ?? null);
  return {
    id,
    leaseId: String(raw.lease_id),
    field: String(raw.field),
    previousValue: previous as WorkingValue | null,
    value: value as WorkingValue | null,
    revision: Number(raw.next_revision),
    recordedAt: String(raw.recorded_at),
    recordedByUid: String(raw.actor_uid),
    recordedByLabel: String(raw.actor_label),
    origin: z.enum(WORKING_VALUE_ORIGINS).parse(raw.origin),
    ...(typeof raw.source_label === "string" ? { sourceLabel: raw.source_label } : {}),
    ...(typeof raw.context === "string" ? { context: raw.context } : {}),
  };
}

export async function getRenewalWorkingRecord(
  actor: AuthenticatedUser,
  id: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalWorkingRecord | null> {
  assertActor(actor);
  const snapshot = await db
    .collection(RENEWAL_WORKING_RECORD_COLLECTIONS.head)
    .doc(renewalWorkingRecordDocId(id))
    .get();
  return snapshot.exists ? parseRecord(snapshot.data(), id) : null;
}

/** Every lease's working record keyed by lease id, for the one bulk desk read. */
export async function listRenewalWorkingRecords(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<Map<string, RenewalWorkingRecord>> {
  assertActor(actor);
  const docs = await db.collection(RENEWAL_WORKING_RECORD_COLLECTIONS.head).get();
  return new Map(
    docs.docs.map((doc) => {
      const record = RenewalWorkingRecordSchema.parse(doc.data()) as RenewalWorkingRecord;
      if (doc.id !== renewalWorkingRecordDocId(record.leaseId))
        throw new EditableLayerError("A saved working record identity is invalid.", 409);
      return [record.leaseId, record];
    }),
  );
}

export async function listRenewalWorkingActivity(
  actor: AuthenticatedUser,
  id: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalWorkingActivity[]> {
  assertActor(actor);
  leaseId.parse(id);
  const result = await db
    .collection(RENEWAL_WORKING_RECORD_COLLECTIONS.activity)
    .where("lease_id", "==", id)
    .get();
  return result.docs
    .map((doc) => activityFromStored(doc.id, doc.data()))
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.revision - b.revision);
}

/**
 * Save one working field. Atomic: the same operation id with the same request returns the stored
 * result as a duplicate; a different field revision than the editor read is a real concurrent
 * edit of that field and is refused with the current entry, leaving every other field usable.
 */
export async function saveRenewalWorkingField(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
): Promise<{ record: RenewalWorkingRecord; duplicate: boolean }> {
  assertActor(actor, true);
  const input = SaveRenewalWorkingFieldSchema.parse(raw);
  if (!workingFieldKind(input.field))
    throw new EditableLayerError("This working field is not recognized.", 400);
  let value: WorkingValue | null = null;
  if (input.value !== null) {
    const parsed = parseWorkingFieldValue(input.field, input.value);
    if (!parsed.ok) throw new EditableLayerError(parsed.error, 400);
    value = parsed.value;
  }
  if (input.origin === "adopted_source" && !input.sourceLabel)
    throw new EditableLayerError("Name the source this value was adopted from.", 400);
  const requestHash = hashExecutionPreview({
    actorUid: actor.uid,
    ...input,
    value,
  });
  const head = db
    .collection(RENEWAL_WORKING_RECORD_COLLECTIONS.head)
    .doc(renewalWorkingRecordDocId(input.leaseId));
  const event = db
    .collection(RENEWAL_WORKING_RECORD_COLLECTIONS.activity)
    .doc(input.operationId);
  const duplicate = await db.runTransaction(async (tx) => {
    const [snapshot, prior] = await Promise.all([tx.get(head), tx.get(event)]);
    if (prior.exists) {
      if (prior.get("request_hash") !== requestHash)
        throw new EditableLayerError(
          "This saved request changed. Reload before saving it again.",
          409,
        );
      return true;
    }
    const current = snapshot.exists ? parseRecord(snapshot.data(), input.leaseId) : null;
    const entry = current?.fields[input.field] ?? null;
    if ((entry?.revision ?? 0) !== input.expectedRevision)
      throw new EditableLayerError(
        "Another operator changed this value. Your entry is kept; review the current value before saving again.",
        409,
      );
    if (!entry && value === null)
      throw new EditableLayerError("There is no working value to clear.", 400);
    if (entry && sameWorkingValue(entry.value, value) && entry.origin === input.origin)
      // Nothing changed: keep the original attribution rather than appending an empty event.
      return true;
    const now = new Date().toISOString();
    const nextEntry = {
      value,
      revision: (entry?.revision ?? 0) + 1,
      eventId: input.operationId,
      recordedAt: now,
      recordedByUid: actor.uid,
      recordedByLabel: actor.email,
      origin: input.origin,
      ...(input.origin === "adopted_source" && input.sourceLabel
        ? { sourceLabel: input.sourceLabel }
        : {}),
      ...(input.context ? { context: input.context } : {}),
    };
    const next = RenewalWorkingRecordSchema.parse({
      schemaVersion: RENEWAL_WORKING_RECORD_SCHEMA_VERSION,
      leaseId: input.leaseId,
      revision: (current?.revision ?? 0) + 1,
      fields: { ...(current?.fields ?? {}), [input.field]: nextEntry },
    });
    tx.set(head, next);
    tx.create(event, {
      lease_id: input.leaseId,
      field: input.field,
      request_hash: requestHash,
      actor_uid: actor.uid,
      actor_label: actor.email,
      recorded_at: now,
      previous_value: entry?.value ?? null,
      next_value: value,
      previous_revision: entry?.revision ?? 0,
      next_revision: nextEntry.revision,
      origin: input.origin,
      ...(nextEntry.sourceLabel ? { source_label: nextEntry.sourceLabel } : {}),
      ...(input.context ? { context: input.context } : {}),
    });
    return false;
  });
  const record = await getRenewalWorkingRecord(actor, input.leaseId, db);
  if (!record)
    throw new EditableLayerError(
      "The saved working value could not be read back. Your entry is kept; save it again.",
      409,
    );
  return { record, duplicate };
}
