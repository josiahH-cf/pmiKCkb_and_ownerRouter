// S125 (F04): app-owned storage for the reviewed thirty-day notice timing basis. One document
// carries which target date the notice is compared against, the explicit counting rule and the
// threshold, plus who recorded it and when. This is NOT a system of record and NOT a legal rule:
// it is the app's own reviewed configuration, the same pattern as the renewal notice rules
// (`lease-renewal-notice-rules.ts`), and the existing renewal notice policy is never merged into it.
//
// GOVERNANCE: server-written through the Admin SDK boundary only; the `firestore.rules` default
// deny covers this collection, so no browser role can read or write it directly. Reads never throw:
// a missing, malformed or unreadable document reads as an explicit unreviewed basis, under which the
// evaluator yields Cannot determine rather than a guessed yes or no. Nothing here sends, drafts,
// calculates money or touches a provider record.

import { z } from "zod";
import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  MOVE_OUT_TIMING_COUNTING_RULES,
  MOVE_OUT_TIMING_TARGET_KINDS,
  type MoveOutTimingBasisSnapshot,
} from "@/lib/lease-renewal/move-out-timing";

export const MOVE_OUT_TIMING_BASIS_COLLECTION = "lease_renewal_move_out_timing_basis";
export const MOVE_OUT_TIMING_BASIS_ACTIVITY_COLLECTION =
  "lease_renewal_move_out_timing_basis_activity";
export const MOVE_OUT_TIMING_BASIS_DOC_ID = "active";

export const MoveOutTimingBasisRecordSchema = z
  .object({
    id: z.string().min(1),
    target_kind: z.enum(MOVE_OUT_TIMING_TARGET_KINDS),
    counting_rule: z.enum(MOVE_OUT_TIMING_COUNTING_RULES),
    threshold_days: z.number().int().min(1).max(365),
    /** Who confirmed the basis and where (a meeting, a message); never a customer value. */
    reviewed_note: z.string().min(1).max(500),
    version: z.number().int().positive(),
    created_at: z.string(),
    updated_at: z.string(),
    updated_by_uid: z.string().min(1),
  })
  .strict();
export type MoveOutTimingBasisRecord = z.infer<typeof MoveOutTimingBasisRecordSchema>;

