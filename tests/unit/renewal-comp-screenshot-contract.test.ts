import { describe, expect, it } from "vitest";

import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";
import {
  COMP_SCREENSHOT_PREVIEW_TTL_MS,
  COMP_SCREENSHOT_UPLOAD_DISPATCH_LEASE_MS,
  MemoryCompScreenshotExecutionStore,
  buildCompScreenshotPreview,
  buildCompScreenshotReceipt,
  buildCompScreenshotRollbackPreview,
  buildCompScreenshotRollbackReceipt,
  compScreenshotExecutionFromPreview,
  compScreenshotProviderPayload,
  compScreenshotRecordIdentity,
  hashCompScreenshotBytes,
  hashCompScreenshotFilename,
  refreshCompScreenshotRollbackPreview,
  type CompScreenshotPreviewRecord,
  type CompScreenshotRollbackRecord,
} from "@/lib/lease-renewal/comp-screenshot-contract";

const NOW_MS = Date.parse("2026-07-30T02:00:00.000Z");
const ACTOR_UID = "actor_fixture_editor";
const LEASE_ID = "lease_fixture_alpha";
const FOLDER_ID = "folder_fixture_alpha";
const PROVIDER_IDENTITY_HASH = "a".repeat(64);
const SOURCE_FILENAME = "fixture-comp-alpha.png";
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
  0x44, 0x52, 0x46, 0x49, 0x58, 0x54, 0x55, 0x52, 0x45,
]);
const PRODUCTION_LIVE: EnvironmentDescriptor = {
  environmentKind: "production",
  dataContext: "live",
  source: "explicit",
};

type PreviewInput = Parameters<typeof buildCompScreenshotPreview>[0];

function previewInput(overrides: Partial<PreviewInput> = {}): PreviewInput {
  const identity = compScreenshotRecordIdentity(LEASE_ID);
  return {
    actorUid: ACTOR_UID,
    ...identity,
    folderId: FOLDER_ID,
    providerIdentityHash: PROVIDER_IDENTITY_HASH,
    contentSha256: hashCompScreenshotBytes(PNG_BYTES, "sha256"),
    contentMd5: hashCompScreenshotBytes(PNG_BYTES, "md5"),
    sourceFilenameHash: hashCompScreenshotFilename(SOURCE_FILENAME),
    mimeType: "image/png",
    sizeBytes: PNG_BYTES.byteLength,
    descriptor: PRODUCTION_LIVE,
    nowMs: NOW_MS,
    nonce: "nonce_fixture_alpha",
    ...overrides,
  };
}

async function claimPreview(
  store: MemoryCompScreenshotExecutionStore,
  preview: CompScreenshotPreviewRecord,
  nowMs = NOW_MS,
) {
  await store.createPreview(preview);
  return store.claim({
    previewHash: preview.id,
    executionId: preview.executionId,
    actorUid: preview.binding.actorUid,
    nowMs,
  });
}

async function bindFolderEvidence(
  store: MemoryCompScreenshotExecutionStore,
  executionId: string,
  nowMs = NOW_MS,
) {
  const result = await store.bindFolderEvidence(
    executionId,
    { folderMetadataHash: "f".repeat(64), folderVersion: "1" },
    nowMs,
  );
  expect(["bound", "existing"]).toContain(result.status);
  return result;
}

function receiptableExecution() {
  const preview = buildCompScreenshotPreview(
    previewInput({ nonce: "nonce_fixture_receipt_integrity" }),
  );
  const record = compScreenshotExecutionFromPreview(preview, NOW_MS);
  record.reservedFileId = "drive_file_receipt_integrity";
  record.folderMetadataHash = "f".repeat(64);
  record.folderVersion = "1";
  const providerPayloadHash = compScreenshotProviderPayload(record).providerPayloadHash;
  const evidence: Parameters<typeof buildCompScreenshotReceipt>[1] = {
    fileId: record.reservedFileId,
    providerPayloadHash,
    providerMetadataHash: "d".repeat(64),
    md5Checksum: record.contentMd5,
    sha256Checksum: record.contentSha256,
    version: "3",
    headRevisionId: "revision_receipt_integrity",
    createdTime: "2026-07-30T02:00:01.000Z",
    webViewLink: "https://drive.google.com/file/d/drive_file_receipt_integrity/view",
    canUntrash: true,
  };
  return { record, evidence };
}

