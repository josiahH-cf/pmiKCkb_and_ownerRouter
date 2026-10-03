// S156/S160: the current effective renewal terms of one lease, read from the lease-bound working
// record and the work record. Server-only. An exact source action is bound to the terms it was
// prepared from; this reader lets its route, service and one-attempt claim confirm those terms
// are still the ones staff are working with. It never writes.

import type { Firestore, Transaction } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  parseRenewalWorkingRecord,
  renewalWorkingRecordRef,
} from "@/lib/firestore/renewal-working-record";
import {
  currentRenewalWorkspaceState,
  renewalWorkspaceHeadRefs,
} from "@/lib/firestore/renewal-workspace";
import {
  effectiveRenewalTerms,
  type EffectiveRenewalTerms,
} from "@/lib/lease-renewal/effective-terms";

export async function readEffectiveRenewalTerms(
  leaseId: string,
  db: Firestore = getAdminFirestore(),
  transaction?: Transaction,
): Promise<EffectiveRenewalTerms> {
  const working = renewalWorkingRecordRef(db, leaseId);
  const heads = renewalWorkspaceHeadRefs(db, leaseId);
  const read = (ref: FirebaseFirestore.DocumentReference) =>
    transaction ? transaction.get(ref) : ref.get();
  const [workingSnapshot, dated, leaseBound] = await Promise.all([
    read(working),
    read(heads.dated),
    read(heads.leaseBound),
  ]);
  return effectiveRenewalTerms(
    workingSnapshot.exists
      ? parseRenewalWorkingRecord(workingSnapshot.data(), leaseId)
      : null,
    currentRenewalWorkspaceState(db, leaseId, dated, leaseBound),
  );
}
