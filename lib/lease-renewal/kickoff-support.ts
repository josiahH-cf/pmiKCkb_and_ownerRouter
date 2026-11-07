import { readSenderSignatureChoice } from "@/lib/firestore/renewal-sender-signature-choice";
// S249 ARCH-S249-1: the one bulk read the preparation projection needs beyond the desk's own
// sources: the stored comps lookups of the loaded leases, whether the signed-in sender has a
// signature, whether the owner template is approved, this month's comparison allowance and the
// batch preparation outcomes. Every read is a read; a failed read is null ("not read"), never an
// empty answer, so nothing reads as missing because a store was unavailable.

import type { Firestore } from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { getSuppliedRenewalPublication } from "@/lib/firestore/renewal-message-publication";
import { getRetainedSenderSignature } from "@/lib/firestore/renewal-sender-signatures";
import { RENEWAL_WORKSPACE_COLLECTIONS } from "@/lib/firestore/renewal-workspace";
import {
  createRentcastUsageStore,
  rentcastMonthKey,
  rentcastUsedCalls,
} from "@/lib/firestore/rentcast-usage";
import { listKickoffPreparations } from "@/lib/firestore/renewal-kickoff-preparations";
import type {
  KickoffObservationRow,
  KickoffSupportRead,
} from "@/lib/lease-renewal/kickoff-facts";
import type { CapturedCompResult } from "@/lib/lease-renewal/market-observation";
import {
  evaluateRentcastQuota,
  resolveRentcastAllowance,
} from "@/lib/lease-renewal/rentcast-quota";

const IN_CHUNK = 30;

/** The stored comps lookups for these leases, grouped by lease, in one or a few queries. */
export async function listCompObservationsForLeases(
  leaseIds: readonly string[],
  db: Firestore = getAdminFirestore(),
): Promise<Map<string, KickoffObservationRow[]>> {
  const byLease = new Map<string, KickoffObservationRow[]>();
  const ids = [...new Set(leaseIds.filter((id) => /^[1-9]\d*$/.test(id)))];
  for (let index = 0; index < ids.length; index += IN_CHUNK) {
    const chunk = ids.slice(index, index + IN_CHUNK);
    const rows = await db
      .collection(RENEWAL_WORKSPACE_COLLECTIONS.observations)
      .where("lease_id", "in", chunk)
      .get();
    for (const row of rows.docs) {
      if (row.get("operation") !== "comps") continue;
      const leaseId = String(row.get("lease_id"));
      const list = byLease.get(leaseId) ?? [];
      list.push({
        id: row.id,
        leaseId,
        cycleId: String(row.get("cycle_id")),
        recordedAt: String(row.get("recorded_at")),
        result: row.get("result") as CapturedCompResult,
      });
      byLease.set(leaseId, list);
    }
  }
  return byLease;
}

/** The signed-in sender has a business profile or a retained sender signature. */
export async function readSenderSignatureReady(actor: AuthenticatedUser, db: Firestore) {
  const [choice, retained] = await Promise.all([
    readSenderSignatureChoice(actor, db),
    getRetainedSenderSignature(actor, db),
  ]);
  return Boolean(choice || retained);
}

export async function readKickoffSupport(
  actor: AuthenticatedUser,
  leaseIds: readonly string[],
  options: { readonly db?: Firestore; readonly nowMs?: number } = {},
): Promise<KickoffSupportRead> {
  const db = options.db ?? getAdminFirestore();
  const nowMs = options.nowMs ?? Date.now();
  const [observations, signature, publication, usage, preparations] = await Promise.all([
    listCompObservationsForLeases(leaseIds, db).catch(() => null),
    readSenderSignatureReady(actor, db).catch(() => null),
    getSuppliedRenewalPublication(actor, "owner", db).catch(() => null),
    createRentcastUsageStore(actor, db)
      .readMonth(rentcastMonthKey(nowMs))
      .catch(() => null),
    listKickoffPreparations(leaseIds, db).catch(() => null),
  ]);
  return {
    observationsByLease: observations,
    signature,
    templateApproved: publication ? publication.status === "approved" : null,
    allowanceReached: usage
      ? evaluateRentcastQuota(rentcastUsedCalls(usage), resolveRentcastAllowance())
          .exhausted
      : null,
    preparationsByLease: preparations,
  };
}