function rollbackReceiptFixture() {
  const { record: execution, evidence: receiptEvidence } = receiptableExecution();
  execution.receipt = buildCompScreenshotReceipt(execution, receiptEvidence, false);
  execution.state = "delivered";
  const preview = buildCompScreenshotRollbackPreview({
    actorUid: ACTOR_UID,
    execution,
    providerIdentityHash: PROVIDER_IDENTITY_HASH,
    providerMetadataHash: receiptEvidence.providerMetadataHash,
    providerVersion: receiptEvidence.version,
    providerHeadRevisionId: receiptEvidence.headRevisionId,
    canTrash: true,
    canUntrash: true,
    descriptor: PRODUCTION_LIVE,
    providerDriftedSinceReceipt: false,
    nowMs: NOW_MS + 2_000,
    nonce: "nonce_fixture_rollback_receipt_integrity",
  });
  const createdAt = new Date(NOW_MS + 2_000).toISOString();
  const rollback: CompScreenshotRollbackRecord = {
    id: preview.rollbackId,
    bindingHash: preview.bindingHash,
    previewHash: preview.id,
    actorUid: ACTOR_UID,
    state: "running",
    attemptCount: 1,
    createdAt,
    updatedAt: createdAt,
  };
  const evidence: Parameters<typeof buildCompScreenshotRollbackReceipt>[3] = {
    providerMetadataHashAfter: "e".repeat(64),
    versionAfter: "4",
    headRevisionIdAfter: "revision_rollback_integrity",
    explicitlyTrashed: true,
    canUntrash: true,
    providerTimestamp: "2026-07-30T02:00:03.000Z",
  };
  return { execution, rollback, preview, evidence };
}

describe("renewal comp-screenshot immutable binding", () => {
  it("binds exact bytes, source name, actor, lease records, folder, provider, and environment", () => {
    const baseline = buildCompScreenshotPreview(previewInput());
    const otherLease = compScreenshotRecordIdentity("lease_fixture_beta");
    const otherBytes = new Uint8Array([...PNG_BYTES, 0x01]);
    const changes: Array<[string, Partial<PreviewInput>]> = [
      [
        "decoded bytes",
        {
          contentSha256: hashCompScreenshotBytes(otherBytes, "sha256"),
          contentMd5: hashCompScreenshotBytes(otherBytes, "md5"),
          sizeBytes: otherBytes.byteLength,
        },
      ],
      [
        "source filename",
        { sourceFilenameHash: hashCompScreenshotFilename("fixture-comp-beta.png") },
      ],
      ["actor", { actorUid: "actor_fixture_second" }],
      ["lease records", otherLease],
      ["folder", { folderId: "folder_fixture_beta" }],
      ["provider identity", { providerIdentityHash: "b".repeat(64) }],
      [
        "environment descriptor",
        {
          descriptor: {
            environmentKind: "production",
            dataContext: "live",
            source: "legacy-node-env",
          },
        },
      ],
    ];

    for (const [label, change] of changes) {
      const changed = buildCompScreenshotPreview(previewInput(change));
      expect(changed.bindingHash, label).not.toBe(baseline.bindingHash);
      expect(changed.id, label).not.toBe(baseline.id);
    }

    // Actor identity is exact-confirmation state but not global effect identity: two actors cannot mint
    // parallel Drive files for the same exact evidence-slot payload.
    const otherActor = buildCompScreenshotPreview(
      previewInput({ actorUid: "actor_fixture_second" }),
    );
    expect(otherActor.executionId).toBe(baseline.executionId);
  });

  it("derives opaque lease/comp identities and keeps bytes, raw filename, and lease ID out of durable records", async () => {
    const store = new MemoryCompScreenshotExecutionStore();
    const preview = buildCompScreenshotPreview(previewInput());
    const claim = await claimPreview(store, preview);
    expect(claim.status).toBe("claimed");
    if (claim.status !== "claimed") throw new Error("Expected a claimed fixture.");

    const durable = JSON.stringify({
      previews: [...store.previews.values()],
      executions: [...store.executions.values()],
    });
    const rawBase64 = Buffer.from(PNG_BYTES).toString("base64");
    expect(durable).not.toContain(LEASE_ID);
    expect(durable).not.toContain(SOURCE_FILENAME);
    expect(durable).not.toContain(rawBase64);
    expect(durable).not.toContain('"bytes"');
    expect(durable).not.toContain('"base64"');
    expect(durable).not.toContain('"filename"');
    expect(claim.record.sourceFilenameHash).toBe(
      hashCompScreenshotFilename(SOURCE_FILENAME),
    );
    expect(claim.record.driveFilename).toMatch(/^renewal-comp-[a-f0-9]{24}\.png$/);
    expect(claim.record.driveFilename).not.toContain("fixture");
  });

  it("produces a complete bodyless execution record from the exact preview", () => {
    const preview = buildCompScreenshotPreview(previewInput());
    const record = compScreenshotExecutionFromPreview(preview, NOW_MS);

    expect(record).toMatchObject({
      id: preview.executionId,
      bindingHash: preview.bindingHash,
      actorUid: ACTOR_UID,
      folderId: FOLDER_ID,
      providerIdentityHash: PROVIDER_IDENTITY_HASH,
      contentSha256: preview.binding.contentSha256,
      contentMd5: preview.binding.contentMd5,
      sourceFilenameHash: preview.binding.sourceFilenameHash,
      mimeType: "image/png",
      sizeBytes: PNG_BYTES.byteLength,
      descriptor: PRODUCTION_LIVE,
      previewHash: preview.id,
      state: "claimed",
      attemptCount: 1,
    });
    expect(Object.keys(record)).not.toEqual(
      expect.arrayContaining(["bytes", "base64", "filename", "leaseId"]),
    );
  });
});

