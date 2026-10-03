// S158/S160: the lease-bound working record as the operating-Sheet lane reads it. Server-only.
// The Sheet resolver needs the operator's lookup selection and the current-rent update needs the
// working current rent; both come from the one working-record head and nothing else. A route or
// claim that already authorized the actor reads here without a second role check. Never writes.

import type { Firestore, Transaction } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  parseRenewalWorkingRecord,
  renewalWorkingRecordRef,
} from "@/lib/firestore/renewal-working-record";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";

export async function readSheetWorkingRecord(
  leaseId: string,
  db: Firestore = getAdminFirestore(),
  transaction?: Transaction,
): Promise<RenewalWorkingRecord | null> {
  const ref = renewalWorkingRecordRef(db, leaseId);
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  return snapshot.exists ? parseRenewalWorkingRecord(snapshot.data(), leaseId) : null;
}
