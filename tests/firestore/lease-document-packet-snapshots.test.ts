import { readFileSync } from "node:fs";

import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  getCurrentPacketSnapshot,
  getPacketSnapshot,
  LEASE_DOCUMENT_PACKET_COLLECTIONS,
  listCurrentRenewalPacketSnapshots,
  packetHeadId,
  recordPacketExecutionProjection,
  savePacketSnapshot,
} from "@/lib/firestore/lease-document-packet-snapshots";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { readyS66Input, s66Fact } from "@/tests/fixtures/s66-packet";

const projectId = "pmi-kc-kb-s66-packet-snapshot-test";
const actor = {
  uid: "fixture-admin",
  email: "fixture-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};
let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId,
  });
  app = initializeApp({ projectId }, `s66-packet-store-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

describe("S66 immutable packet snapshot store", () => {
  it("keeps the new server-owned collections closed to direct clients", async () => {
    const client = testEnv
      .authenticatedContext("fixture-editor", {
        email: "fixture-editor@pmikcmetro.com",
        email_verified: true,
        role: "Editor",
      })
      .firestore();
    const ref = doc(client, LEASE_DOCUMENT_PACKET_COLLECTIONS.snapshots, "forbidden");
    await assertFails(setDoc(ref, { payload_hash: "f".repeat(64) }));
    await assertFails(getDoc(ref));
  });

  it("makes unchanged replay a no-op and keeps prior snapshots immutable/superseded", async () => {
    const firstEvaluation = evaluateRenewalPacket(readyS66Input());
    const first = await savePacketSnapshot(
      actor,
      {
        evaluation: firstEvaluation,
        expectedCurrentSnapshotId: null,
        nowIso: "2026-08-10T12:00:00.000Z",
      },
      db,
    );
    const replay = await savePacketSnapshot(
      actor,
      {
        evaluation: firstEvaluation,
        expectedCurrentSnapshotId: first.snapshotId,
        nowIso: "2026-08-10T12:01:00.000Z",
      },
      db,
    );
    expect(replay.snapshotId).toBe(first.snapshotId);
    expect(replay.createdAt).toBe("2026-08-10T12:00:00.000Z");

    const changedInput = readyS66Input();
    changedInput.facts = changedInput.facts.map((fact) =>
      fact.fieldKey === "lease.monthly_rent_cents"
        ? s66Fact("lease.monthly_rent_cents", 123_457)
        : fact,
    );
    const successor = await savePacketSnapshot(
      actor,
      {
        evaluation: evaluateRenewalPacket(changedInput),
        expectedCurrentSnapshotId: first.snapshotId,
        nowIso: "2026-08-10T12:02:00.000Z",
      },
      db,
    );
    expect(successor).toMatchObject({
      snapshotVersion: 2,
      previousSnapshotId: first.snapshotId,
      current: true,
    });
    expect(await getPacketSnapshot(actor, first.snapshotId, db)).toMatchObject({
      payloadHash: first.payloadHash,
      current: false,
      visibleState: "Superseded",
    });
    expect(
      await db.collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.activity).get(),
    ).toHaveProperty("size", 2);
  });

  it("allows one current successor when two competing saves use the same expected head", async () => {
    const first = await savePacketSnapshot(
      actor,
      {
        evaluation: evaluateRenewalPacket(readyS66Input()),
        expectedCurrentSnapshotId: null,
      },
      db,
    );
    const candidates = [123_457, 123_458].map((value) => {
      const input = readyS66Input();
      input.facts = input.facts.map((fact) =>
        fact.fieldKey === "lease.monthly_rent_cents"
          ? s66Fact("lease.monthly_rent_cents", value)
          : fact,
      );
      return evaluateRenewalPacket(input);
    });
    const outcomes = await Promise.allSettled(
      candidates.map((evaluation) =>
        savePacketSnapshot(
          actor,
          { evaluation, expectedCurrentSnapshotId: first.snapshotId },
          db,
        ),
      ),
    );
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const current = await getCurrentPacketSnapshot(
      actor,
      first.leaseId,
      first.transactionId,
      db,
    );
    expect(current).toMatchObject({ snapshotVersion: 2, current: true });
  });

  it("projects partial execution without deleting facts/receipt and records metadata-only activity", async () => {
    const first = await savePacketSnapshot(
      actor,
      {
        evaluation: evaluateRenewalPacket(readyS66Input()),
        expectedCurrentSnapshotId: null,
      },
      db,
    );
    const partial = await recordPacketExecutionProjection(
      actor,
      {
        snapshot_id: first.snapshotId,
        idempotency_key: "fixture-attempt",
        receipt_id: "fixture-partial-receipt",
        state: "Partially executed",
      },
      db,
    );
    expect(partial).toMatchObject({
      visibleState: "Partially executed",
      execution: {
        idempotencyKey: "fixture-attempt",
        receiptId: "fixture-partial-receipt",
      },
      payloadHash: first.payloadHash,
    });

    const activity = await db
      .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.activity)
      .get();
    const forbiddenKeys = [
      "display_value",
      "legal_body",
      "document_body",
      "name",
      "email",
      "address",
      "animal_details",
    ];
    for (const doc of activity.docs) {
      const serialized = JSON.stringify(doc.data()).toLowerCase();
      for (const forbidden of forbiddenKeys)
        expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it("reads current packet truth for a bounded cohort and preserves explicit missing heads", async () => {
    const deskPacket = readyS66Input();
    // The live renewal desk addresses packet heads by the canonical lease id for both identities.
    deskPacket.transactionId = deskPacket.leaseId;
    const current = await savePacketSnapshot(
      actor,
      {
        evaluation: evaluateRenewalPacket(deskPacket),
        expectedCurrentSnapshotId: null,
        nowIso: "2026-08-10T12:00:00.000Z",
      },
      db,
    );

    const cohort = await listCurrentRenewalPacketSnapshots(
      actor,
      [current.leaseId, "lease-without-packet", current.leaseId],
      db,
    );

    expect([...cohort.keys()]).toEqual([current.leaseId, "lease-without-packet"]);
    expect(cohort.get(current.leaseId)).toMatchObject({
      snapshotId: current.snapshotId,
      current: true,
      visibleState: current.visibleState,
    });
    expect(cohort.get("lease-without-packet")).toBeNull();
  });

  it("refuses an unbounded packet cohort", async () => {
    await expect(
      listCurrentRenewalPacketSnapshots(
        actor,
        Array.from({ length: 501 }, (_, index) => `lease-${index}`),
        db,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a current head whose stored identity differs from the requested lease", async () => {
    await db
      .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.heads)
      .doc(packetHeadId("lease-a", "lease-a"))
      .set({
        lease_id: "lease-b",
        transaction_id: "lease-b",
        snapshot_id: "packet_corrupt",
        snapshot_version: 1,
        payload_hash: "a".repeat(64),
      });

    await expect(
      listCurrentRenewalPacketSnapshots(actor, ["lease-a"], db),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses duplicate current heads pointing at one immutable snapshot", async () => {
    for (const leaseId of ["lease-a", "lease-b"]) {
      await db
        .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.heads)
        .doc(packetHeadId(leaseId, leaseId))
        .set({
          lease_id: leaseId,
          transaction_id: leaseId,
          snapshot_id: "packet_shared",
          snapshot_version: 1,
          payload_hash: "b".repeat(64),
        });
    }

    await expect(
      listCurrentRenewalPacketSnapshots(actor, ["lease-a", "lease-b"], db),
    ).rejects.toMatchObject({ status: 409 });
  });
});
