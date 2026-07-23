// KB-owned persistence for the S32 corrections learning loop. Filing a correction on an Ask answer
// appends ONE append-only `ask_corrections` record with `status:"Proposed"`. It changes nothing else:
// no re-run, no answer/citation/KB/source-meta/model mutation. An Admin later reviews Proposed records
// and, on approval, a deterministic pipeline proposes a Draft KB entry (createPlaceholder) plus review-
// lane eval/re-rank proposals. Nothing self-modifies; no model is trained.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { AskCorrectionRecord, AskCorrectionStatus } from "@/lib/firestore/types";
import type { CorrectionRequest } from "@/lib/schemas";

export const ASK_CORRECTIONS_COLLECTION = "ask_corrections";

/** File a correction as a Proposed review record. Requires `edit`. Never re-runs or mutates the answer. */
export async function writeAskCorrection(
  actor: AuthenticatedUser,
  input: CorrectionRequest,
  db: Firestore = getAdminFirestore(),
): Promise<AskCorrectionRecord> {
  assertCan(actor, "edit");
  const id = uuidv7();
  const ref = db.collection(ASK_CORRECTIONS_COLLECTION).doc(id);
  await ref.set(
    stripUndefined({
      id,
      ask_log_id: input.ask_log_id,
      space_id: input.space_id,
      question: input.question,
      kind: input.kind,
      note: input.note,
      source_state: input.source_state,
      citations: input.citations ?? [],
      status: "Proposed",
      user_uid: actor.uid,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }),
  );
  const readback = await getAskCorrection(actor, id, db);
  if (!readback) {
    throw new EditableLayerError("Correction could not be read back after write.", 404);
  }
  return readback;
}

export async function getAskCorrection(
  actor: AuthenticatedUser,
  id: string,
  db: Firestore = getAdminFirestore(),
): Promise<AskCorrectionRecord | null> {
  assertCan(actor, "read");
  const snapshot = await db.collection(ASK_CORRECTIONS_COLLECTION).doc(id).get();
  if (!snapshot.exists) return null;
  return readRecord(snapshot.id, snapshot.data()!);
}

/** List corrections, optionally filtered by status (Admin review lane uses `Proposed`). Read-gated. */
export async function listAskCorrections(
  actor: AuthenticatedUser,
  options: { status?: AskCorrectionStatus } = {},
  db: Firestore = getAdminFirestore(),
): Promise<AskCorrectionRecord[]> {
  assertCan(actor, "read");
  const base = db.collection(ASK_CORRECTIONS_COLLECTION);
  const query = options.status ? base.where("status", "==", options.status) : base;
  const snapshot = await query.get();
  return snapshot.docs
    .map((doc) => readRecord(doc.id, doc.data()))
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

/**
 * Mark a Proposed correction Approved or Dismissed (Admin-only). This records ONLY the human decision;
 * the caller (the review lane) files any Draft KB proposal through the separate editable-layer path.
 */
export async function setAskCorrectionStatus(
  actor: AuthenticatedUser,
  id: string,
  status: Extract<AskCorrectionStatus, "Approved" | "Dismissed">,
  db: Firestore = getAdminFirestore(),
): Promise<AskCorrectionRecord> {
  assertCan(actor, "manageAdmin");
  const ref = db.collection(ASK_CORRECTIONS_COLLECTION).doc(id);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      throw new EditableLayerError("This correction does not exist.", 404);
    }
    const current = snapshot.data() as AskCorrectionRecord;
    if (current.status !== "Proposed") {
      throw new EditableLayerError(
        `This correction is "${current.status}"; only a Proposed correction can be decided.`,
        409,
      );
    }
    // Partial update (never a full set) so the correction's other fields are preserved.
    transaction.update(ref, {
      status,
      decided_by_uid: actor.uid,
      updated_at: FieldValue.serverTimestamp(),
    });
  });
  const readback = await getAskCorrection(actor, id, db);
  if (!readback) {
    throw new EditableLayerError(
      "Correction could not be read back after decision.",
      404,
    );
  }
  return readback;
}

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for the requested correction action.",
      403,
    );
  }
}

function readRecord(id: string, data: Record<string, unknown>): AskCorrectionRecord {
  return normalizeFirestoreValue({ ...data, id }) as AskCorrectionRecord;
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