/** The Admin surface sends the whole reviewed basis plus the version it loaded. */
export const UpdateMoveOutTimingBasisInputSchema = z
  .object({
    targetKind: z.enum(MOVE_OUT_TIMING_TARGET_KINDS),
    countingRule: z.enum(MOVE_OUT_TIMING_COUNTING_RULES),
    thresholdDays: z.number().int().min(1).max(365),
    reviewedNote: z.string().trim().min(1).max(500),
    /** The saved version the Admin loaded; 0 when nothing was saved yet. */
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export type UpdateMoveOutTimingBasisInput = z.infer<
  typeof UpdateMoveOutTimingBasisInputSchema
>;

/** What the Admin surface renders: the saved record, or the exact reason there is none. */
export type MoveOutTimingBasisAdminRead =
  | { readonly state: "saved"; readonly record: MoveOutTimingBasisRecord }
  | { readonly state: "missing" | "invalid" | "unreadable"; readonly record: null };

function toSnapshot(record: MoveOutTimingBasisRecord): MoveOutTimingBasisSnapshot {
  return {
    state: "saved",
    basis: {
      targetKind: record.target_kind,
      countingRule: record.counting_rule,
      thresholdDays: record.threshold_days,
    },
    version: record.version,
    updatedAtIso: record.updated_at,
  };
}

function fallback(
  state: "missing" | "invalid" | "unreadable",
): MoveOutTimingBasisSnapshot {
  return { state, basis: null, version: null, updatedAtIso: null };
}

async function readRecord(db: Firestore): Promise<MoveOutTimingBasisAdminRead> {
  try {
    const snapshot = await db
      .collection(MOVE_OUT_TIMING_BASIS_COLLECTION)
      .doc(MOVE_OUT_TIMING_BASIS_DOC_ID)
      .get();
    if (!snapshot.exists) return { state: "missing", record: null };
    const parsed = MoveOutTimingBasisRecordSchema.safeParse({
      ...snapshot.data(),
      id: snapshot.id,
    });
    if (!parsed.success) return { state: "invalid", record: null };
    return { state: "saved", record: parsed.data };
  } catch {
    return { state: "unreadable", record: null };
  }
}

/**
 * The immutable basis snapshot every desk and workspace read consumes. It never throws and keeps
 * whether the unreviewed state came from a missing, malformed or unreadable record.
 */
export async function readMoveOutTimingBasisSnapshot(
  db?: Firestore,
): Promise<MoveOutTimingBasisSnapshot> {
  let firestore: Firestore;
  try {
    firestore = db ?? getAdminFirestore();
  } catch {
    return fallback("unreadable");
  }
  const read = await readRecord(firestore);
  return read.state === "saved" ? toSnapshot(read.record) : fallback(read.state);
}

function assertTimingBasisAdmin(actor: AuthenticatedUser) {
  if (!can(actor.role, "manageAdmin")) {
    throw new EditableLayerError("Only Admins can record the notice timing basis.", 403);
  }
}

/** Full record for the Admin surface, or the exact reason none is saved. Admin-only. */
export async function readMoveOutTimingBasisRecord(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<MoveOutTimingBasisAdminRead> {
  assertTimingBasisAdmin(actor);
  return readRecord(db);
}

/**
 * Admin-only replacement of the reviewed basis with a revision check: the Admin's loaded version
 * must still be the saved one, so two Admins cannot silently overwrite each other and a lost save
 * response is reconciled by reloading before resubmitting. Every version is appended to an activity
 * log, so an earlier result that names its basis version can be traced without rewriting history.
 */
export async function updateMoveOutTimingBasis(
  actor: AuthenticatedUser,
  input: UpdateMoveOutTimingBasisInput,
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<MoveOutTimingBasisRecord> {
  assertTimingBasisAdmin(actor);
  const parsed = UpdateMoveOutTimingBasisInputSchema.parse(input);
  const ref = db
    .collection(MOVE_OUT_TIMING_BASIS_COLLECTION)
    .doc(MOVE_OUT_TIMING_BASIS_DOC_ID);

  const saved = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists ? snapshot.data() : undefined;
    const currentVersion =
      typeof existing?.version === "number" && Number.isInteger(existing.version)
        ? existing.version
        : 0;
    if (currentVersion !== parsed.expectedVersion) {
      throw new EditableLayerError(
        "The notice timing basis changed since this page was loaded. Reload to see the saved basis before recording again.",
        409,
      );
    }
    const record: MoveOutTimingBasisRecord = {
      id: MOVE_OUT_TIMING_BASIS_DOC_ID,
      target_kind: parsed.targetKind,
      counting_rule: parsed.countingRule,
      threshold_days: parsed.thresholdDays,
      reviewed_note: parsed.reviewedNote,
      version: currentVersion + 1,
      created_at: typeof existing?.created_at === "string" ? existing.created_at : now,
      updated_at: now,
      updated_by_uid: actor.uid,
    };
    transaction.set(ref, record);
    transaction.create(
      db.collection(MOVE_OUT_TIMING_BASIS_ACTIVITY_COLLECTION).doc(uuidv7()),
      {
        basis_id: MOVE_OUT_TIMING_BASIS_DOC_ID,
        version: record.version,
        target_kind: record.target_kind,
        counting_rule: record.counting_rule,
        threshold_days: record.threshold_days,
        reviewed_note: record.reviewed_note,
        actor_uid: actor.uid,
        action: "move_out_timing_basis_recorded",
        created_at: now,
      },
    );
    return record;
  });

  return MoveOutTimingBasisRecordSchema.parse(saved);
}
