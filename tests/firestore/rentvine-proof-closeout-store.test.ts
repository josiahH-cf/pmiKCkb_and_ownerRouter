import { readFileSync } from "node:fs";

import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { ExternalExecutionRecord } from "@/lib/external-execution/types";
import { EXTERNAL_EXECUTION_COLLECTIONS } from "@/lib/firestore/external-action-executions";
import {
  FirestoreRentVineProofCloseoutStore,
  RENTVINE_PROOF_CLOSEOUT_COLLECTIONS,
} from "@/lib/firestore/rentvine-proof-closeouts";
import {
  buildRentVineProofBinding,
  buildRentVineProofExecutionRecord,
  buildRentVineProofReceipt,
  rentVineProofReceiptHash,
} from "@/lib/lease-renewal/rentvine-proof-contract";
import { buildRentVineProofCloseoutRecord } from "@/lib/lease-renewal/rentvine-proof-closeout";
import { parseRentVineProofRuntimeConfig } from "@/lib/lease-renewal/rentvine-proof-runtime-config";

const projectId = "pmi-kc-kb-rentvine-proof-closeout-test";
const nowMs = Date.parse("2026-08-30T16:00:00.000Z");
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
  app = initializeApp({ projectId }, `rentvine-proof-closeout-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

function runtime() {
  return parseRentVineProofRuntimeConfig({
    schemaVersion: "s30-runtime-v1",
    scope: "renewals",
    proofRef: "s30-123e4567-e89b-42d3-a456-426614174000",
    account: "pmikcmetro",
    actor: {
      uid: "managed-admin-1",
      email: "admin@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Admin",
      scopes: ["renewals"],
    },
    authority: {
      clientDesignationRef: "client-direction-firestore-a1b2",
      protectedGateDirectionRef: "owner-gate-firestore-c3d4",
      endpointEvidenceRef: "endpoint-evidence-firestore-e5f6",
      mappingEvidenceRef: "mapping-evidence-firestore-g7h8",
      backupEvidenceRef: "backup-evidence-firestore-i9j0",
      authorizationExpiresAt: "2026-08-30T18:00:00.000Z",
    },
    target: {
      leaseId: "42",
      identityField: "leaseID",
      field: "endDate",
      expectedStartDate: "2025-09-01",
      expectedEndDate: "2026-08-31",
      proposedEndDate: "2026-09-01",
      rollbackEndDate: "2026-08-31",
    },
  });
}

function executionEvidence() {
  const config = runtime();
  const forwardBinding = buildRentVineProofBinding(config, "forward");
  const forwardBase = buildRentVineProofExecutionRecord(forwardBinding, nowMs);
  const forwardReceipt = buildRentVineProofReceipt({
    binding: forwardBinding,
    result: { accepted: true },
    readback: {
      leaseId: "42",
      startDate: "2025-09-01",
      endDate: "2026-09-01",
    },
    createdAt: new Date(nowMs + 1_000).toISOString(),
    reconciled: false,
  });
  const forward: ExternalExecutionRecord = {
    ...forwardBase,
    state: "succeeded",
    attemptCount: 1,
    receipt: forwardReceipt,
    updatedAt: forwardReceipt.createdAt,
  };
  const rollbackBinding = buildRentVineProofBinding(config, "rollback", {
    forwardExecutionId: forward.id,
    forwardReceiptHash: rentVineProofReceiptHash(forwardReceipt),
  });
  const rollbackBase = buildRentVineProofExecutionRecord(rollbackBinding, nowMs + 2_000);
  const rollbackReceipt = buildRentVineProofReceipt({
    binding: rollbackBinding,
    result: { accepted: true },
    readback: {
      leaseId: "42",
      startDate: "2025-09-01",
      endDate: "2026-08-31",
    },
    createdAt: new Date(nowMs + 3_000).toISOString(),
    reconciled: false,
  });
  const rollback: ExternalExecutionRecord = {
    ...rollbackBase,
    state: "succeeded",
    attemptCount: 1,
    receipt: rollbackReceipt,
    updatedAt: rollbackReceipt.createdAt,
  };
  const closeout = buildRentVineProofCloseoutRecord({
    proofRef: config.proofRef,
    forward,
    rollback,
    nowMs: nowMs + 4_000,
  });
  return { forward, rollback, closeout };
}

async function seedExecutions(
  forward: ExternalExecutionRecord,
  rollback: ExternalExecutionRecord,
) {
  await Promise.all([
    db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(forward.id).set(forward),
    db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(rollback.id).set(rollback),
  ]);
}

describe("S30 RentVine proof closeout Firestore store", () => {
  it("creates one exact bodyless closeout and makes the same evidence idempotent", async () => {
    const { forward, rollback, closeout } = executionEvidence();
    await seedExecutions(forward, rollback);
    const store = new FirestoreRentVineProofCloseoutStore(db);

    await expect(store.create(closeout)).resolves.toBe("created");
    await expect(store.create(closeout)).resolves.toBe("reused");
    await expect(
      store.create({
        ...closeout,
        closedReadbackAt: new Date(nowMs + 5_000).toISOString(),
        createdAt: new Date(nowMs + 5_000).toISOString(),
      }),
    ).resolves.toBe("reused");
    await expect(store.get(closeout.id)).resolves.toEqual(closeout);
    const audit = await db
      .collection(RENTVINE_PROOF_CLOSEOUT_COLLECTIONS.audit)
      .where("closeout_id", "==", closeout.id)
      .get();
    expect(audit.docs).toHaveLength(1);
    expect(JSON.stringify(audit.docs[0]!.data())).not.toContain("2026-08-31");
  });

  it("gives concurrent exact creates one winner and one reuse", async () => {
    const { forward, rollback, closeout } = executionEvidence();
    await seedExecutions(forward, rollback);
    const store = new FirestoreRentVineProofCloseoutStore(db);
    const results = await Promise.all([store.create(closeout), store.create(closeout)]);
    expect(results.sort()).toEqual(["created", "reused"]);
  }, 20_000);

  it("refuses missing, non-terminal, or receipt-drifted execution evidence", async () => {
    const { forward, rollback, closeout } = executionEvidence();
    const store = new FirestoreRentVineProofCloseoutStore(db);
    await expect(store.create(closeout)).rejects.toThrow(/evidence is missing/i);

    await seedExecutions(forward, {
      ...rollback,
      receipt: { ...rollback.receipt!, resultHash: "f".repeat(64) },
    });
    await expect(store.create(closeout)).rejects.toThrow(/does not match/i);
  });

  it("denies browser read/write access to closeout and audit collections", async () => {
    const { forward, rollback, closeout } = executionEvidence();
    await seedExecutions(forward, rollback);
    await new FirestoreRentVineProofCloseoutStore(db).create(closeout);
    const client = testEnv.authenticatedContext("admin", { role: "Admin" }).firestore();
    for (const collection of Object.values(RENTVINE_PROOF_CLOSEOUT_COLLECTIONS)) {
      const existingId =
        collection === RENTVINE_PROOF_CLOSEOUT_COLLECTIONS.records
          ? closeout.id
          : (await db.collection(collection).limit(1).get()).docs[0]!.id;
      const existing = doc(client, collection, existingId);
      await assertFails(getDoc(existing));
      await assertFails(updateDoc(existing, { state: "tampered" }));
      await assertFails(deleteDoc(existing));
      await assertFails(setDoc(doc(client, collection, "forged"), { state: "forged" }));
    }
  }, 20_000);
});
