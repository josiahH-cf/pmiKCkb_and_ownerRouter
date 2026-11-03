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
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { assertRenewalRoleAuthority } from "@/lib/lease-renewal/role-action-governance";
import {
  DOCUMENTED_NOTICE_TIMING_DECISION,
  SelectNoticeTimingBasisInputSchema,
  isDocumentedNoticeTimingBasis,
  type SelectNoticeTimingBasisInput,
} from "@/lib/lease-renewal/notice-timing-decision";
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
    /** Optional on legacy records; source decision and current selection intent are distinct. */
    decision_id: z.string().optional(),
    operation_id: z.string().uuid().optional(),
    decision_source: z.string().optional(),
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

function assertTimingBasisAdmin(actor: AuthenticatedUser, writing = false) {
  assertTimingBasisStaff(actor, writing);
  if (!can(actor.role, "manageAdmin")) {
    throw new EditableLayerError("Only Admins can record the notice timing basis.", 403);
  }
}

/** Recheck the same managed identity/Space/role boundary even for direct service callers. */
export function assertTimingBasisStaff(actor: AuthenticatedUser, writing: boolean) {
  if (
    actor.hd !== "pmikcmetro.com" ||
    !actor.email.toLowerCase().endsWith("@pmikcmetro.com") ||
    !hasSpaceAccess(actor, "renewals") ||
    !["Editor", "Approver", "Admin"].includes(actor.role)
  ) {
    throw new EditableLayerError("Managed renewal staff access is required.", 403);
  }
  if (writing) assertRenewalRoleAuthority("select_notice_timing_basis", actor.role);
  else assertRenewalRoleAuthority("read_workspace", actor.role);
  if (writing && isVerificationAccount(actor)) {
    throw new EditableLayerError("Verification accounts can only read.", 403);
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
  assertTimingBasisAdmin(actor, true);
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

const SelectionIntentSchema = z
  .object({
    operation_id: z.string().uuid(),
    decision_id: z.literal(DOCUMENTED_NOTICE_TIMING_DECISION.id),
    actor_uid: z.string().min(1),
    expected_version: z.number().int().nonnegative(),
    canonical_payload: z.string(),
    action: z.literal("notice_timing_basis_selected"),
    record: MoveOutTimingBasisRecordSchema,
  })
  .passthrough();

export type NoticeTimingSelectionIntentRead =
  | { state: "missing" | "unreadable" }
  | {
      state: "recorded";
      operationId: string;
      decisionId: string;
      expectedVersion: number;
      record: MoveOutTimingBasisRecord;
    };
export interface NoticeTimingBasisSelectionRead {
  timingBasis: MoveOutTimingBasisAdminRead;
  canSelect: boolean;
  intent: NoticeTimingSelectionIntentRead;
}

function selectionPayload(actorUid: string, input: SelectNoticeTimingBasisInput): string {
  return JSON.stringify([
    actorUid,
    input.decisionId,
    input.expectedVersion,
    DOCUMENTED_NOTICE_TIMING_DECISION.targetKind,
    DOCUMENTED_NOTICE_TIMING_DECISION.countingRule,
    DOCUMENTED_NOTICE_TIMING_DECISION.thresholdDays,
  ]);
}

function selectionRef(db: Firestore, operationId: string) {
  return db
    .collection(MOVE_OUT_TIMING_BASIS_ACTIVITY_COLLECTION)
    .doc(`selection-${operationId}`);
}

function parseSelectionIntent(value: unknown) {
  const intent = SelectionIntentSchema.parse(value);
  const record = intent.record;
  if (
    record.operation_id !== intent.operation_id ||
    record.decision_id !== intent.decision_id ||
    record.updated_by_uid !== intent.actor_uid ||
    record.version !== intent.expected_version + 1 ||
    !isDocumentedNoticeTimingBasis(record) ||
    record.reviewed_note !== DOCUMENTED_NOTICE_TIMING_DECISION.note ||
    record.decision_source !== DOCUMENTED_NOTICE_TIMING_DECISION.source ||
    intent.canonical_payload !==
      selectionPayload(intent.actor_uid, {
        operationId: intent.operation_id,
        decisionId: intent.decision_id,
        expectedVersion: intent.expected_version,
      })
  ) {
    throw new EditableLayerError(
      "The selection receipt cannot be verified. Keep the same operation for recovery.",
      409,
    );
  }
  return intent;
}

/** Pure reads, including only the requesting actor's exact operation receipt. No matching-state inference. */
export async function readMoveOutTimingBasisSelection(
  actor: AuthenticatedUser,
  operationId?: string,
  db: Firestore = getAdminFirestore(),
): Promise<NoticeTimingBasisSelectionRead> {
  assertTimingBasisStaff(actor, false);
  const parsedId =
    operationId === undefined ? undefined : z.string().uuid().parse(operationId);
  const [timingBasis, intent]: [
    MoveOutTimingBasisAdminRead,
    NoticeTimingSelectionIntentRead,
  ] = await Promise.all([
    readRecord(db),
    (async (): Promise<NoticeTimingSelectionIntentRead> => {
      if (!parsedId) return { state: "missing" };
      try {
        const snapshot = await selectionRef(db, parsedId).get();
        if (!snapshot.exists || snapshot.data()?.actor_uid !== actor.uid)
          return { state: "missing" };
        const saved = parseSelectionIntent(snapshot.data());
        if (saved.operation_id !== parsedId) return { state: "unreadable" };
        return {
          state: "recorded",
          operationId: saved.operation_id,
          decisionId: saved.decision_id,
          expectedVersion: saved.expected_version,
          record: saved.record,
        };
      } catch {
        return { state: "unreadable" };
      }
    })(),
  ]);
  return {
    timingBasis,
    canSelect: !isVerificationAccount(actor) && can(actor.role, "edit"),
    intent,
  };
}

/** One explicit staff selection, with transactionally bound intent and immutable historical result. */
export async function selectMoveOutTimingBasis(
  actor: AuthenticatedUser,
  input: unknown,
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<{ record: MoveOutTimingBasisRecord; duplicate: boolean }> {
  assertTimingBasisStaff(actor, true);
  const parsed = SelectNoticeTimingBasisInputSchema.parse(input);
  const payload = selectionPayload(actor.uid, parsed);
  const ref = db
    .collection(MOVE_OUT_TIMING_BASIS_COLLECTION)
    .doc(MOVE_OUT_TIMING_BASIS_DOC_ID);
  const intentRef = selectionRef(db, parsed.operationId);
  return db.runTransaction(async (transaction) => {
    const prior = await transaction.get(intentRef);
    if (prior.exists) {
      const intent = parseSelectionIntent(prior.data());
      if (intent.actor_uid !== actor.uid || intent.canonical_payload !== payload) {
        throw new EditableLayerError(
          "This operation belongs to a different selection. Reload without overwriting it.",
          409,
        );
      }
      return { record: intent.record, duplicate: true };
    }
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists
      ? MoveOutTimingBasisRecordSchema.safeParse({ ...snapshot.data(), id: snapshot.id })
      : null;
    if (current && !current.success) {
      throw new EditableLayerError(
        "The saved notice basis is invalid. It must be investigated before a selection can replace it.",
        409,
      );
    }
    const existing = current?.success ? current.data : null;
    if ((existing?.version ?? 0) !== parsed.expectedVersion) {
      throw new EditableLayerError(
        "The shared notice timing basis changed. Reload to review its current version before selecting again.",
        409,
      );
    }
    if (isDocumentedNoticeTimingBasis(existing)) {
      throw new EditableLayerError(
        "The documented basis is already current; no new selection was recorded.",
        409,
      );
    }
    const decision = DOCUMENTED_NOTICE_TIMING_DECISION;
    const record = MoveOutTimingBasisRecordSchema.parse({
      id: MOVE_OUT_TIMING_BASIS_DOC_ID,
      target_kind: decision.targetKind,
      counting_rule: decision.countingRule,
      threshold_days: decision.thresholdDays,
      reviewed_note: decision.note,
      decision_id: decision.id,
      decision_source: decision.source,
      operation_id: parsed.operationId,
      version: (existing?.version ?? 0) + 1,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      updated_by_uid: actor.uid,
    });
    transaction.set(ref, record);
    transaction.create(intentRef, {
      basis_id: MOVE_OUT_TIMING_BASIS_DOC_ID,
      version: record.version,
      target_kind: record.target_kind,
      counting_rule: record.counting_rule,
      threshold_days: record.threshold_days,
      reviewed_note: record.reviewed_note,
      actor_uid: actor.uid,
      action: "notice_timing_basis_selected",
      created_at: now,
      operation_id: parsed.operationId,
      decision_id: decision.id,
      expected_version: parsed.expectedVersion,
      canonical_payload: payload,
      record,
    });
    return { record, duplicate: false };
  });
}
