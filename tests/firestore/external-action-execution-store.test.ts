import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

/**
 * Bound for tests that race real Firestore transactions. Generous on purpose: the value must exceed
 * the emulator's contention retry backoff, and exceeding it is a genuine hang rather than a slow
 * machine. It bounds only how long contention may take to resolve, never what the test asserts.
 */
const CONTENTION_TIMEOUT_MS = 30_000;

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
  it.each([
    ["failed", false],
    ["ambiguous", true],
  ] as const)(
    "emits one value-free alert after the LIVE %s transition commits",
    async (expectedState, ambiguous) => {
      const record = {
        ...executionRecord(`attention-${expectedState}`, "running"),
        workflowId: "resident@example.invalid",
        actionId: "Message body for Tenant Name at Unit 123",
      };
      await seed(record);
      const observedCommittedStates: string[] = [];
      const emitAttention = vi.fn(async (event) => {
        const committed = await db
          .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
          .doc(record.id)
          .get();
        observedCommittedStates.push(String(committed.data()?.state));
        expect(JSON.stringify(event)).not.toMatch(
          /resident@example\.invalid|Message body|Tenant Name|Unit 123/,
        );
      });
      const store = new FirestoreExternalExecutionStore(db, emitAttention);

      await expect(store.fail(record.id, ambiguous)).resolves.toBeUndefined();

      expect(observedCommittedStates).toEqual([expectedState]);
      expect(emitAttention).toHaveBeenCalledTimes(1);
      expect(emitAttention).toHaveBeenCalledWith({
        marker: "LIVE_EFFECT_REQUIRES_ATTENTION",
        action_key: record.actionKey,
        execution_id: record.id,
        state: expectedState,
        data_mode: "live",
      });
      await expect(store.fail(record.id, ambiguous)).rejects.toThrow(
        /cannot transition/i,
      );
      expect(emitAttention).toHaveBeenCalledTimes(1);
    },
  );

  it("emits once for concurrent replays of the same failed transition", async () => {
    const emitAttention = vi.fn();
    const store = new FirestoreExternalExecutionStore(db, emitAttention);
    const record = executionRecord("concurrent-failure", "running");
    await seed(record);

    const outcomes = await Promise.allSettled([
      store.fail(record.id, false),
      store.fail(record.id, false),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(emitAttention).toHaveBeenCalledTimes(1);
    await expect(store.get(record.id)).resolves.toMatchObject({ state: "failed" });
  });

  it("never emits for a Test-lane failed transition", async () => {
    const emitAttention = vi.fn();
    const store = new FirestoreExternalExecutionStore(db, emitAttention);
    const record = {
      ...executionRecord("test-failure", "running"),
      dataMode: "test" as const,
    };
    await seed(record);

    await expect(store.fail(record.id, false)).resolves.toBeUndefined();

    expect(emitAttention).not.toHaveBeenCalled();
    await expect(store.get(record.id)).resolves.toMatchObject({
      dataMode: "test",
      state: "failed",
    });
  });

  it("keeps a committed failed state when the injected alert sink rejects", async () => {
    const emitAttention = vi.fn(async () => {
      throw new Error("fixture alert sink unavailable");
    });
    const store = new FirestoreExternalExecutionStore(db, emitAttention);
    const record = executionRecord("sink-failure", "running");
    await seed(record);

    await expect(store.fail(record.id, false)).resolves.toBeUndefined();

    expect(emitAttention).toHaveBeenCalledTimes(1);
    await expect(store.get(record.id)).resolves.toMatchObject({ state: "failed" });
  });

  it("does not emit when the failure transaction cannot commit", async () => {
    const emitAttention = vi.fn();
    const store = new FirestoreExternalExecutionStore(db, emitAttention);

    await expect(store.fail("missing-execution", false)).rejects.toThrow(
      /execution missing/i,
    );

    expect(emitAttention).not.toHaveBeenCalled();
  });

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

  // This test deliberately makes two real Firestore transactions contend for one document, and the
  // emulator resolves that with nondeterministic retry backoff. Vitest's 5s default bounded the
  // BACKOFF, not the behaviour, so it timed out three times on 2026-08-01 while passing in
  // isolation. An intermittently red test is worse than a slow one: it teaches everyone to re-run
  // instead of investigate, which is exactly how a real regression gets waved through. The
  // assertions below are unchanged; only the bound is widened to cover contention retries.
  it(
    "uses the running state as a compare-and-set guard for competing finish and fail",
    async () => {
      const emitAttention = vi.fn();
      const store = new FirestoreExternalExecutionStore(db, emitAttention);
      const record = executionRecord("finish-fail-race", "running");
      await seed(record);

      const outcomes = await Promise.allSettled([
        store.finish(record.id, receipt("provider:race", "e")),
        store.fail(record.id, false),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(
        1,
      );
      expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
      const finalState = (await store.get(record.id))?.state;
      expect(finalState).toMatch(/^(succeeded|failed)$/);
      expect(emitAttention).toHaveBeenCalledTimes(finalState === "failed" ? 1 : 0);
    },
    CONTENTION_TIMEOUT_MS,
  );
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
    dataMode: "live",
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
