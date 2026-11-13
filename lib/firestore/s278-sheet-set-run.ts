// S278 R-S278-4 (AC-S278-4 "Confirm twice quickly: one run"): one confirmation of a lease row's
// listed Sheet cells starts one run. The run is claimed durably by the proposal's preview hash
// before the whole-set recheck and the first cell's own claim; a second confirmation of the same
// preview finds the run and starts nothing. Each cell still has its own one-attempt claim
// (`claimLeaseScopedS113FieldUpdate`), so this guard adds no write authority. App records only.

import type { Firestore } from "firebase-admin/firestore";

export const SHEET_SET_RUNS_COLLECTION = "operating_sheet_set_runs";

export interface SheetSetRunRecord {
  readonly version: "operating-sheet-set-run/v1";
  readonly lease_id: string;
  readonly preview_hash: string;
  readonly effect_hashes: readonly string[];
  readonly actor_uid: string;
  readonly state: "running" | "refused" | "ran";
  readonly started_at: string;
  readonly settled_at?: string;
  readonly results?: readonly { readonly effect_hash: string; readonly state: string }[];
}

/** Claim the one run of this confirmation; "claimed_before" when a run already exists. */
export async function claimSheetSetRun(
  db: Firestore,
  input: {
    readonly leaseId: string;
    readonly previewHash: string;
    readonly effectHashes: readonly string[];
    readonly actorUid: string;
  },
): Promise<"claimed" | "claimed_before"> {
  const ref = db.collection(SHEET_SET_RUNS_COLLECTION).doc(input.previewHash);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) return "claimed_before";
    const record: SheetSetRunRecord = {
      version: "operating-sheet-set-run/v1",
      lease_id: input.leaseId,
      preview_hash: input.previewHash,
      effect_hashes: [...input.effectHashes],
      actor_uid: input.actorUid,
      state: "running",
      started_at: new Date().toISOString(),
    };
    transaction.create(ref, record);
    return "claimed";
  });
}

/** Record how the run ended: refused by the recheck, or ran with each cell's state. */
export async function settleSheetSetRun(
  db: Firestore,
  input: {
    readonly previewHash: string;
    readonly state: "refused" | "ran";
    readonly results: readonly { readonly effectHash: string; readonly state: string }[];
  },
): Promise<void> {
  await db
    .collection(SHEET_SET_RUNS_COLLECTION)
    .doc(input.previewHash)
    .update({
      state: input.state,
      settled_at: new Date().toISOString(),
      results: input.results.map((result) => ({
        effect_hash: result.effectHash,
        state: result.state,
      })),
    });
}

export async function readSheetSetRun(
  db: Firestore,
  previewHash: string,
): Promise<SheetSetRunRecord | null> {
  const snapshot = await db.collection(SHEET_SET_RUNS_COLLECTION).doc(previewHash).get();
  return snapshot.exists ? (snapshot.data() as SheetSetRunRecord) : null;
}
