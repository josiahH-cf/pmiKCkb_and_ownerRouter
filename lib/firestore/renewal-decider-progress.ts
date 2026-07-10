// KB-owned persistence for per-user Lease Renewal decider progress (S14 B6).
//
// A current-state marker records whether one reconciliation card was Seen or Deferred by one
// operator. Skip writes Deferred so the card can be omitted when that same operator remounts the
// decider; this is navigation state, not a resolution or system-of-record decision. Every current
// write has an append-only Activity twin in the same transaction.
//
// GOVERNANCE: the payload is deliberately value-free. It accepts only opaque run/trigger keys and a
// status; it never stores a candidate value, address, email, reason, or other client data. Writes are
// gated at `edit`, reads return only the signed-in operator's own records, and nothing here executes a
// send or a system-of-record write.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";

export const RENEWAL_DECIDER_PROGRESS_COLLECTIONS = {
  progress: "renewal_decider_progress",
  activity: "renewal_decider_progress_activity",
} as const;

const OpaqueRunIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9:_-]+$/, "Run id must be an opaque identifier.");

const OpaqueSourceTriggerKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^[a-zA-Z0-9:_-]+$/, "Source trigger key must be an opaque identifier.");

export const RenewalDeciderProgressStatusSchema = z.enum(["Deferred", "Seen"]);
export type RenewalDeciderProgressStatus = z.output<
  typeof RenewalDeciderProgressStatusSchema
>;

/** Strict and value-free by design: unknown fields are rejected instead of silently persisted. */
export const SetRenewalDeciderProgressInputSchema = z
  .object({
    run_id: OpaqueRunIdSchema,
    source_trigger_key: OpaqueSourceTriggerKeySchema,
    status: RenewalDeciderProgressStatusSchema,
  })
  .strict();
export type SetRenewalDeciderProgressInput = z.input<
  typeof SetRenewalDeciderProgressInputSchema
>;

export const RenewalDeciderProgressRunQuerySchema = z
  .object({ run_id: OpaqueRunIdSchema })
  .strict();

export interface RenewalDeciderProgressRecord {
  id: string;
  user_uid: string;
  run_id: string;
  source_trigger_key: string;
  status: RenewalDeciderProgressStatus;
  created_at: string;
  updated_at: string;
}

/** Minimal client contract; user ids and persistence metadata never need to cross the API. */
export type RenewalDeciderProgressMarker = Pick<
  RenewalDeciderProgressRecord,
  "source_trigger_key" | "status"
>;

export interface RenewalDeciderProgressActivityRecord {
  id: string;
  actor_uid: string;
  run_id: string;
  source_trigger_key: string;
  action: RenewalDeciderProgressStatus;
  previous_status?: RenewalDeciderProgressStatus;
  new_status: RenewalDeciderProgressStatus;
  created_at: string;
}

/**
 * Upsert one per-user decider marker. Requires `edit`; an Editor can use it without approval rights.
 * The deterministic natural key keeps one current record per (user, run, flag), while Activity is
 * append-only. The write is app-plane navigation state only.
 */
