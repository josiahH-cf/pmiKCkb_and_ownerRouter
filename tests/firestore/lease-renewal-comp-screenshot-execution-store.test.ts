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
import {
  COMP_SCREENSHOT_EXECUTION_COLLECTIONS,
  FirestoreCompScreenshotExecutionStore,
} from "@/lib/firestore/lease-renewal-comp-screenshot-executions";
import {
  LEASE_RENEWAL_PROGRESS_COLLECTIONS,
  progressDocId,
} from "@/lib/firestore/lease-renewal-progress-schema";
import {
  COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS,
  COMP_SCREENSHOT_UPLOAD_DISPATCH_LEASE_MS,
  buildCompScreenshotPreview,
  buildCompScreenshotReceipt,
  buildCompScreenshotRollbackPreview,
  buildCompScreenshotRollbackReceipt,
  compScreenshotProviderPayload,
  compScreenshotRecordIdentity,
  hashCompScreenshotFilename,
  refreshCompScreenshotRollbackPreview,
  type CompScreenshotExecutionRecord,
  type CompScreenshotPreviewRecord,
  type CompScreenshotReceipt,
} from "@/lib/lease-renewal/comp-screenshot-contract";

const projectId = "pmi-kc-kb-comp-screenshot-execution-store-test";
const nowMs = Date.parse("2026-07-30T12:00:00.000Z");
const descriptor = {
  environmentKind: "production",
  dataContext: "live",
  source: "explicit",
} as const;
const sensitiveLeaseId = "lease-sensitive-123";
const sensitiveFilename = "resident-name-sensitive.png";
const sensitiveFolderId = "folder-sensitive-raw";
const providerBodySentinel = "provider-body-must-not-enter-audit";

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
  app = initializeApp({ projectId }, `comp-screenshot-store-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

function preview(
  options: {
    actorUid?: string;
    contentSha256?: string;
    contentMd5?: string;
    predecessorExecutionId?: string;
    nonce?: string;
  } = {},
): CompScreenshotPreviewRecord {
  const identity = compScreenshotRecordIdentity(sensitiveLeaseId);
  return buildCompScreenshotPreview({
    actorUid: options.actorUid ?? "editor-1",
    ...identity,
    folderId: sensitiveFolderId,
    providerIdentityHash: "9".repeat(64),
    contentSha256: options.contentSha256 ?? "a".repeat(64),
    contentMd5: options.contentMd5 ?? "b".repeat(32),
    sourceFilenameHash: hashCompScreenshotFilename(sensitiveFilename),
    mimeType: "image/png",
    sizeBytes: 4096,
    descriptor,
    ...(options.predecessorExecutionId
      ? { predecessorExecutionId: options.predecessorExecutionId }
      : {}),
    nowMs,
    nonce: options.nonce ?? "preview-1",
  });
}

function receiptFor(
  record: CompScreenshotExecutionRecord,
  overrides: Partial<CompScreenshotReceipt> = {},
): CompScreenshotReceipt {
  const payload = compScreenshotProviderPayload(record);
  return {
    ...buildCompScreenshotReceipt(
      record,
      {
        fileId: record.reservedFileId!,
        providerPayloadHash: payload.providerPayloadHash,
        providerMetadataHash: "c".repeat(64),
        md5Checksum: record.contentMd5,
        sha256Checksum: record.contentSha256,
        version: "17",
        headRevisionId: "revision-17",
        createdTime: "2026-07-30T12:00:01.000Z",
        webViewLink: `https://drive.invalid/${providerBodySentinel}`,
        canUntrash: true,
      },
      false,
    ),
    ...overrides,
  };
}

async function claimPrepared(
  store: FirestoreCompScreenshotExecutionStore,
  prepared: CompScreenshotPreviewRecord,
) {
  await store.createPreview(prepared);
  const claim = await store.claim({
    previewHash: prepared.id,
    executionId: prepared.executionId,
    actorUid: prepared.binding.actorUid,
    nowMs: nowMs + 1,
  });
  expect(claim.status).toBe("claimed");
  if (claim.status !== "claimed") throw new Error("Expected a winning claim.");
  return claim.record;
}

async function bindFolderEvidence(
  store: FirestoreCompScreenshotExecutionStore,
  executionId: string,
  atMs = nowMs + 1,
) {
  const result = await store.bindFolderEvidence(
    executionId,
    { folderMetadataHash: "f".repeat(64), folderVersion: "1" },
    atMs,
  );
  expect(["bound", "existing"]).toContain(result.status);
  return result;
}

async function deliverPrepared(
  store: FirestoreCompScreenshotExecutionStore,
  prepared: CompScreenshotPreviewRecord,
  fileId = "drive_file_00000001",
) {
  const claimed = await claimPrepared(store, prepared);
  await bindFolderEvidence(store, claimed.id);
  const reserved = await store.reserveFileId(claimed.id, fileId, nowMs + 2);
  expect(reserved.status).toBe("reserved");
  const started = await store.beginUpload(claimed.id, nowMs + 3);
  expect(started.status).toBe("started");
  if (started.status !== "started") throw new Error("Expected upload start.");
  const receipt = receiptFor(started.record);
  await store.finish(claimed.id, receipt);
  const delivered = await store.getExecution(claimed.id);
  if (!delivered) throw new Error("Expected delivered execution.");
  return { delivered, receipt };
}

