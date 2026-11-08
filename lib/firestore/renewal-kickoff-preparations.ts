// S249 ARCH-S249-3: the per lease and cycle claim behind batch preparation. A claim is taken in a
// transaction before a billed comparison lookup starts, so at most one billed lookup happens for a
// lease and its renewal cycle without a staff member asking again (the lease's own comparison
// control is that ask). A claim whose lookup made no billed call (the allowance was reached before
// it ran) is released, so the lease can be prepared once the allowance opens again.
//
// App-owned metadata only: lease id, cycle date, state, who and when. No provider value, rent or
// customer value is stored here; the lookup result lives in the existing observation store.

import type { Firestore } from "firebase-admin/firestore";

import { assertRenewalDispositionVersion } from "./renewal-cycle-disposition-read";
import { getAdminFirestore } from "@/lib/firestore/admin";
import type { KickoffPreparationOutcome } from "@/lib/lease-renewal/kickoff-facts";

export const KICKOFF_PREPARATIONS_COLLECTION = "renewal_kickoff_preparations";

export type KickoffTrigger = "staff" | "automatic";
export type KickoffPreparationState = KickoffPreparationOutcome["state"];

export interface KickoffPreparationRecord {
  readonly leaseId: string;
  readonly cycleKey: string;
  readonly state: KickoffPreparationState;
  readonly trigger: KickoffTrigger;
  readonly actorUid: string;
  readonly operationId: string;
  readonly claimedAt: string;
  readonly settledAt: string | null;
  readonly observationId: string | null;
  /** True when the lookup was billed by the provider; null while unknown. */
  readonly billed: boolean | null;
  readonly reason: string | null;
}

const LEASE_ID = /^[1-9]\d*$/;
const CYCLE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function kickoffPreparationDocId(leaseId: string, cycleKey: string): string {
  if (!LEASE_ID.test(leaseId) || !CYCLE_KEY.test(cycleKey))
    throw new Error("A kickoff preparation names one lease and its cycle date.");
  return `${leaseId}_${cycleKey}`;
}

function recordOf(data: Record<string, unknown>): KickoffPreparationRecord {
  return {
    leaseId: String(data.lease_id),
    cycleKey: String(data.cycle_key),
    state: data.state as KickoffPreparationState,
    trigger: data.trigger === "automatic" ? "automatic" : "staff",
    actorUid: String(data.actor_uid ?? ""),
    operationId: String(data.operation_id ?? ""),
    claimedAt: String(data.claimed_at ?? ""),
    settledAt: typeof data.settled_at === "string" ? data.settled_at : null,
    observationId: typeof data.observation_id === "string" ? data.observation_id : null,
    billed: typeof data.billed === "boolean" ? data.billed : null,
    reason: typeof data.reason === "string" ? data.reason : null,
  };
}

export async function getKickoffPreparation(
  leaseId: string,
  cycleKey: string,
  db: Firestore = getAdminFirestore(),
): Promise<KickoffPreparationRecord | null> {
  const snap = await db
    .collection(KICKOFF_PREPARATIONS_COLLECTION)
    .doc(kickoffPreparationDocId(leaseId, cycleKey))
    .get();
  return snap.exists ? recordOf(snap.data()!) : null;
}

/**
 * Take the claim for one lease and cycle. Returns the existing record instead when one is held:
 * the same operation id reads as its own claim (a retried request), any other as already claimed.
 */
export async function claimKickoffPreparation(
  input: {
    readonly leaseId: string;
    readonly cycleKey: string;
    readonly trigger: KickoffTrigger;
    readonly actorUid: string;
    readonly operationId: string;
    readonly nowIso?: string;
    readonly dispositionRevision?: number;
  },
  db: Firestore = getAdminFirestore(),
): Promise<
  | { readonly claimed: true; readonly record: KickoffPreparationRecord }
  | {
      readonly claimed: false;
      readonly record: KickoffPreparationRecord;
      readonly sameOperation: boolean;
    }
> {
  const ref = db
    .collection(KICKOFF_PREPARATIONS_COLLECTION)
    .doc(kickoffPreparationDocId(input.leaseId, input.cycleKey));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const record = recordOf(snap.data()!);
      return {
        claimed: false as const,
        record,
        sameOperation: record.operationId === input.operationId,
      };
    }
    await assertRenewalDispositionVersion(
      tx,
      db,
      input.leaseId,
      input.dispositionRevision ?? 0,
    );
    const data = {
      lease_id: input.leaseId,
      cycle_key: input.cycleKey,
      state: "claimed",
      trigger: input.trigger,
      actor_uid: input.actorUid,
      operation_id: input.operationId,
      claimed_at: input.nowIso ?? new Date().toISOString(),
      settled_at: null,
      observation_id: null,
      billed: null,
      reason: null,
    };
    tx.create(ref, data);
    return { claimed: true as const, record: recordOf(data) };
  });
}

export async function settleKickoffPreparation(
  input: {
    readonly leaseId: string;
    readonly cycleKey: string;
    readonly operationId: string;
    readonly state: Exclude<KickoffPreparationState, "claimed">;
    readonly observationId?: string | null;
    readonly billed: boolean | null;
    readonly reason?: string | null;
    readonly nowIso?: string;
  },
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  const ref = db
    .collection(KICKOFF_PREPARATIONS_COLLECTION)
    .doc(kickoffPreparationDocId(input.leaseId, input.cycleKey));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("operation_id") !== input.operationId) return;
    tx.update(ref, {
      state: input.state,
      settled_at: input.nowIso ?? new Date().toISOString(),
      observation_id: input.observationId ?? null,
      billed: input.billed,
      reason: input.reason ?? null,
    });
  });
}

/** Release a claim whose lookup made no billed call, so the lease can be prepared later. */
export async function releaseKickoffPreparation(
  input: {
    readonly leaseId: string;
    readonly cycleKey: string;
    readonly operationId: string;
  },
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  const ref = db
    .collection(KICKOFF_PREPARATIONS_COLLECTION)
    .doc(kickoffPreparationDocId(input.leaseId, input.cycleKey));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("operation_id") !== input.operationId) return;
    if (snap.get("billed") === true) return;
    tx.delete(ref);
  });
}

/** The newest preparation outcome per lease, for the desk's projection. */
export async function listKickoffPreparations(
  leaseIds: readonly string[],
  db: Firestore = getAdminFirestore(),
): Promise<Map<string, KickoffPreparationOutcome>> {
  const byLease = new Map<string, KickoffPreparationOutcome & { at: string }>();
  const ids = [...new Set(leaseIds.filter((id) => LEASE_ID.test(id)))];
  for (let index = 0; index < ids.length; index += 30) {
    const rows = await db
      .collection(KICKOFF_PREPARATIONS_COLLECTION)
      .where("lease_id", "in", ids.slice(index, index + 30))
      .get();
    for (const row of rows.docs) {
      const record = recordOf(row.data());
      const prior = byLease.get(record.leaseId);
      if (prior && prior.at >= record.claimedAt) continue;
      byLease.set(record.leaseId, {
        cycleKey: record.cycleKey,
        state: record.state,
        reason: record.reason,
        at: record.claimedAt,
      });
    }
  }
  return new Map(
    [...byLease].map(([leaseId, entry]) => [
      leaseId,
      { cycleKey: entry.cycleKey, state: entry.state, reason: entry.reason },
    ]),
  );
}
