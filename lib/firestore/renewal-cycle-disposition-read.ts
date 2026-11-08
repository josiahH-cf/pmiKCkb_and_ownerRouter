import type { DocumentSnapshot, Firestore, Transaction } from "firebase-admin/firestore";
import {
  CycleDispositionRecordSchema,
  type CycleDispositionRecord,
} from "@/lib/lease-renewal/cycle-disposition";
import { getAdminFirestore } from "./admin";
import { EditableLayerError } from "./errors";

export const RENEWAL_CYCLE_DISPOSITIONS = "renewal_cycle_dispositions";

export function dispositionRef(db: Firestore, leaseId: string) {
  if (!/^[1-9]\d*$/.test(leaseId))
    throw new EditableLayerError("The renewal lease identity is invalid.", 409);
  return db.collection(RENEWAL_CYCLE_DISPOSITIONS).doc(leaseId);
}

export function readDispositionRecord(
  doc: DocumentSnapshot,
  leaseId?: string,
): CycleDispositionRecord | null {
  if (!doc.exists) return null;
  const record = CycleDispositionRecordSchema.parse(doc.data());
  if (doc.id !== record.leaseId || (leaseId && record.leaseId !== leaseId))
    throw new EditableLayerError(
      "The saved retirement identity does not match this lease.",
      409,
    );
  return record;
}

export async function getRenewalCycleDisposition(
  leaseId: string,
  db: Firestore = getAdminFirestore(),
) {
  return readDispositionRecord(await dispositionRef(db, leaseId).get(), leaseId);
}

export async function listRenewalCycleDispositions(db: Firestore = getAdminFirestore()) {
  const docs = await db.collection(RENEWAL_CYCLE_DISPOSITIONS).get();
  return new Map(
    docs.docs.map((doc) => {
      const record = readDispositionRecord(doc)!;
      return [record.leaseId, record] as const;
    }),
  );
}

/** Outgoing admission already checked the cycle using the current source. In the existing
 * dispatch transaction, read the same head that retirement would write. Any intervening
 * retire or restore makes the preview stale, even when the final state is active again. */
export async function assertRenewalDispositionVersion(
  tx: Transaction,
  db: Firestore,
  leaseId: string,
  expectedRevision: number,
) {
  const current = readDispositionRecord(
    await tx.get(dispositionRef(db, leaseId)),
    leaseId,
  );
  if ((current?.revision ?? 0) !== expectedRevision)
    throw new EditableLayerError(
      "This cycle's retirement status changed. Read the current lease and review again.",
      409,
    );
}
