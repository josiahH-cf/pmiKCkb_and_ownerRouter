// S66 (AC-S66-6): Admin-owned family use for the lease-document packet.
//
// One versioned record (`lease_artifact_family_use/current`) says which families are required, decided
// by their rules, or not used. Setting a use is idempotent by operation id, refuses a stale version,
// and rewrites an existing approved catalog in the same transaction so packet evaluation, claims and
// bindings read one consistent configuration. A use grants no legal approval, opens no action key and
// changes no executed attempt or receipt. Server-only through the Admin SDK; the rules' default deny
// covers these collections.

import type { Firestore } from "firebase-admin/firestore";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  ARTIFACT_CATALOG_COLLECTION,
  ARTIFACT_CATALOG_DOC_ID,
  ARTIFACT_INTAKE_ACTIVITY_COLLECTION,
  FAMILY_USE_COLLECTION,
  FAMILY_USE_DOC_ID,
  readFamilyUseIn,
  readManifestInTransaction,
  writeCatalog,
} from "@/lib/firestore/lease-artifact-intake";
import {
  FamilyUseRecordSchema,
  nextFamilyUseRecord,
  SetFamilyUseInputSchema,
  type FamilyUseRecord,
} from "@/lib/lease-documents/family-use";

/** The current record, or null when none exists; an unreadable record says so instead of throwing. */
export async function readFamilyUseRecord(
  db: Firestore = getAdminFirestore(),
): Promise<{ readable: boolean; record: FamilyUseRecord | null }> {
  try {
    const snapshot = await db
      .collection(FAMILY_USE_COLLECTION)
      .doc(FAMILY_USE_DOC_ID)
      .get();
    if (!snapshot.exists) return { readable: true, record: null };
    const parsed = FamilyUseRecordSchema.safeParse(snapshot.data());
    return parsed.success
      ? { readable: true, record: parsed.data }
      : { readable: false, record: null };
  } catch {
    return { readable: false, record: null };
  }
}

export async function setFamilyUse(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<{ record: FamilyUseRecord; duplicate: boolean }> {
  if (!can(actor.role, "manageAdmin"))
    throw new EditableLayerError("An Admin sets how each form family is used.", 403);
  const input = SetFamilyUseInputSchema.parse(raw);
  const audit = db.collection(ARTIFACT_INTAKE_ACTIVITY_COLLECTION).doc(input.operationId);
  const requestHash = hashExecutionPreview({
    actorUid: actor.uid,
    action: "family_use_set",
    kind: input.kind,
    use: input.use,
    expectedVersion: input.expectedVersion,
  });
  return db.runTransaction(async (transaction) => {
    const catalogRef = db
      .collection(ARTIFACT_CATALOG_COLLECTION)
      .doc(ARTIFACT_CATALOG_DOC_ID);
    const [current, previous, catalog, { manifest }] = await Promise.all([
      readFamilyUseIn(transaction, db),
      transaction.get(audit),
      transaction.get(catalogRef),
      readManifestInTransaction(transaction, db),
    ]);
    if (previous.exists) {
      if (previous.data()?.request_hash !== requestHash)
        throw new EditableLayerError(
          "This change differs from the one first sent. Reload and set the use again.",
          409,
        );
      if (!current)
        throw new EditableLayerError("The family-use record is missing.", 409);
      return { record: current, duplicate: true };
    }
    if ((current?.version ?? 0) !== input.expectedVersion)
      throw new EditableLayerError(
        "The form-family uses changed since the page was loaded. Reload before changing them.",
        409,
      );
    const record = FamilyUseRecordSchema.parse(
      nextFamilyUseRecord(current, input, actor.uid, now),
    );
    transaction.set(db.collection(FAMILY_USE_COLLECTION).doc(FAMILY_USE_DOC_ID), record);
    // An existing approved catalog carries the new use; without one, packet reads apply it directly.
    if (catalog.exists)
      writeCatalog(
        transaction,
        db,
        manifest,
        { approvedByUid: actor.uid, approvedAt: now },
        record,
      );
    transaction.create(audit, {
      action: "family_use_set",
      actor_uid: actor.uid,
      created_at: now,
      kind: input.kind,
      use: input.use,
      request_hash: requestHash,
      version: record.version,
    });
    return { record, duplicate: false };
  });
}
