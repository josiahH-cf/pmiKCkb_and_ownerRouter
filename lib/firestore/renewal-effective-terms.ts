// S156/S160: the current effective renewal terms of one lease, read from the lease-bound working
// record. Server-only. An exact source action is bound to the terms it was prepared from; this
// reader lets its route, service and one-attempt claim confirm those terms are still the ones
// staff are working with. It never writes. S234 R-S234-2: terms recorded on an earlier owner
// response are history, so the work record is not read for terms. S262 R-S262-5: the terms are
// those current for the lease's active cycle, read with the work record in the same transaction.

import type { Firestore, Transaction } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firestore/admin";
import { readCurrentCycleWorkingRecord } from "@/lib/firestore/renewal-working-record";
import {
  effectiveRenewalTerms,
  type EffectiveRenewalTerms,
} from "@/lib/lease-renewal/effective-terms";

export async function readEffectiveRenewalTerms(
  leaseId: string,
  db: Firestore = getAdminFirestore(),
  transaction?: Transaction,
): Promise<EffectiveRenewalTerms> {
  return effectiveRenewalTerms(
    await readCurrentCycleWorkingRecord(db, leaseId, transaction),
  );
}