describe("Comp screenshot Firestore execution store", () => {
  it("creates immutable previews idempotently and rejects a same-id collision", async () => {
    const store = new FirestoreCompScreenshotExecutionStore(db);
    const prepared = preview();

    await store.createPreview(prepared);
    await store.createPreview(prepared);
    await expect(
      store.createPreview({
        ...prepared,
        bindingHash: "f".repeat(64),
      }),
    ).rejects.toThrow("preview hash collision");

    await expect(store.getPreview(prepared.id)).resolves.toEqual(prepared);
    const audit = await db
      .collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.audit)
      .where("action", "==", "preview_created")
      .get();
    expect(audit.docs).toHaveLength(1);
  }, 20_000);

  it("gives competing global-head claims one winner and advances only the expected predecessor", async () => {
    const store = new FirestoreCompScreenshotExecutionStore(db);
    const firstSiblings = [
      preview({ contentSha256: "1".repeat(64), nonce: "head-a" }),
      preview({ contentSha256: "2".repeat(64), nonce: "head-b" }),
    ];
    await Promise.all(firstSiblings.map((item) => store.createPreview(item)));

    const firstClaims = await Promise.all(
      firstSiblings.map((item) =>
        store.claim({
          previewHash: item.id,
          executionId: item.executionId,
          actorUid: item.binding.actorUid,
          nowMs: nowMs + 1,
        }),
      ),
    );
    expect(firstClaims.filter((claim) => claim.status === "claimed")).toHaveLength(1);
    expect(firstClaims.filter((claim) => claim.status === "mismatch")).toHaveLength(1);
    const firstWinner = firstClaims.find((claim) => claim.status === "claimed");
    if (!firstWinner || firstWinner.status !== "claimed") {
      throw new Error("Expected a first head winner.");
    }
    await expect(
      store.getLatestExecution(firstWinner.record.compRecordHash),
    ).resolves.toMatchObject({ id: firstWinner.record.id });

    const successors = [
      preview({
        contentSha256: "3".repeat(64),
        predecessorExecutionId: firstWinner.record.id,
        nonce: "successor-a",
      }),
      preview({
        contentSha256: "4".repeat(64),
        predecessorExecutionId: firstWinner.record.id,
        nonce: "successor-b",
      }),
    ];
    await Promise.all(successors.map((item) => store.createPreview(item)));
    const successorClaims = await Promise.all(
      successors.map((item) =>
        store.claim({
          previewHash: item.id,
          executionId: item.executionId,
          actorUid: item.binding.actorUid,
          nowMs: nowMs + 2,
        }),
      ),
    );
    expect(successorClaims.filter((claim) => claim.status === "claimed")).toHaveLength(1);
    expect(successorClaims.filter((claim) => claim.status === "mismatch")).toHaveLength(
      1,
    );
    const successor = successorClaims.find((claim) => claim.status === "claimed");
    if (!successor || successor.status !== "claimed") {
      throw new Error("Expected a successor head winner.");
    }
    expect(successor.record.predecessorExecutionId).toBe(firstWinner.record.id);
    await expect(
      store.getLatestExecution(successor.record.compRecordHash),
    ).resolves.toMatchObject({ id: successor.record.id });
  }, 20_000);

  it("persists one generated Drive id before one upload start and returns one receipt to duplicates", async () => {
    const store = new FirestoreCompScreenshotExecutionStore(db);
    const prepared = preview({ nonce: "reserve-race" });
    const claimed = await claimPrepared(store, prepared);
    await bindFolderEvidence(store, claimed.id);
    const candidates = ["drive_file_candidate_A", "drive_file_candidate_B"];

    const reservations = await Promise.all(
      candidates.map((candidate) =>
        store.reserveFileId(claimed.id, candidate, nowMs + 2),
      ),
    );
    expect(
      reservations.filter((reservation) => reservation.status === "reserved"),
    ).toHaveLength(1);
    expect(
      reservations.filter((reservation) => reservation.status === "existing"),
    ).toHaveLength(1);
    const winner = reservations.find((reservation) => reservation.status === "reserved");
    if (!winner || winner.status !== "reserved") {
      throw new Error("Expected a reserved Drive id.");
    }
    expect(
      reservations.map((reservation) =>
        "fileId" in reservation ? reservation.fileId : null,
      ),
    ).toEqual([winner.fileId, winner.fileId]);

    const starts = await Promise.all([
      store.beginUpload(claimed.id, nowMs + 3),
      store.beginUpload(claimed.id, nowMs + 3),
    ]);
    expect(starts.filter((start) => start.status === "started")).toHaveLength(1);
    expect(starts.filter((start) => start.status === "in_progress")).toHaveLength(1);
    expect(
      starts.every((start) => "fileId" in start && start.fileId === winner.fileId),
    ).toBe(true);

    const started = starts.find((start) => start.status === "started");
    if (!started || started.status !== "started") {
      throw new Error("Expected one upload start.");
    }
    const receipt = receiptFor(started.record);
    await expect(store.finish(claimed.id, receipt)).resolves.toEqual(receipt);
    await expect(
      store.finish(claimed.id, { ...receipt, reconciled: true }),
    ).resolves.toEqual(receipt);
    await expect(
      store.finish(claimed.id, { ...receipt, resultHash: "e".repeat(64) }),
    ).rejects.toThrow("conflicting receipt");

    await expect(
      store.claim({
        previewHash: prepared.id,
        executionId: prepared.executionId,
        actorUid: prepared.binding.actorUid,
        nowMs: nowMs + 4,
      }),
    ).resolves.toMatchObject({ status: "duplicate", receipt });

    const persisted = await store.getExecution(claimed.id);
    expect(persisted).toMatchObject({
      state: "delivered",
      reservedFileId: winner.fileId,
      attemptCount: 1,
      dispatchGeneration: 1,
      dispatchLeaseExpiresAtMs: nowMs + 3 + COMP_SCREENSHOT_UPLOAD_DISPATCH_LEASE_MS,
      receipt,
    });
    const losingCandidate = candidates.find((candidate) => candidate !== winner.fileId);
    expect(JSON.stringify(persisted)).not.toContain(losingCandidate);
    const audit = await db.collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.audit).get();
    expect(JSON.stringify(audit.docs.map((item) => item.data()))).not.toContain(
      losingCandidate,
    );
  }, 20_000);

  it("separates not-started absence from an ambiguous started upload and deterministic no-effect", async () => {
    const store = new FirestoreCompScreenshotExecutionStore(db);

    const unstarted = await claimPrepared(
      store,
      preview({ contentSha256: "5".repeat(64), nonce: "unstarted" }),
    );
    await expect(store.markAbsentIfNotStarted(unstarted.id, nowMs + 2)).resolves.toBe(
      true,
    );
    await expect(store.getExecution(unstarted.id)).resolves.toMatchObject({
      state: "absent",
    });

    const startedPreview = preview({
      contentSha256: "6".repeat(64),
      predecessorExecutionId: unstarted.id,
      nonce: "started-ambiguous",
    });
    const started = await claimPrepared(store, startedPreview);
    await bindFolderEvidence(store, started.id);
    await store.reserveFileId(started.id, "drive_file_ambiguous_1", nowMs + 3);
    const begun = await store.beginUpload(started.id, nowMs + 4);
    expect(begun.status).toBe("started");
    if (begun.status !== "started") throw new Error("Expected upload start.");
    await expect(store.markAbsentIfNotStarted(started.id, nowMs + 5)).resolves.toBe(
      false,
    );
    await expect(
      store.markAmbiguous({
        executionId: started.id,
        dispatchGeneration: begun.dispatchGeneration,
        nowMs: nowMs + 6,
      }),
    ).resolves.toBe(true);
    await expect(store.getExecution(started.id)).resolves.toMatchObject({
      state: "ambiguous",
    });
    await expect(
      store.markDeterministicNoEffect({
        executionId: started.id,
        dispatchGeneration: begun.dispatchGeneration,
        nowMs: nowMs + 7,
      }),
    ).resolves.toBe(true);
    await expect(store.getExecution(started.id)).resolves.toMatchObject({
      state: "absent",
    });
    await expect(
      store.markAmbiguous({
        executionId: started.id,
        dispatchGeneration: begun.dispatchGeneration,
        nowMs: nowMs + 8,
      }),
    ).resolves.toBe(false);
    await expect(store.getExecution(started.id)).resolves.toMatchObject({
      state: "absent",
    });
  }, 20_000);

  it("recovers only an ambiguous or expired dispatch and CAS-rejects stale callbacks", async () => {
    const store = new FirestoreCompScreenshotExecutionStore(db);
    const prepared = preview({ nonce: "dispatch-generation-cas" });
    const claimed = await claimPrepared(store, prepared);
    await bindFolderEvidence(store, claimed.id);
    const fileId = "drive_file_dispatch_generation";
    await store.reserveFileId(claimed.id, fileId, nowMs + 2);
    const first = await store.beginUpload(claimed.id, nowMs + 3);
    expect(first.status).toBe("started");
    if (first.status !== "started") throw new Error("Expected first dispatch.");

    const active = await store.beginUpload(claimed.id, nowMs + 4);
    expect(active).toMatchObject({
      status: "in_progress",
      fileId,
      dispatchGeneration: 1,
    });
    await expect(
      store.markAmbiguous({
        executionId: claimed.id,
        dispatchGeneration: first.dispatchGeneration,
        nowMs: nowMs + 4,
        requireLeaseExpiry: true,
      }),
    ).resolves.toBe(false);

    const retry = await store.beginUpload(claimed.id, first.dispatchLeaseExpiresAtMs);
    expect(retry).toMatchObject({
      status: "retry",
      fileId,
      dispatchGeneration: 2,
      record: { attemptCount: 1, reservedFileId: fileId },
    });
    await expect(
      store.markAmbiguous({
        executionId: claimed.id,
        dispatchGeneration: first.dispatchGeneration,
        nowMs: first.dispatchLeaseExpiresAtMs + 1,
      }),
    ).resolves.toBe(false);
    await expect(
      store.markDeterministicNoEffect({
        executionId: claimed.id,
        dispatchGeneration: first.dispatchGeneration,
        nowMs: first.dispatchLeaseExpiresAtMs + 1,
      }),
    ).resolves.toBe(false);
    await expect(store.getExecution(claimed.id)).resolves.toMatchObject({
      state: "upload_started",
      reservedFileId: fileId,
      attemptCount: 1,
      dispatchGeneration: 2,
    });

    const audit = await db
      .collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.audit)
      .where("execution_id", "==", claimed.id)
      .get();
    const actions = audit.docs.map((item) => item.data());
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "upload_started",
          dispatch_generation: 1,
        }),
        expect.objectContaining({
          action: "upload_retried",
          dispatch_generation: 2,
        }),
      ]),
    );
    expect(JSON.stringify(actions)).not.toContain(sensitiveLeaseId);
    expect(JSON.stringify(actions)).not.toContain(sensitiveFilename);
  }, 20_000);

  it("claims rollback once, retries only an ambiguous rollback, and persists one trash receipt", async () => {
    const store = new FirestoreCompScreenshotExecutionStore(db);
    const { delivered } = await deliverPrepared(
      store,
      preview({ nonce: "rollback-success" }),
    );
    const rollbackPreview = buildCompScreenshotRollbackPreview({
      actorUid: delivered.actorUid,
      execution: delivered,
      providerIdentityHash: delivered.providerIdentityHash,
      providerMetadataHash: delivered.receipt!.providerMetadataHash,
      providerVersion: delivered.receipt!.version,
      providerHeadRevisionId: delivered.receipt!.headRevisionId,
      canTrash: true,
      canUntrash: true,
      descriptor,
      providerDriftedSinceReceipt: false,
      nowMs: nowMs + 10,
      nonce: "rollback-preview",
    });
    await store.createRollbackPreview(rollbackPreview);
    await store.createRollbackPreview(rollbackPreview);
    const progressRef = db
      .collection(LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress)
      .doc(progressDocId(sensitiveLeaseId));
    await progressRef.set({
      lease_id: sensitiveLeaseId,
      owner_decision: {
        market: {
          comp_screenshot_ref: delivered.receipt!.ref,
          comp_screenshot_execution_id: delivered.id,
          comp_screenshot_receipt_id: delivered.receipt!.receiptId,
          comp_screenshot_result_hash: delivered.receipt!.resultHash,
          retained_basis: "manual",
        },
      },
    });

    const claims = await Promise.all([
      store.claimRollback({
        previewHash: rollbackPreview.id,
        rollbackId: rollbackPreview.rollbackId,
        executionId: delivered.id,
        leaseId: sensitiveLeaseId,
        actorUid: delivered.actorUid,
        nowMs: nowMs + 11,
      }),
      store.claimRollback({
        previewHash: rollbackPreview.id,
        rollbackId: rollbackPreview.rollbackId,
        executionId: delivered.id,
        leaseId: sensitiveLeaseId,
        actorUid: delivered.actorUid,
        nowMs: nowMs + 11,
      }),
    ]);
    expect(claims.filter((claim) => claim.status === "claimed")).toHaveLength(1);
    expect(claims.filter((claim) => claim.status === "in_progress")).toHaveLength(1);
    expect((await progressRef.get()).data()?.owner_decision.market).toEqual({
      retained_basis: "manual",
    });
    const initialClaim = claims.find((claim) => claim.status === "claimed");
    if (!initialClaim || initialClaim.status !== "claimed") {
      throw new Error("Expected the initial rollback claim.");
    }
    const expiredRetry = await store.claimRollback({
      previewHash: rollbackPreview.id,
      rollbackId: rollbackPreview.rollbackId,
      executionId: delivered.id,
      leaseId: sensitiveLeaseId,
      actorUid: delivered.actorUid,
      nowMs: initialClaim.dispatchLeaseExpiresAtMs,
    });
    expect(expiredRetry).toMatchObject({
      status: "retry",
      dispatchGeneration: 2,
      rollback: { dispatchGeneration: 2 },
    });
    if (expiredRetry.status !== "retry") {
      throw new Error("Expected expired rollback recovery.");
    }
    const staleExecutionBefore = await store.getExecution(delivered.id);
    const staleProgressBefore = (await progressRef.get()).data();
    const staleAuditBefore = await db
      .collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.audit)
      .where("execution_id", "==", delivered.id)
      .get();
    await expect(
      store.markRollbackFailed({
        executionId: delivered.id,
        rollbackId: initialClaim.rollback.id,
        previewHash: initialClaim.rollback.previewHash,
        dispatchGeneration: initialClaim.dispatchGeneration,
        nowMs: nowMs + COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS + 1,
      }),
    ).resolves.toBe(false);
    await expect(store.getExecution(delivered.id)).resolves.toEqual(staleExecutionBefore);
    expect((await progressRef.get()).data()).toEqual(staleProgressBefore);
    const staleAuditAfter = await db
      .collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.audit)
      .where("execution_id", "==", delivered.id)
      .get();
    expect(staleAuditAfter.size).toBe(staleAuditBefore.size);
    await store.markRollbackAmbiguous({
      executionId: delivered.id,
      rollbackId: expiredRetry.rollback.id,
      previewHash: expiredRetry.rollback.previewHash,
      dispatchGeneration: expiredRetry.dispatchGeneration,
      nowMs: nowMs + COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS + 2,
    });
    const newerAttachment = {
      comp_screenshot_ref: "drive:newer_file_12345",
      comp_screenshot_execution_id: `comp_store_${"a".repeat(48)}`,
      comp_screenshot_receipt_id: `comp_receipt_${"b".repeat(48)}`,
      comp_screenshot_result_hash: "c".repeat(64),
      retained_basis: "manual",
    };
    await progressRef.update({ "owner_decision.market": newerAttachment });
    const ambiguousRetry = await store.claimRollback({
      previewHash: rollbackPreview.id,
      rollbackId: rollbackPreview.rollbackId,
      executionId: delivered.id,
      leaseId: sensitiveLeaseId,
      actorUid: delivered.actorUid,
      nowMs: nowMs + COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS + 3,
    });
    expect(ambiguousRetry).toMatchObject({
      status: "retry",
      dispatchGeneration: 3,
    });
    if (ambiguousRetry.status !== "retry") {
      throw new Error("Expected ambiguous rollback recovery.");
    }
    expect((await progressRef.get()).data()?.owner_decision.market).toEqual(
      newerAttachment,
    );

    const current = await store.getExecution(delivered.id);
    if (!current?.rollback) throw new Error("Expected the rollback record.");
    const receipt = buildCompScreenshotRollbackReceipt(
      current,
      current.rollback,
      rollbackPreview,
      {
        providerMetadataHashAfter: "d".repeat(64),
        versionAfter: "18",
        headRevisionIdAfter: current.receipt!.headRevisionId,
        explicitlyTrashed: true,
        canUntrash: true,
        providerTimestamp: "2026-07-30T12:00:14.000Z",
      },
      false,
    );
    await expect(
      store.finishRollback(delivered.id, initialClaim.dispatchGeneration, receipt),
    ).rejects.toThrow(/cannot finish/);
    await expect(store.getExecution(delivered.id)).resolves.toMatchObject({
      state: "delivered",
      rollback: { state: "running", dispatchGeneration: 3 },
    });
    await expect(
      store.finishRollback(delivered.id, ambiguousRetry.dispatchGeneration, receipt),
    ).resolves.toEqual(receipt);
    await expect(
      store.finishRollback(delivered.id, ambiguousRetry.dispatchGeneration, {
        ...receipt,
        reconciled: true,
      }),
    ).resolves.toEqual(receipt);
    await expect(store.getExecution(delivered.id)).resolves.toMatchObject({
      state: "rolled_back",
      rollback: { state: "succeeded", attemptCount: 1, receipt },
    });
    await expect(
      store.claimRollback({
        previewHash: rollbackPreview.id,
        rollbackId: rollbackPreview.rollbackId,
        executionId: delivered.id,
        leaseId: sensitiveLeaseId,
        actorUid: delivered.actorUid,
        nowMs: nowMs + 15,
      }),
    ).resolves.toMatchObject({ status: "duplicate", receipt });
  }, 20_000);

  it("leaves the execution and attached progress untouched for a wrong lease claim", async () => {
    const store = new FirestoreCompScreenshotExecutionStore(db);
    const { delivered } = await deliverPrepared(
      store,
      preview({ nonce: "rollback-wrong-lease" }),
    );
    const rollbackPreview = buildCompScreenshotRollbackPreview({
      actorUid: delivered.actorUid,
      execution: delivered,
      providerIdentityHash: delivered.providerIdentityHash,
      providerMetadataHash: delivered.receipt!.providerMetadataHash,
      providerVersion: delivered.receipt!.version,
      providerHeadRevisionId: delivered.receipt!.headRevisionId,
      canTrash: true,
      canUntrash: true,
      descriptor,
      providerDriftedSinceReceipt: false,
      nowMs: nowMs + 16,
      nonce: "rollback-wrong-lease-preview",
    });
    await store.createRollbackPreview(rollbackPreview);
    const progressRef = db
      .collection(LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress)
      .doc(progressDocId(sensitiveLeaseId));
    await progressRef.set({
      lease_id: sensitiveLeaseId,
      owner_decision: {
        market: {
          comp_screenshot_ref: delivered.receipt!.ref,
          comp_screenshot_execution_id: delivered.id,
          comp_screenshot_receipt_id: delivered.receipt!.receiptId,
          comp_screenshot_result_hash: delivered.receipt!.resultHash,
          retained_basis: "manual",
        },
      },
    });
    const executionBefore = await store.getExecution(delivered.id);
    const progressBefore = (await progressRef.get()).data();
    const auditBefore = await db
      .collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.audit)
      .get();

    await expect(
      store.claimRollback({
        previewHash: rollbackPreview.id,
        rollbackId: rollbackPreview.rollbackId,
        executionId: delivered.id,
        leaseId: "lease-sensitive-wrong",
        actorUid: delivered.actorUid,
        nowMs: nowMs + 17,
      }),
    ).resolves.toMatchObject({ status: "mismatch" });

    await expect(store.getExecution(delivered.id)).resolves.toEqual(executionBefore);
    expect((await progressRef.get()).data()).toEqual(progressBefore);
    const auditAfter = await db
      .collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.audit)
      .get();
    expect(auditAfter.size).toBe(auditBefore.size);
    expect(
      (
        await db
          .collection(LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress)
          .doc(progressDocId("lease-sensitive-wrong"))
          .get()
      ).exists,
    ).toBe(false);
  }, 20_000);

  it("restarts generation one on changed provider and actor lineages only after failure", async () => {
    const store = new FirestoreCompScreenshotExecutionStore(db);
    const { delivered } = await deliverPrepared(
      store,
      preview({ nonce: "rollback-new-lineage" }),
      "drive_file_new_lineage",
    );
    const originalPreview = buildCompScreenshotRollbackPreview({
      actorUid: delivered.actorUid,
      execution: delivered,
      providerIdentityHash: delivered.providerIdentityHash,
      providerMetadataHash: delivered.receipt!.providerMetadataHash,
      providerVersion: delivered.receipt!.version,
      providerHeadRevisionId: delivered.receipt!.headRevisionId,
      canTrash: true,
      canUntrash: true,
      descriptor,
      providerDriftedSinceReceipt: false,
      nowMs: nowMs + 40,
      nonce: "rollback-new-lineage-original",
    });
    await store.createRollbackPreview(originalPreview);
    const originalClaim = await store.claimRollback({
      previewHash: originalPreview.id,
      rollbackId: originalPreview.rollbackId,
      executionId: delivered.id,
      leaseId: sensitiveLeaseId,
      actorUid: delivered.actorUid,
      nowMs: nowMs + 41,
    });
    if (originalClaim.status !== "claimed") {
      throw new Error("Expected original rollback claim.");
    }
    await store.markRollbackFailed({
      executionId: delivered.id,
      rollbackId: originalClaim.rollback.id,
      previewHash: originalClaim.rollback.previewHash,
      dispatchGeneration: originalClaim.dispatchGeneration,
      nowMs: nowMs + 42,
    });

    const providerChanged = buildCompScreenshotRollbackPreview({
      actorUid: delivered.actorUid,
      execution: delivered,
      providerIdentityHash: delivered.providerIdentityHash,
      providerMetadataHash: "8".repeat(64),
      providerVersion: "18",
      providerHeadRevisionId: "revision-18",
      canTrash: true,
      canUntrash: true,
      descriptor,
      providerDriftedSinceReceipt: true,
      nowMs: nowMs + 43,
      nonce: "rollback-new-lineage-provider",
    });
    expect(providerChanged.rollbackId).not.toBe(originalPreview.rollbackId);
    await store.createRollbackPreview(providerChanged);
    const providerClaim = await store.claimRollback({
      previewHash: providerChanged.id,
      rollbackId: providerChanged.rollbackId,
      executionId: delivered.id,
      leaseId: sensitiveLeaseId,
      actorUid: delivered.actorUid,
      nowMs: nowMs + 44,
    });
    expect(providerClaim).toMatchObject({
      status: "claimed",
      dispatchGeneration: 1,
      rollback: {
        id: providerChanged.rollbackId,
        bindingHash: providerChanged.bindingHash,
        attemptCount: 1,
      },
    });
    if (providerClaim.status !== "claimed") {
      throw new Error("Expected provider-lineage claim.");
    }
    const progressRef = db
      .collection(LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress)
      .doc(progressDocId(sensitiveLeaseId));
    await progressRef.set({
      lease_id: sensitiveLeaseId,
      owner_decision: { market: { retained_basis: "provider-lineage-running" } },
    });
    const staleExecutionBefore = await store.getExecution(delivered.id);
    const staleProgressBefore = (await progressRef.get()).data();
    const staleAuditBefore = await db
      .collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.audit)
      .where("execution_id", "==", delivered.id)
      .get();
    await expect(
      store.markRollbackAmbiguous({
        executionId: delivered.id,
        rollbackId: originalClaim.rollback.id,
        previewHash: originalClaim.rollback.previewHash,
        dispatchGeneration: originalClaim.dispatchGeneration,
        nowMs: nowMs + 45,
      }),
    ).resolves.toBe(false);
    await expect(store.getExecution(delivered.id)).resolves.toEqual(staleExecutionBefore);
    expect((await progressRef.get()).data()).toEqual(staleProgressBefore);
    const staleAuditAfter = await db
      .collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.audit)
      .where("execution_id", "==", delivered.id)
      .get();
    expect(staleAuditAfter.size).toBe(staleAuditBefore.size);
    await store.markRollbackFailed({
      executionId: delivered.id,
      rollbackId: providerClaim.rollback.id,
      previewHash: providerClaim.rollback.previewHash,
      dispatchGeneration: providerClaim.dispatchGeneration,
      nowMs: nowMs + 46,
    });

    const recoveryAdminUid = "admin-reconfirmed-2";
    const actorChanged = buildCompScreenshotRollbackPreview({
      actorUid: recoveryAdminUid,
      execution: delivered,
      providerIdentityHash: delivered.providerIdentityHash,
      providerMetadataHash: providerChanged.binding.providerMetadataHash,
      providerVersion: providerChanged.binding.providerVersion,
      providerHeadRevisionId: providerChanged.binding.providerHeadRevisionId,
      canTrash: true,
      canUntrash: true,
      descriptor,
      providerDriftedSinceReceipt: true,
      nowMs: nowMs + 47,
      nonce: "rollback-new-lineage-actor",
    });
    expect(actorChanged.rollbackId).toBe(providerChanged.rollbackId);
    expect(actorChanged.bindingHash).not.toBe(providerChanged.bindingHash);
    await store.createRollbackPreview(actorChanged);
    const actorClaim = await store.claimRollback({
      previewHash: actorChanged.id,
      rollbackId: actorChanged.rollbackId,
      executionId: delivered.id,
      leaseId: sensitiveLeaseId,
      actorUid: recoveryAdminUid,
      nowMs: nowMs + 48,
    });
    expect(actorClaim).toMatchObject({
      status: "claimed",
      dispatchGeneration: 1,
      rollback: {
        actorUid: recoveryAdminUid,
        bindingHash: actorChanged.bindingHash,
        attemptCount: 1,
      },
    });

    const forbiddenWhileRunning = buildCompScreenshotRollbackPreview({
      actorUid: "admin-running-conflict",
      execution: delivered,
      providerIdentityHash: delivered.providerIdentityHash,
      providerMetadataHash: providerChanged.binding.providerMetadataHash,
      providerVersion: providerChanged.binding.providerVersion,
      providerHeadRevisionId: providerChanged.binding.providerHeadRevisionId,
      canTrash: true,
      canUntrash: true,
      descriptor,
      providerDriftedSinceReceipt: true,
      nowMs: nowMs + 49,
      nonce: "rollback-new-lineage-running-conflict",
    });
    await store.createRollbackPreview(forbiddenWhileRunning);
    await expect(
      store.claimRollback({
        previewHash: forbiddenWhileRunning.id,
        rollbackId: forbiddenWhileRunning.rollbackId,
        executionId: delivered.id,
        leaseId: sensitiveLeaseId,
        actorUid: forbiddenWhileRunning.binding.actorUid,
        nowMs: nowMs + 50,
      }),
    ).resolves.toMatchObject({
      status: "mismatch",
      record: {
        rollback: {
          actorUid: recoveryAdminUid,
          bindingHash: actorChanged.bindingHash,
          state: "running",
        },
      },
    });

    const audit = await db
      .collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.audit)
      .where("execution_id", "==", delivered.id)
      .get();
    const restarts = audit.docs
      .map((item) => item.data())
      .filter((item) => item.action === "rollback_lineage_restarted");
    expect(restarts).toHaveLength(2);
    expect(restarts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rollback_id: providerChanged.rollbackId,
          prior_rollback_id: originalPreview.rollbackId,
          prior_binding_hash: originalPreview.bindingHash,
          prior_state: "failed",
          prior_dispatch_generation: 1,
          dispatch_generation: 1,
        }),
        expect.objectContaining({
          rollback_id: actorChanged.rollbackId,
          prior_rollback_id: providerChanged.rollbackId,
          prior_binding_hash: providerChanged.bindingHash,
          prior_state: "failed",
          prior_dispatch_generation: 1,
          dispatch_generation: 1,
        }),
      ]),
    );
    expect(JSON.stringify(restarts)).not.toContain(sensitiveLeaseId);
  }, 20_000);

  it("binds cross-Admin explicit-trash recovery without replacing the original confirmer", async () => {
    const store = new FirestoreCompScreenshotExecutionStore(db);
    const { delivered } = await deliverPrepared(
      store,
      preview({ nonce: "rollback-cross-admin" }),
      "drive_file_cross_admin",
    );
    const originalPreview = buildCompScreenshotRollbackPreview({
      actorUid: delivered.actorUid,
      execution: delivered,
      providerIdentityHash: delivered.providerIdentityHash,
      providerMetadataHash: delivered.receipt!.providerMetadataHash,
      providerVersion: delivered.receipt!.version,
      providerHeadRevisionId: delivered.receipt!.headRevisionId,
      canTrash: true,
      canUntrash: true,
      descriptor,
      providerDriftedSinceReceipt: false,
      nowMs: nowMs + 50,
      nonce: "rollback-cross-admin-original",
    });
    await store.createRollbackPreview(originalPreview);
    const originalClaim = await store.claimRollback({
      previewHash: originalPreview.id,
      rollbackId: originalPreview.rollbackId,
      executionId: delivered.id,
      leaseId: sensitiveLeaseId,
      actorUid: delivered.actorUid,
      nowMs: nowMs + 51,
    });
    if (originalClaim.status !== "claimed") {
      throw new Error("Expected original rollback claim.");
    }
    await store.markRollbackAmbiguous({
      executionId: delivered.id,
      rollbackId: originalClaim.rollback.id,
      previewHash: originalClaim.rollback.previewHash,
      dispatchGeneration: originalClaim.dispatchGeneration,
      nowMs: nowMs + 52,
    });

    const recoveryActorUid = "admin-explicit-trash-recovery";
    const recoveryPreview = refreshCompScreenshotRollbackPreview(
      originalPreview,
      nowMs + 53,
      "rollback-cross-admin-recovery",
      recoveryActorUid,
    );
    await store.createRollbackPreview(recoveryPreview);
    await expect(
      store.claimRollback({
        previewHash: recoveryPreview.id,
        rollbackId: recoveryPreview.rollbackId,
        executionId: delivered.id,
        leaseId: sensitiveLeaseId,
        actorUid: recoveryActorUid,
        nowMs: nowMs + 54,
      }),
    ).resolves.toMatchObject({ status: "mismatch" });
    const recovered = await store.claimRollback({
      previewHash: recoveryPreview.id,
      rollbackId: recoveryPreview.rollbackId,
      executionId: delivered.id,
      leaseId: sensitiveLeaseId,
      actorUid: recoveryActorUid,
      nowMs: nowMs + 54,
      observedExplicitTrash: true,
    });
    expect(recovered).toMatchObject({
      status: "retry",
      dispatchGeneration: originalClaim.dispatchGeneration + 1,
      rollback: {
        actorUid: delivered.actorUid,
        bindingHash: originalPreview.bindingHash,
        previewHash: recoveryPreview.id,
      },
    });

    const audit = await db
      .collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.audit)
      .where("execution_id", "==", delivered.id)
      .get();
    expect(audit.docs.map((item) => item.data())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "rollback_effect_recovered",
          original_actor_uid: delivered.actorUid,
          recovery_actor_uid: recoveryActorUid,
        }),
      ]),
    );
  }, 20_000);

  it("retries the same rollback lineage after a deterministic failure", async () => {
    const store = new FirestoreCompScreenshotExecutionStore(db);
    const { delivered } = await deliverPrepared(
      store,
      preview({ nonce: "rollback-failed" }),
      "drive_file_00000002",
    );
    const rollbackPreview = buildCompScreenshotRollbackPreview({
      actorUid: delivered.actorUid,
      execution: delivered,
      providerIdentityHash: delivered.providerIdentityHash,
      providerMetadataHash: delivered.receipt!.providerMetadataHash,
      providerVersion: delivered.receipt!.version,
      providerHeadRevisionId: delivered.receipt!.headRevisionId,
      canTrash: true,
      canUntrash: true,
      descriptor,
      providerDriftedSinceReceipt: false,
      nowMs: nowMs + 20,
      nonce: "rollback-failed-preview",
    });
    await store.createRollbackPreview(rollbackPreview);
    const claimed = await store.claimRollback({
      previewHash: rollbackPreview.id,
      rollbackId: rollbackPreview.rollbackId,
      executionId: delivered.id,
      leaseId: sensitiveLeaseId,
      actorUid: delivered.actorUid,
      nowMs: nowMs + 21,
    });
    if (claimed.status !== "claimed") throw new Error("Expected rollback claim.");
    await store.markRollbackFailed({
      executionId: delivered.id,
      rollbackId: claimed.rollback.id,
      previewHash: claimed.rollback.previewHash,
      dispatchGeneration: claimed.dispatchGeneration,
      nowMs: nowMs + 22,
    });

    await expect(store.getExecution(delivered.id)).resolves.toMatchObject({
      state: "delivered",
      rollback: { state: "failed" },
    });
    const refreshedPreview = buildCompScreenshotRollbackPreview({
      actorUid: delivered.actorUid,
      execution: delivered,
      providerIdentityHash: delivered.providerIdentityHash,
      providerMetadataHash: delivered.receipt!.providerMetadataHash,
      providerVersion: delivered.receipt!.version,
      providerHeadRevisionId: delivered.receipt!.headRevisionId,
      canTrash: true,
      canUntrash: true,
      descriptor,
      providerDriftedSinceReceipt: false,
      nowMs: nowMs + 23,
      nonce: "rollback-failed-refreshed-preview",
    });
    expect(refreshedPreview.rollbackId).toBe(rollbackPreview.rollbackId);
    expect(refreshedPreview.id).not.toBe(rollbackPreview.id);
    await store.createRollbackPreview(refreshedPreview);
    const retry = await store.claimRollback({
      previewHash: refreshedPreview.id,
      rollbackId: refreshedPreview.rollbackId,
      executionId: delivered.id,
      leaseId: sensitiveLeaseId,
      actorUid: delivered.actorUid,
      nowMs: nowMs + 24,
    });
    expect(retry).toMatchObject({
      status: "retry",
      rollback: {
        id: refreshedPreview.rollbackId,
        previewHash: refreshedPreview.id,
        state: "running",
        attemptCount: 1,
        dispatchGeneration: 2,
      },
    });
    if (retry.status !== "retry") throw new Error("Expected rollback retry.");

    const staleReceipt = buildCompScreenshotRollbackReceipt(
      claimed.record,
      claimed.rollback,
      rollbackPreview,
      {
        providerMetadataHashAfter: "d".repeat(64),
        versionAfter: "18",
        headRevisionIdAfter: claimed.record.receipt!.headRevisionId,
        explicitlyTrashed: true,
        canUntrash: true,
        providerTimestamp: "2026-07-30T12:00:24.000Z",
      },
      false,
    );
    const currentReceipt = buildCompScreenshotRollbackReceipt(
      retry.record,
      retry.rollback,
      refreshedPreview,
      {
        providerMetadataHashAfter: "e".repeat(64),
        versionAfter: "19",
        headRevisionIdAfter: retry.record.receipt!.headRevisionId,
        explicitlyTrashed: true,
        canUntrash: true,
        providerTimestamp: "2026-07-30T12:00:25.000Z",
      },
      true,
    );
    await expect(
      store.finishRollback(delivered.id, retry.dispatchGeneration, currentReceipt),
    ).resolves.toEqual(currentReceipt);
    await expect(
      store.claimRollback({
        previewHash: rollbackPreview.id,
        rollbackId: rollbackPreview.rollbackId,
        executionId: delivered.id,
        leaseId: sensitiveLeaseId,
        actorUid: delivered.actorUid,
        nowMs: nowMs + 25,
      }),
    ).resolves.toMatchObject({ status: "mismatch" });
    await expect(
      store.finishRollback(delivered.id, claimed.dispatchGeneration, staleReceipt),
    ).resolves.toEqual(currentReceipt);
    await expect(
      store.finishRollback(delivered.id, retry.dispatchGeneration, {
        ...currentReceipt,
        providerMetadataHashAfter: "f".repeat(64),
        resultHash: "1".repeat(64),
      }),
    ).rejects.toThrow("conflicting receipt");
    await expect(
      store.finishRollback(delivered.id, claimed.dispatchGeneration, {
        ...staleReceipt,
        fileId: "drive_file_conflicting_rollback",
        resultHash: "2".repeat(64),
      }),
    ).rejects.toThrow("conflicting receipt");
    await expect(store.getExecution(delivered.id)).resolves.toMatchObject({
      state: "rolled_back",
      rollback: {
        state: "succeeded",
        id: rollbackPreview.rollbackId,
        previewHash: refreshedPreview.id,
        dispatchGeneration: 2,
        receipt: currentReceipt,
      },
    });
  }, 20_000);

  it("keeps the audit bodyless and denies direct clients across every collection", async () => {
    const store = new FirestoreCompScreenshotExecutionStore(db);
    const { delivered } = await deliverPrepared(
      store,
      preview({ nonce: "bodyless-audit" }),
      "drive_file_00000003",
    );
    const rollbackPreview = buildCompScreenshotRollbackPreview({
      actorUid: delivered.actorUid,
      execution: delivered,
      providerIdentityHash: delivered.providerIdentityHash,
      providerMetadataHash: delivered.receipt!.providerMetadataHash,
      providerVersion: delivered.receipt!.version,
      providerHeadRevisionId: delivered.receipt!.headRevisionId,
      canTrash: true,
      canUntrash: true,
      descriptor,
      providerDriftedSinceReceipt: false,
      nowMs: nowMs + 30,
      nonce: "bodyless-rollback",
    });
    await store.createRollbackPreview(rollbackPreview);
    await store.claimRollback({
      previewHash: rollbackPreview.id,
      rollbackId: rollbackPreview.rollbackId,
      executionId: delivered.id,
      leaseId: sensitiveLeaseId,
      actorUid: delivered.actorUid,
      nowMs: nowMs + 31,
    });

    const audit = await db.collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.audit).get();
    const auditJson = JSON.stringify(audit.docs.map((item) => item.data()));
    expect(auditJson).not.toContain(sensitiveLeaseId);
    expect(auditJson).not.toContain(sensitiveFilename);
    expect(auditJson).not.toContain(sensitiveFolderId);
    expect(auditJson).not.toContain(providerBodySentinel);
    expect(auditJson).not.toContain("base64");
    expect(auditJson).not.toContain("driveFilename");
    expect(auditJson).not.toContain("folderId");

    const collections = Object.values(COMP_SCREENSHOT_EXECUTION_COLLECTIONS);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      for (const collection of collections) {
        await setDoc(doc(context.firestore(), collection, "server-only"), {
          state: "server-only",
        });
      }
    });
    for (const role of ["Editor", "Approver", "Admin"] as const) {
      const clientDb = testEnv
        .authenticatedContext(role.toLowerCase(), { role })
        .firestore();
      for (const collection of collections) {
        const existing = doc(clientDb, collection, "server-only");
        await assertFails(getDoc(existing));
        await assertFails(updateDoc(existing, { state: "tampered" }));
        await assertFails(deleteDoc(existing));
        await assertFails(
          setDoc(doc(clientDb, collection, `client-${role.toLowerCase()}`), {
            state: "tampered",
          }),
        );
      }
    }
  }, 20_000);
});