describe("renewal comp-screenshot receipt integrity", () => {
  it("binds canUntrash into the stored screenshot result hash", () => {
    const { record, evidence } = receiptableExecution();
    const baseline = buildCompScreenshotReceipt(record, evidence, false);
    const changed = buildCompScreenshotReceipt(
      record,
      { ...evidence, canUntrash: false },
      false,
    );

    expect(changed.resultHash).not.toBe(baseline.resultHash);
  });

  it("binds webViewLink and normalizes an absent link to null", () => {
    const { record, evidence } = receiptableExecution();
    const baseline = buildCompScreenshotReceipt(record, evidence, false);
    const changed = buildCompScreenshotReceipt(
      record,
      {
        ...evidence,
        webViewLink:
          "https://drive.google.com/file/d/drive_file_receipt_integrity/preview",
      },
      false,
    );
    const withoutWebViewLink = { ...evidence };
    delete withoutWebViewLink.webViewLink;
    const absent = buildCompScreenshotReceipt(record, withoutWebViewLink, false);
    const explicitlyUndefined = buildCompScreenshotReceipt(
      record,
      { ...withoutWebViewLink, webViewLink: undefined },
      false,
    );

    expect(changed.resultHash).not.toBe(baseline.resultHash);
    expect(absent.resultHash).not.toBe(baseline.resultHash);
    expect(explicitlyUndefined.resultHash).toBe(absent.resultHash);
  });

  it("binds canUntrash into the rollback result hash", () => {
    const { execution, rollback, preview, evidence } = rollbackReceiptFixture();
    const baseline = buildCompScreenshotRollbackReceipt(
      execution,
      rollback,
      preview,
      evidence,
      false,
    );
    const changed = buildCompScreenshotRollbackReceipt(
      execution,
      rollback,
      preview,
      { ...evidence, canUntrash: false },
      false,
    );

    expect(changed.resultHash).not.toBe(baseline.resultHash);
  });

  it("binds the provider timestamp exposed as rollback createdAt", () => {
    const { execution, rollback, preview, evidence } = rollbackReceiptFixture();
    const baseline = buildCompScreenshotRollbackReceipt(
      execution,
      rollback,
      preview,
      evidence,
      false,
    );
    const changed = buildCompScreenshotRollbackReceipt(
      execution,
      rollback,
      preview,
      { ...evidence, providerTimestamp: "2026-07-30T02:00:04.000Z" },
      false,
    );

    expect(baseline.createdAt).toBe(evidence.providerTimestamp);
    expect(changed.resultHash).not.toBe(baseline.resultHash);
  });
});

