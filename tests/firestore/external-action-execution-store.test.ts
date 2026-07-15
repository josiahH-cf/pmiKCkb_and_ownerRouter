import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type {
  ExternalActionReceipt,
  ExternalExecutionRecord,
} from "@/lib/external-execution/types";
import {
  EXTERNAL_EXECUTION_COLLECTIONS,
  FirestoreExternalExecutionStore,
} from "@/lib/firestore/external-action-executions";

const projectId = "pmi-kc-kb-external-execution-store-test";
let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `external-execution-store-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

describe("external execution Firestore store CAS", () => {
  it("accepts one concurrent terminal receipt and makes only its exact retry idempotent", async () => {
    const store = new FirestoreExternalExecutionStore(db);
    const record = executionRecord("concurrent-receipts", "running");
    await seed(record);
    const first = receipt("provider:first", "a");
    const second = receipt("provider:second", "b");

    const outcomes = await Promise.allSettled([
      store.finish(record.id, first),
      store.finish(record.id, second),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);

    const stored = await store.get(record.id);
    expect(stored).toMatchObject({ attemptCount: 1, state: "succeeded" });
    expect(stored?.receipt).toBeDefined();
    const winner = stored!.receipt!;
    const loser = winner.providerRef === first.providerRef ? second : first;
    await expect(store.finish(record.id, winner)).resolves.toBeUndefined();
    await expect(store.finish(record.id, loser)).rejects.toThrow(
      /conflicting terminal receipt/i,
    );

    const audit = await db
      .collection(EXTERNAL_EXECUTION_COLLECTIONS.audit)
      .where("execution_id", "==", record.id)
      .get();
    expect(audit.docs).toHaveLength(1);
  }, 20_000);

  it("allows reconciled receipts only from ambiguous and prevents terminal overwrite", async () => {
    const store = new FirestoreExternalExecutionStore(db);
    const ambiguous = executionRecord("ambiguous-receipt", "ambiguous");
    await seed(ambiguous);
    await expect(
      store.finish(ambiguous.id, receipt("provider:not-reconciled", "c")),
    ).rejects.toThrow(/cannot transition from ambiguous/i);

    const reconciled = receipt("provider:reconciled", "d", true);
    await expect(store.finish(ambiguous.id, reconciled)).resolves.toBeUndefined();
    await expect(store.finish(ambiguous.id, reconciled)).resolves.toBeUndefined();
    await expect(store.fail(ambiguous.id, false)).rejects.toThrow(
      /failure cannot transition from succeeded/i,
    );
    await expect(store.get(ambiguous.id)).resolves.toMatchObject({
      receipt: reconciled,
      state: "succeeded",
    });
  });

  it("uses the running state as a compare-and-set guard for competing finish and fail", async () => {
    const store = new FirestoreExternalExecutionStore(db);
    const record = executionRecord("finish-fail-race", "running");
    await seed(record);

    const outcomes = await Promise.allSettled([
      store.finish(record.id, receipt("provider:race", "e")),
      store.fail(record.id, false),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect((await store.get(record.id))?.state).toMatch(/^(succeeded|failed)$/);
  });
});

async function seed(record: ExternalExecutionRecord) {
  await db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(record.id).set(record);
}

function executionRecord(
  suffix: string,
  state: ExternalExecutionRecord["state"],
): ExternalExecutionRecord {
  return {
    id: `external-execution-${suffix}`,
    workflowId: "workflow-placeholder-1",
    actionId: `action-${suffix}`,
    actionKey: "vendor.gmail.health",
    contextHash: "c".repeat(64),
    previewHash: "d".repeat(64),
    idempotencyKey: "e".repeat(64),
    state,
    attemptCount: 1,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
  };
}

function receipt(
  providerRef: string,
  hashCharacter: string,
  reconciled = false,
): ExternalActionReceipt {
  return {
    actionKey: "vendor.gmail.health",
    providerRef,
    resultHash: hashCharacter.repeat(64),
    reconciled,
    createdAt: "2026-07-14T00:00:00.000Z",
  };
}
