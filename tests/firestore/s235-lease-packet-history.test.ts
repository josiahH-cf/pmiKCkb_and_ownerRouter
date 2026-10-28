import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  LEASE_DOCUMENT_PACKET_COLLECTIONS,
  LEASE_PACKET_HISTORY_LIMIT,
  listLeasePacketSnapshotIds,
} from "@/lib/firestore/lease-document-packet-snapshots";

// S235 ARCH-S235-4: the new-loop check reads every packet snapshot id recorded for one lease, and
// refuses when the history is larger than it can check. Synthetic snapshot records on the emulator.

const projectId = "pmi-kc-kb-s235-lease-packet-history-test";
let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s235-lease-packet-history-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

async function seed(leaseId: string, snapshotId: string) {
  await db
    .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.snapshots)
    .doc(snapshotId)
    .set({ leaseId, transactionId: leaseId, snapshot_id: snapshotId });
}

describe("S235 lease packet history for the new-loop check", () => {
  it("lists every snapshot of the lease and none of another lease", async () => {
    await seed("4821", "packet_a");
    await seed("4821", "packet_b");
    await seed("5001", "packet_c");
    expect((await listLeasePacketSnapshotIds("4821", db)).sort()).toEqual([
      "packet_a",
      "packet_b",
    ]);
    expect(await listLeasePacketSnapshotIds("9999", db)).toEqual([]);
  });

  it("refuses when the history is larger than the bound it can check", async () => {
    const batch = db.batch();
    for (let index = 0; index <= LEASE_PACKET_HISTORY_LIMIT; index += 1) {
      const id = `packet_${String(index).padStart(4, "0")}`;
      batch.set(db.collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.snapshots).doc(id), {
        leaseId: "4821",
        transactionId: "4821",
        snapshot_id: id,
      });
    }
    await batch.commit();
    await expect(listLeasePacketSnapshotIds("4821", db)).rejects.toThrow(
      /more packet history than the app can check/,
    );
  });
});