export async function setRenewalDeciderProgress(
  actor: AuthenticatedUser,
  input: SetRenewalDeciderProgressInput,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalDeciderProgressRecord> {
  assertCan(actor, "edit");
  const parsed = SetRenewalDeciderProgressInputSchema.parse(input);
  const docId = renewalDeciderProgressDocId(
    actor.uid,
    parsed.run_id,
    parsed.source_trigger_key,
  );

  await db.runTransaction(async (transaction) => {
    const ref = progressRef(db, docId);
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists ? snapshot.data() : undefined;
    const previousStatus = existing?.status as RenewalDeciderProgressStatus | undefined;
    const createdAt = existing?.created_at ?? FieldValue.serverTimestamp();

    // Full set (no merge): the strict shape prevents stale or client-value fields from surviving.
    transaction.set(ref, {
      id: docId,
      user_uid: actor.uid,
      run_id: parsed.run_id,
      source_trigger_key: parsed.source_trigger_key,
      status: parsed.status,
      created_at: createdAt,
      updated_at: FieldValue.serverTimestamp(),
    });

    const activityId = uuidv7();
    transaction.set(
      activityRef(db, activityId),
      stripUndefined({
        id: activityId,
        actor_uid: actor.uid,
        run_id: parsed.run_id,
        source_trigger_key: parsed.source_trigger_key,
        action: parsed.status,
        previous_status: previousStatus,
        new_status: parsed.status,
        created_at: FieldValue.serverTimestamp(),
      }),
    );
  });

  const progress = await getRenewalDeciderProgress(
    actor,
    parsed.run_id,
    parsed.source_trigger_key,
    db,
  );
  if (!progress) {
    throw new EditableLayerError(
      "Renewal decider progress could not be read back after write.",
      404,
    );
  }
  return progress;
}

/** Read one marker for the signed-in user only. */
export async function getRenewalDeciderProgress(
  actor: AuthenticatedUser,
  runId: string,
  sourceTriggerKey: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalDeciderProgressRecord | null> {
  assertCan(actor, "read");
  const parsed = SetRenewalDeciderProgressInputSchema.pick({
    run_id: true,
    source_trigger_key: true,
  }).parse({ run_id: runId, source_trigger_key: sourceTriggerKey });
  const snapshot = await progressRef(
    db,
    renewalDeciderProgressDocId(actor.uid, parsed.run_id, parsed.source_trigger_key),
  ).get();
  if (!snapshot.exists) return null;

  const data = snapshot.data()!;
  // Defense in depth for malformed/legacy data: never return a marker owned by another user.
  if (data.user_uid !== actor.uid) return null;
  return readRecord<RenewalDeciderProgressRecord>(snapshot.id, data);
}

/** List the signed-in user's value-free progress markers for one run. */
export async function listRenewalDeciderProgressForRun(
  actor: AuthenticatedUser,
  runId: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalDeciderProgressRecord[]> {
  assertCan(actor, "read");
  const { run_id } = RenewalDeciderProgressRunQuerySchema.parse({ run_id: runId });
  const snapshot = await db
    .collection(RENEWAL_DECIDER_PROGRESS_COLLECTIONS.progress)
    .where("run_id", "==", run_id)
    .get();

  return snapshot.docs
    .filter((doc) => doc.data().user_uid === actor.uid)
    .map((doc) => readRecord<RenewalDeciderProgressRecord>(doc.id, doc.data()))
    .sort(compareProgressRecords);
}

/** List the signed-in user's append-only marker Activity for one run. */
export async function listRenewalDeciderProgressActivityForRun(
  actor: AuthenticatedUser,
  runId: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalDeciderProgressActivityRecord[]> {
  assertCan(actor, "read");
  const { run_id } = RenewalDeciderProgressRunQuerySchema.parse({ run_id: runId });
  const snapshot = await db
    .collection(RENEWAL_DECIDER_PROGRESS_COLLECTIONS.activity)
    .where("run_id", "==", run_id)
    .get();

  return snapshot.docs
    .filter((doc) => doc.data().actor_uid === actor.uid)
    .map((doc) => readRecord<RenewalDeciderProgressActivityRecord>(doc.id, doc.data()))
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

/** Deterministic Firestore-safe id derived from `${uid}:${run_id}:${source_trigger_key}`. */
export function renewalDeciderProgressDocId(
  uid: string,
  runId: string,
  sourceTriggerKey: string,
): string {
  // Encode each tuple member independently so allowed `:` and `_` characters can never collapse to
  // the same id (for example a:b vs a_b). Base64url is Firestore-safe, reversible, and comfortably
  // below the document-id limit for the bounded run/trigger schemas.
  return [uid, runId, sourceTriggerKey]
    .map((part) => Buffer.from(part, "utf8").toString("base64url"))
    .join(".");
}

function progressRef(db: Firestore, docId: string) {
  return db.collection(RENEWAL_DECIDER_PROGRESS_COLLECTIONS.progress).doc(docId);
}

function activityRef(db: Firestore, docId: string) {
  return db.collection(RENEWAL_DECIDER_PROGRESS_COLLECTIONS.activity).doc(docId);
}

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for the requested renewal-decider action.",
      403,
    );
  }
}

function compareProgressRecords(
  left: RenewalDeciderProgressRecord,
  right: RenewalDeciderProgressRecord,
) {
  return (
    left.created_at.localeCompare(right.created_at) ||
    left.source_trigger_key.localeCompare(right.source_trigger_key)
  );
}

function readRecord<T>(id: string, data: Record<string, unknown>): T {
  return normalizeFirestoreValue({ ...data, id }) as T;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      return (toDate.call(value) as Date).toISOString();
    }
  }
  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeFirestoreValue(child)]),
    );
  }
  return value;
}

function stripUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
