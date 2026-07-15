import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  COMMUNICATIONS_RETENTION_MS,
  communicationsRetentionFields,
} from "@/lib/gmail-hub/retention-policy";
import {
  cleanupAuditId,
  cleanupCandidateHash,
  FirestoreCommunicationsCleanupStore,
  GMAIL_RETENTION_CLEANUP_RUN_COLLECTION,
} from "@/lib/gmail-hub/retention-store";
import { runLocalCommunicationsCleanupWorker } from "@/lib/gmail-hub/retention-worker";

const projectId = "pmi-kc-kb-retention-worker-test";
const nowMs = Date.UTC(2026, 6, 14);
let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `communications-retention-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

describe("communications cleanup Firestore emulator", () => {
  it("records a stale candidate as processed without deleting the changed record", async () => {
    const record = db
      .collection("gmail_send_confirmations")
      .doc("synthetic-drifted-confirmation");
    const originalAnchor = nowMs - COMMUNICATIONS_RETENTION_MS.confirmation - 100;
    await record.set({
      state: "synthetic",
      ...communicationsRetentionFields("confirmation", originalAnchor),
    });

    const store = new FirestoreCommunicationsCleanupStore(db);
    const [candidate] = await store.listCandidates(nowMs, 1);
    expect(candidate).toBeDefined();
    await store.initializeRun({
      candidateHashes: [cleanupCandidateHash(candidate!)],
      cleanupLimit: 1,
      runId: "firestore-synthetic-drift-run",
      nowMs,
      plannedCount: 1,
    });

    const changedAnchor = originalAnchor + 1;
    await record.set(communicationsRetentionFields("confirmation", changedAnchor), {
      merge: true,
    });

    await expect(
      store.deleteIfEligible(candidate!, nowMs, "firestore-synthetic-drift-run"),
    ).resolves.toBe(false);
    expect((await record.get()).exists).toBe(true);

    const run = await db
      .collection(GMAIL_RETENTION_CLEANUP_RUN_COLLECTION)
      .doc(cleanupAuditId("firestore-synthetic-drift-run"))
      .get();
    expect(run.data()).toMatchObject({
      failed_count: 0,
      deleted_counts: {},
    });
    expect(run.data()?.processed_hashes).toHaveLength(1);
    expect(JSON.stringify(run.data())).not.toContain("synthetic-drifted-confirmation");
  });

  it("queries and deletes only the bounded expired non-held synthetic records", async () => {
    const expiredConfirmation = db
      .collection("gmail_send_confirmations")
      .doc("synthetic-expired-confirmation");
    const expiredDedupe = db
      .collection("gmail_push_dedupe")
      .doc("synthetic-expired-dedupe");
    const futureSync = db.collection("gmail_sync_audit").doc("synthetic-future-sync");
    const heldLink = db
      .collection("gmail_workflow_communications")
      .doc("synthetic-held-link");

    await Promise.all([
      expiredConfirmation.set({
        state: "synthetic",
        ...communicationsRetentionFields(
          "confirmation",
          nowMs - COMMUNICATIONS_RETENTION_MS.confirmation - 100,
        ),
      }),
      expiredDedupe.set({
        state: "synthetic",
        ...communicationsRetentionFields(
          "push_dedupe",
          nowMs - COMMUNICATIONS_RETENTION_MS.push_dedupe - 200,
        ),
      }),
      futureSync.set({
        state: "synthetic",
        ...communicationsRetentionFields("sync_audit", nowMs),
      }),
      heldLink.set({
        state: "synthetic",
        ...communicationsRetentionFields(
          "workflow_link",
          nowMs - COMMUNICATIONS_RETENTION_MS.workflow_link - 300,
        ),
        expires_at: null,
        expires_at_ms: null,
        legal_hold: true,
      }),
    ]);

    const store = new FirestoreCommunicationsCleanupStore(db);
    await expect(
      runLocalCommunicationsCleanupWorker({
        emulatorConfirmed: true,
        env: {
          NODE_ENV: "test",
          FIRESTORE_EMULATOR_HOST: `${FIRESTORE_EMULATOR_TARGET.host}:${FIRESTORE_EMULATOR_TARGET.port}`,
        },
        limit: 1,
        nowMs,
        runId: "firestore-synthetic-run-1",
        store,
      }),
    ).resolves.toMatchObject({
      plannedCount: 1,
      deletedCount: 1,
      failedCount: 0,
    });

    expect((await expiredDedupe.get()).exists).toBe(false);
    expect((await expiredConfirmation.get()).exists).toBe(true);
    expect((await futureSync.get()).exists).toBe(true);
    expect((await heldLink.get()).data()).toMatchObject({
      legal_hold: true,
      expires_at: null,
      expires_at_ms: null,
    });

    await expect(
      runLocalCommunicationsCleanupWorker({
        emulatorConfirmed: true,
        env: {
          NODE_ENV: "test",
          FIRESTORE_EMULATOR_HOST: `${FIRESTORE_EMULATOR_TARGET.host}:${FIRESTORE_EMULATOR_TARGET.port}`,
        },
        limit: 10,
        nowMs,
        runId: "firestore-synthetic-run-2",
        store,
      }),
    ).resolves.toMatchObject({
      plannedCount: 1,
      deletedCount: 1,
      failedCount: 0,
    });

    expect((await expiredConfirmation.get()).exists).toBe(false);
    expect((await futureSync.get()).exists).toBe(true);
    expect((await heldLink.get()).exists).toBe(true);
    const audit = await db
      .collection("gmail_retention_audit")
      .doc(cleanupAuditId("firestore-synthetic-run-1"))
      .get();
    expect(audit.data()).toMatchObject({
      action: "cleanup_completed",
      planned_count: 1,
      deleted_count: 1,
      failed_count: 0,
    });
    expect(JSON.stringify(audit.data())).not.toMatch(
      /synthetic-expired|synthetic-held|synthetic-future/,
    );
  });

  it("does not admit a new candidate when an audit-outage retry reuses a bounded run", async () => {
    const original = db
      .collection("gmail_send_confirmations")
      .doc("synthetic-audit-outage-original");
    await original.set({
      state: "synthetic",
      ...communicationsRetentionFields(
        "confirmation",
        nowMs - COMMUNICATIONS_RETENTION_MS.confirmation - 100,
      ),
    });

    const store = new FirestoreCommunicationsCleanupStore(db);
    const auditSpy = vi
      .spyOn(store, "writeCountsAudit")
      .mockRejectedValueOnce(new Error("synthetic audit outage"));
    const input = {
      emulatorConfirmed: true,
      env: {
        NODE_ENV: "test",
        FIRESTORE_EMULATOR_HOST: `${FIRESTORE_EMULATOR_TARGET.host}:${FIRESTORE_EMULATOR_TARGET.port}`,
      },
      limit: 1,
      nowMs,
      runId: "firestore-frozen-audit-run-1",
      store,
    } as const;

    await expect(runLocalCommunicationsCleanupWorker(input)).rejects.toThrow(
      "audit outage",
    );
    expect((await original.get()).exists).toBe(false);

    const newlyEligible = db
      .collection("gmail_send_confirmations")
      .doc("synthetic-audit-outage-new");
    await newlyEligible.set({
      state: "synthetic",
      ...communicationsRetentionFields(
        "confirmation",
        nowMs - COMMUNICATIONS_RETENTION_MS.confirmation - 200,
      ),
    });

    await expect(runLocalCommunicationsCleanupWorker(input)).resolves.toMatchObject({
      auditStatus: "created",
      deletedCount: 1,
      failedCount: 0,
      plannedCount: 1,
    });
    expect((await newlyEligible.get()).exists).toBe(true);

    await expect(runLocalCommunicationsCleanupWorker(input)).resolves.toMatchObject({
      auditStatus: "duplicate",
      deletedCount: 1,
      plannedCount: 1,
    });
    expect((await newlyEligible.get()).exists).toBe(true);
    expect(auditSpy).toHaveBeenCalledTimes(3);

    const audit = await db
      .collection("gmail_retention_audit")
      .doc(cleanupAuditId(input.runId))
      .get();
    expect(audit.data()).toMatchObject({
      planned_count: 1,
      deleted_count: 1,
      failed_count: 0,
    });
    expect(JSON.stringify(audit.data())).not.toMatch(
      /audit-outage-original|audit-outage-new/,
    );

    const run = await db
      .collection(GMAIL_RETENTION_CLEANUP_RUN_COLLECTION)
      .doc(cleanupAuditId(input.runId))
      .get();
    expect(run.data()).toMatchObject({
      cleanup_limit: 1,
      planned_count: 1,
      failed_count: 0,
    });
    expect(run.data()?.planned_candidate_hashes).toHaveLength(1);
    expect(run.data()?.processed_hashes).toHaveLength(1);
    expect(JSON.stringify(run.data())).not.toMatch(
      /audit-outage-original|audit-outage-new/,
    );
  });
});