describe("MemoryCompScreenshotExecutionStore rollback callback convergence", () => {
  it("returns a newer durable success to an older same-lineage callback and rejects conflicts", async () => {
    const store = new MemoryCompScreenshotExecutionStore();
    const { execution, preview: firstPreview, evidence } = rollbackReceiptFixture();
    store.executions.set(execution.id, structuredClone(execution));
    store.heads.set(execution.compRecordHash, execution.id);
    await store.createRollbackPreview(firstPreview);

    const firstClaim = await store.claimRollback({
      previewHash: firstPreview.id,
      rollbackId: firstPreview.rollbackId,
      executionId: execution.id,
      leaseId: LEASE_ID,
      actorUid: ACTOR_UID,
      nowMs: NOW_MS + 2_001,
    });
    expect(firstClaim.status).toBe("claimed");
    if (firstClaim.status !== "claimed") {
      throw new Error("Expected the first rollback claim.");
    }
    await store.markRollbackAmbiguous({
      executionId: execution.id,
      rollbackId: firstClaim.rollback.id,
      previewHash: firstClaim.rollback.previewHash,
      dispatchGeneration: firstClaim.dispatchGeneration,
      nowMs: NOW_MS + 2_002,
    });

    const refreshedPreview = refreshCompScreenshotRollbackPreview(
      firstPreview,
      NOW_MS + 2_003,
      "nonce_fixture_rollback_callback_refreshed",
    );
    expect(refreshedPreview.rollbackId).toBe(firstPreview.rollbackId);
    expect(refreshedPreview.id).not.toBe(firstPreview.id);
    await store.createRollbackPreview(refreshedPreview);
    const retry = await store.claimRollback({
      previewHash: refreshedPreview.id,
      rollbackId: refreshedPreview.rollbackId,
      executionId: execution.id,
      leaseId: LEASE_ID,
      actorUid: ACTOR_UID,
      nowMs: NOW_MS + 2_004,
    });
    expect(retry.status).toBe("retry");
    if (retry.status !== "retry") throw new Error("Expected rollback retry.");
    await expect(
      store.markRollbackFailed({
        executionId: execution.id,
        rollbackId: firstClaim.rollback.id,
        previewHash: firstClaim.rollback.previewHash,
        dispatchGeneration: firstClaim.dispatchGeneration,
        nowMs: NOW_MS + 2_005,
      }),
    ).resolves.toBe(false);
    await expect(store.getExecution(execution.id)).resolves.toMatchObject({
      rollback: {
        previewHash: refreshedPreview.id,
        state: "running",
        dispatchGeneration: 2,
      },
    });

    const staleReceipt = buildCompScreenshotRollbackReceipt(
      firstClaim.record,
      firstClaim.rollback,
      firstPreview,
      evidence,
      false,
    );
    const currentReceipt = buildCompScreenshotRollbackReceipt(
      retry.record,
      retry.rollback,
      refreshedPreview,
      {
        ...evidence,
        providerMetadataHashAfter: "1".repeat(64),
        versionAfter: "5",
        providerTimestamp: "2026-07-30T02:00:05.000Z",
      },
      true,
    );
    await expect(
      store.finishRollback(execution.id, retry.dispatchGeneration, currentReceipt),
    ).resolves.toEqual(currentReceipt);
    await expect(
      store.claimRollback({
        previewHash: firstPreview.id,
        rollbackId: firstPreview.rollbackId,
        executionId: execution.id,
        leaseId: LEASE_ID,
        actorUid: ACTOR_UID,
        nowMs: NOW_MS + 2_006,
      }),
    ).resolves.toMatchObject({ status: "mismatch" });
    await expect(
      store.finishRollback(execution.id, firstClaim.dispatchGeneration, staleReceipt),
    ).resolves.toEqual(currentReceipt);

    await expect(
      store.finishRollback(execution.id, retry.dispatchGeneration, {
        ...currentReceipt,
        providerMetadataHashAfter: "2".repeat(64),
        resultHash: "3".repeat(64),
      }),
    ).rejects.toThrow("conflicting receipt");
    await expect(
      store.finishRollback(execution.id, firstClaim.dispatchGeneration, {
        ...staleReceipt,
        fileId: "drive_file_conflicting_lineage",
        resultHash: "4".repeat(64),
      }),
    ).rejects.toThrow("conflicting receipt");
  });

  it("starts generation one on a new provider or actor lineage only after verified failure", async () => {
    const store = new MemoryCompScreenshotExecutionStore();
    const { execution, preview: firstPreview } = rollbackReceiptFixture();
    store.executions.set(execution.id, structuredClone(execution));
    store.heads.set(execution.compRecordHash, execution.id);
    await store.createRollbackPreview(firstPreview);
    const firstClaim = await store.claimRollback({
      previewHash: firstPreview.id,
      rollbackId: firstPreview.rollbackId,
      executionId: execution.id,
      leaseId: LEASE_ID,
      actorUid: ACTOR_UID,
      nowMs: NOW_MS + 2_001,
    });
    if (firstClaim.status !== "claimed") {
      throw new Error("Expected the first rollback claim.");
    }
    await store.markRollbackFailed({
      executionId: execution.id,
      rollbackId: firstClaim.rollback.id,
      previewHash: firstClaim.rollback.previewHash,
      dispatchGeneration: firstClaim.dispatchGeneration,
      nowMs: NOW_MS + 2_002,
    });

    const providerChanged = buildCompScreenshotRollbackPreview({
      actorUid: ACTOR_UID,
      execution,
      providerIdentityHash: PROVIDER_IDENTITY_HASH,
      providerMetadataHash: "7".repeat(64),
      providerVersion: "9",
      providerHeadRevisionId: "revision_provider_changed",
      canTrash: true,
      canUntrash: true,
      descriptor: PRODUCTION_LIVE,
      providerDriftedSinceReceipt: true,
      nowMs: NOW_MS + 2_003,
      nonce: "nonce_fixture_provider_changed_lineage",
    });
    expect(providerChanged.rollbackId).not.toBe(firstPreview.rollbackId);
    await store.createRollbackPreview(providerChanged);
    const providerClaim = await store.claimRollback({
      previewHash: providerChanged.id,
      rollbackId: providerChanged.rollbackId,
      executionId: execution.id,
      leaseId: LEASE_ID,
      actorUid: ACTOR_UID,
      nowMs: NOW_MS + 2_004,
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
      throw new Error("Expected the provider-changed claim.");
    }
    await expect(
      store.markRollbackAmbiguous({
        executionId: execution.id,
        rollbackId: firstClaim.rollback.id,
        previewHash: firstClaim.rollback.previewHash,
        dispatchGeneration: firstClaim.dispatchGeneration,
        nowMs: NOW_MS + 2_005,
      }),
    ).resolves.toBe(false);
    await expect(store.getExecution(execution.id)).resolves.toMatchObject({
      rollback: {
        id: providerChanged.rollbackId,
        previewHash: providerChanged.id,
        state: "running",
        dispatchGeneration: 1,
      },
    });
    await store.markRollbackFailed({
      executionId: execution.id,
      rollbackId: providerClaim.rollback.id,
      previewHash: providerClaim.rollback.previewHash,
      dispatchGeneration: providerClaim.dispatchGeneration,
      nowMs: NOW_MS + 2_005,
    });

    const nextActorUid = "actor_fixture_admin_reconfirmer";
    const actorChanged = buildCompScreenshotRollbackPreview({
      actorUid: nextActorUid,
      execution,
      providerIdentityHash: PROVIDER_IDENTITY_HASH,
      providerMetadataHash: providerChanged.binding.providerMetadataHash,
      providerVersion: providerChanged.binding.providerVersion,
      providerHeadRevisionId: providerChanged.binding.providerHeadRevisionId,
      canTrash: true,
      canUntrash: providerChanged.binding.canUntrash,
      descriptor: providerChanged.binding.descriptor,
      providerDriftedSinceReceipt: true,
      nowMs: NOW_MS + 2_006,
      nonce: "nonce_fixture_actor_changed_lineage",
    });
    expect(actorChanged.rollbackId).toBe(providerChanged.rollbackId);
    expect(actorChanged.bindingHash).not.toBe(providerChanged.bindingHash);
    await store.createRollbackPreview(actorChanged);
    const actorClaim = await store.claimRollback({
      previewHash: actorChanged.id,
      rollbackId: actorChanged.rollbackId,
      executionId: execution.id,
      leaseId: LEASE_ID,
      actorUid: nextActorUid,
      nowMs: NOW_MS + 2_007,
    });
    expect(actorClaim).toMatchObject({
      status: "claimed",
      dispatchGeneration: 1,
      rollback: {
        actorUid: nextActorUid,
        bindingHash: actorChanged.bindingHash,
        attemptCount: 1,
      },
    });

    const forbiddenWhileRunning = buildCompScreenshotRollbackPreview({
      actorUid: "actor_fixture_running_conflict",
      execution,
      providerIdentityHash: PROVIDER_IDENTITY_HASH,
      providerMetadataHash: providerChanged.binding.providerMetadataHash,
      providerVersion: providerChanged.binding.providerVersion,
      providerHeadRevisionId: providerChanged.binding.providerHeadRevisionId,
      canTrash: true,
      canUntrash: providerChanged.binding.canUntrash,
      descriptor: providerChanged.binding.descriptor,
      providerDriftedSinceReceipt: true,
      nowMs: NOW_MS + 2_008,
      nonce: "nonce_fixture_running_lineage_conflict",
    });
    await store.createRollbackPreview(forbiddenWhileRunning);
    await expect(
      store.claimRollback({
        previewHash: forbiddenWhileRunning.id,
        rollbackId: forbiddenWhileRunning.rollbackId,
        executionId: execution.id,
        leaseId: LEASE_ID,
        actorUid: forbiddenWhileRunning.binding.actorUid,
        nowMs: NOW_MS + 2_009,
      }),
    ).resolves.toMatchObject({
      status: "mismatch",
      record: {
        rollback: {
          actorUid: nextActorUid,
          bindingHash: actorChanged.bindingHash,
          state: "running",
        },
      },
    });
  });

  it("binds a cross-Admin recovery actor outside the original effect lineage", async () => {
    const store = new MemoryCompScreenshotExecutionStore();
    const { execution, preview: originalPreview } = rollbackReceiptFixture();
    store.executions.set(execution.id, structuredClone(execution));
    await store.createRollbackPreview(originalPreview);
    const originalClaim = await store.claimRollback({
      previewHash: originalPreview.id,
      rollbackId: originalPreview.rollbackId,
      executionId: execution.id,
      leaseId: LEASE_ID,
      actorUid: ACTOR_UID,
      nowMs: NOW_MS + 2_001,
    });
    if (originalClaim.status !== "claimed") {
      throw new Error("Expected the original rollback claim.");
    }
    await store.markRollbackAmbiguous({
      executionId: execution.id,
      rollbackId: originalClaim.rollback.id,
      previewHash: originalClaim.rollback.previewHash,
      dispatchGeneration: originalClaim.dispatchGeneration,
      nowMs: NOW_MS + 2_002,
    });

    const recoveryActorUid = "actor_fixture_recovery_admin";
    const recoveryPreview = refreshCompScreenshotRollbackPreview(
      originalPreview,
      NOW_MS + 2_003,
      "nonce_fixture_cross_admin_recovery",
      recoveryActorUid,
    );
    expect(recoveryPreview.recoveryActorUid).toBe(recoveryActorUid);
    expect(recoveryPreview.binding).toEqual(originalPreview.binding);
    expect(recoveryPreview.bindingHash).toBe(originalPreview.bindingHash);
    expect(recoveryPreview.rollbackId).toBe(originalPreview.rollbackId);
    await store.createRollbackPreview(recoveryPreview);

    await expect(
      store.claimRollback({
        previewHash: recoveryPreview.id,
        rollbackId: recoveryPreview.rollbackId,
        executionId: execution.id,
        leaseId: LEASE_ID,
        actorUid: ACTOR_UID,
        nowMs: NOW_MS + 2_004,
        observedExplicitTrash: true,
      }),
    ).resolves.toMatchObject({ status: "mismatch" });
    await expect(
      store.claimRollback({
        previewHash: recoveryPreview.id,
        rollbackId: recoveryPreview.rollbackId,
        executionId: execution.id,
        leaseId: LEASE_ID,
        actorUid: recoveryActorUid,
        nowMs: NOW_MS + 2_004,
      }),
    ).resolves.toMatchObject({ status: "mismatch" });

    const recovered = await store.claimRollback({
      previewHash: recoveryPreview.id,
      rollbackId: recoveryPreview.rollbackId,
      executionId: execution.id,
      leaseId: LEASE_ID,
      actorUid: recoveryActorUid,
      nowMs: NOW_MS + 2_004,
      observedExplicitTrash: true,
    });
    expect(recovered).toMatchObject({
      status: "retry",
      dispatchGeneration: originalClaim.dispatchGeneration + 1,
      rollback: {
        actorUid: ACTOR_UID,
        bindingHash: originalPreview.bindingHash,
        previewHash: recoveryPreview.id,
      },
    });
  });
});

describe("MemoryCompScreenshotExecutionStore claim and reservation races", () => {
  it("expires only the first claim while an already claimed execution remains recoverable after preview expiry", async () => {
    const expiredStore = new MemoryCompScreenshotExecutionStore();
    const expiredPreview = buildCompScreenshotPreview(previewInput());
    await expiredStore.createPreview(expiredPreview);
    expect(
      await expiredStore.claim({
        previewHash: expiredPreview.id,
        executionId: expiredPreview.executionId,
        actorUid: ACTOR_UID,
        nowMs: expiredPreview.expiresAtMs,
      }),
    ).toEqual({ status: "expired" });
    expect(await expiredStore.getExecution(expiredPreview.executionId)).toBeNull();

    const recoveryStore = new MemoryCompScreenshotExecutionStore();
    const recoveryPreview = buildCompScreenshotPreview(
      previewInput({ nonce: "nonce_fixture_recovery" }),
    );
    const first = await claimPreview(recoveryStore, recoveryPreview);
    expect(first.status).toBe("claimed");
    const recovered = await recoveryStore.claim({
      previewHash: recoveryPreview.id,
      executionId: recoveryPreview.executionId,
      actorUid: ACTOR_UID,
      nowMs: NOW_MS + COMP_SCREENSHOT_PREVIEW_TTL_MS + 1,
    });
    expect(recovered.status).toBe("in_progress");
    expect(recovered.record?.state).toBe("claimed");
  });

  it("allows one head winner when different bytes race for the same evidence slot", async () => {
    const store = new MemoryCompScreenshotExecutionStore();
    const first = buildCompScreenshotPreview(
      previewInput({ nonce: "nonce_fixture_head_a" }),
    );
    const changedBytes = new Uint8Array([...PNG_BYTES, 0x02]);
    const second = buildCompScreenshotPreview(
      previewInput({
        contentSha256: hashCompScreenshotBytes(changedBytes, "sha256"),
        contentMd5: hashCompScreenshotBytes(changedBytes, "md5"),
        sizeBytes: changedBytes.byteLength,
        nonce: "nonce_fixture_head_b",
      }),
    );
    await Promise.all([store.createPreview(first), store.createPreview(second)]);

    const results = await Promise.all([
      store.claim({
        previewHash: first.id,
        executionId: first.executionId,
        actorUid: ACTOR_UID,
        nowMs: NOW_MS,
      }),
      store.claim({
        previewHash: second.id,
        executionId: second.executionId,
        actorUid: ACTOR_UID,
        nowMs: NOW_MS,
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "claimed",
      "mismatch",
    ]);
    const latest = await store.getLatestExecution(first.binding.compRecordHash);
    expect(latest?.id).toBe(
      results.find((result) => result.status === "claimed")?.record?.id,
    );
    expect(store.executions.size).toBe(1);
  });

  it("CASes one reserved Drive ID and returns the winner to the generated-ID loser", async () => {
    const store = new MemoryCompScreenshotExecutionStore();
    const preview = buildCompScreenshotPreview(
      previewInput({ nonce: "nonce_fixture_reservation" }),
    );
    const claim = await claimPreview(store, preview);
    expect(claim.status).toBe("claimed");
    await bindFolderEvidence(store, preview.executionId);

    const candidateA = "drive_candidate_fixture_a";
    const candidateB = "drive_candidate_fixture_b";
    const reservations = await Promise.all([
      store.reserveFileId(preview.executionId, candidateA, NOW_MS + 1),
      store.reserveFileId(preview.executionId, candidateB, NOW_MS + 1),
    ]);
    expect(reservations.map((result) => result.status).sort()).toEqual([
      "existing",
      "reserved",
    ]);

    const record = await store.getExecution(preview.executionId);
    expect(record?.reservedFileId).toBe(candidateA);
    const existing = reservations.find((result) => result.status === "existing");
    if (!existing || existing.status !== "existing") {
      throw new Error("Expected the losing reservation to return the existing ID.");
    }
    expect(existing.fileId).toBe(candidateA);
    expect(record?.reservedFileId).not.toBe(candidateB);
  });

  it("leases one dispatch generation and rejects stale generation callbacks", async () => {
    const store = new MemoryCompScreenshotExecutionStore();
    const preview = buildCompScreenshotPreview(
      previewInput({ nonce: "nonce_fixture_dispatch_lease" }),
    );
    const claim = await claimPreview(store, preview);
    expect(claim.status).toBe("claimed");
    await bindFolderEvidence(store, preview.executionId);
    const fileId = "drive_candidate_dispatch_lease";
    await store.reserveFileId(preview.executionId, fileId, NOW_MS + 1);

    const starts = await Promise.all([
      store.beginUpload(preview.executionId, NOW_MS + 2),
      store.beginUpload(preview.executionId, NOW_MS + 2),
    ]);
    expect(starts.map((result) => result.status).sort()).toEqual([
      "in_progress",
      "started",
    ]);
    expect(starts.every((result) => "fileId" in result && result.fileId === fileId)).toBe(
      true,
    );
    const started = starts.find((result) => result.status === "started");
    if (!started || started.status !== "started") {
      throw new Error("Expected one dispatch lease winner.");
    }
    expect(started.dispatchGeneration).toBe(1);
    expect(started.dispatchLeaseExpiresAtMs).toBe(
      NOW_MS + 2 + COMP_SCREENSHOT_UPLOAD_DISPATCH_LEASE_MS,
    );

    await expect(
      store.markAmbiguous({
        executionId: preview.executionId,
        dispatchGeneration: started.dispatchGeneration,
        nowMs: NOW_MS + 3,
      }),
    ).resolves.toBe(true);
    const retry = await store.beginUpload(preview.executionId, NOW_MS + 4);
    expect(retry).toMatchObject({
      status: "retry",
      fileId,
      dispatchGeneration: 2,
    });
    await expect(
      store.markAmbiguous({
        executionId: preview.executionId,
        dispatchGeneration: started.dispatchGeneration,
        nowMs: NOW_MS + 5,
      }),
    ).resolves.toBe(false);
    await expect(
      store.markDeterministicNoEffect({
        executionId: preview.executionId,
        dispatchGeneration: started.dispatchGeneration,
        nowMs: NOW_MS + 5,
      }),
    ).resolves.toBe(false);
    await expect(store.getExecution(preview.executionId)).resolves.toMatchObject({
      state: "upload_started",
      reservedFileId: fileId,
      dispatchGeneration: 2,
    });
  });

  it("recovers an expired lease on the same reserved ID without changing logical attempt", async () => {
    const store = new MemoryCompScreenshotExecutionStore();
    const preview = buildCompScreenshotPreview(
      previewInput({ nonce: "nonce_fixture_stale_dispatch" }),
    );
    await claimPreview(store, preview);
    await bindFolderEvidence(store, preview.executionId);
    const fileId = "drive_candidate_stale_dispatch";
    await store.reserveFileId(preview.executionId, fileId, NOW_MS + 1);
    const first = await store.beginUpload(preview.executionId, NOW_MS + 2);
    expect(first.status).toBe("started");
    const retry = await store.beginUpload(
      preview.executionId,
      NOW_MS + 2 + COMP_SCREENSHOT_UPLOAD_DISPATCH_LEASE_MS,
    );
    expect(retry).toMatchObject({
      status: "retry",
      fileId,
      dispatchGeneration: 2,
      record: {
        attemptCount: 1,
        reservedFileId: fileId,
      },
    });
  });
});
