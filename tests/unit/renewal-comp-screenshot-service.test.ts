import { describe, expect, it, vi } from "vitest";

const runtimeSuspension = vi.hoisted(() => ({
  current: { status: "clear" } as { status: string },
  read: vi.fn(),
}));
vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: runtimeSuspension.read.mockImplementation(
    async () => runtimeSuspension.current,
  ),
}));

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import {
  type CreateReservedRenewalCompScreenshotInput,
  type RenewalCompScreenshotDriveFile,
  type RenewalCompScreenshotDriveProvider,
  type RenewalCompScreenshotFolderReadOutcome,
  type RenewalCompScreenshotMutationOutcome,
  type RenewalCompScreenshotReadOutcome,
  type RenewalCompScreenshotReserveOutcome,
} from "@/lib/google-drive/renewal-comp-screenshot";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  COMP_SCREENSHOT_PREVIEW_TTL_MS,
  COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS,
  COMP_SCREENSHOT_UPLOAD_DISPATCH_LEASE_MS,
  MemoryCompScreenshotExecutionStore,
  buildCompScreenshotRollbackReceipt,
  hashCompScreenshotBytes,
  refreshCompScreenshotRollbackPreview,
  type CompScreenshotPreviewRecord,
} from "@/lib/lease-renewal/comp-screenshot-contract";
import { RENEWAL_COMP_SCREENSHOT_ACTION_KEY } from "@/lib/lease-renewal/comp-screenshot-action";
import {
  CompScreenshotContractError,
  commitCompScreenshot,
  commitCompScreenshotRollback,
  getCompScreenshotStatusForLease,
  getReceiptedCompScreenshotForLease,
  previewCompScreenshot,
  previewCompScreenshotRollback,
  reconcileCompScreenshot,
  resumeCompScreenshot,
  type CompScreenshotCommitInput,
  type CompScreenshotExecutionContext,
  type CompScreenshotFileInput,
  type CompScreenshotServiceDeps,
  type CompScreenshotStoreOutcome,
} from "@/lib/lease-renewal/comp-screenshot-service";
import { ActionRuntimeSuspendedError } from "@/lib/operations/runtime-suspension-gate";

const NOW_MS = Date.parse("2026-07-30T03:00:00.000Z");
const PROVIDER_CREATED_AT = "2026-07-30T03:01:00.000Z";
const PROVIDER_TRASHED_AT = "2026-07-30T03:02:00.000Z";
const FOLDER_ID = "folder_fixture_screenshot";
const OTHER_FOLDER_ID = "folder_fixture_other";
const SHARED_DRIVE_ID = "shared_drive_fixture_alpha";
const OTHER_SHARED_DRIVE_ID = "shared_drive_fixture_beta";
const PROVIDER_IDENTITY_HASH = "c".repeat(64);
const FILE_ID = "drive_file_fixture_primary";
const ACTOR: AuthenticatedUser = {
  uid: "actor_fixture_editor",
  email: "fixture.editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const OTHER_ACTOR: AuthenticatedUser = {
  ...ACTOR,
  uid: "actor_fixture_second",
  email: "fixture.second@pmikcmetro.com",
};
const PRODUCTION_LIVE: EnvironmentDescriptor = {
  environmentKind: "production",
  dataContext: "live",
  source: "explicit",
};
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
  0x44, 0x52, 0x53, 0x59, 0x4e, 0x54, 0x48, 0x45, 0x54, 0x49, 0x43, 0x2d, 0x41,
]);
const OTHER_PNG_BYTES = new Uint8Array([...PNG_BYTES, 0x02]);
const FILE_INPUT: CompScreenshotFileInput = {
  leaseId: "lease_fixture_alpha",
  filename: "fixture-comp-alpha.png",
  mimeType: "image/png",
  base64: Buffer.from(PNG_BYTES).toString("base64"),
};

type PreviewOutcome = Extract<CompScreenshotStoreOutcome, { status: "preview" }>;
type ReadTransform = (
  fileId: string,
  current: RenewalCompScreenshotDriveFile | undefined,
) => RenewalCompScreenshotReadOutcome;

function cloneFile(file: RenewalCompScreenshotDriveFile) {
  return structuredClone(file);
}

function driveFileFromCreate(
  input: CreateReservedRenewalCompScreenshotInput,
): RenewalCompScreenshotDriveFile {
  return {
    id: input.fileId,
    name: input.name,
    mimeType: input.mimeType,
    size: String(input.bytes.byteLength),
    md5Checksum: hashCompScreenshotBytes(input.bytes, "md5"),
    sha256Checksum: hashCompScreenshotBytes(input.bytes, "sha256"),
    parents: [input.parentFolderId],
    trashed: false,
    explicitlyTrashed: false,
    appProperties: { ...input.appProperties },
    createdTime: PROVIDER_CREATED_AT,
    modifiedTime: PROVIDER_CREATED_AT,
    version: "1",
    headRevisionId: `head_${input.fileId}`,
    webViewLink: `https://drive.google.test/file/d/${input.fileId}/view`,
    isAppAuthorized: true,
    ownedByMe: true,
    capabilities: {
      canTrash: true,
      canUntrash: true,
      canMoveItemOutOfDrive: false,
    },
  };
}

class FakeDriveProvider implements RenewalCompScreenshotDriveProvider {
  readonly files = new Map<string, RenewalCompScreenshotDriveFile>();
  readonly createdInputs: CreateReservedRenewalCompScreenshotInput[] = [];
  readonly reserveIds: string[] = [FILE_ID];
  readonly createOutcomes: RenewalCompScreenshotMutationOutcome[] = [];
  readonly readTransforms: ReadTransform[] = [];
  readonly trashOutcomes: RenewalCompScreenshotMutationOutcome[] = [];

  readonly reserveFileId = vi.fn(
    async (): Promise<RenewalCompScreenshotReserveOutcome> => {
      const fileId =
        this.reserveIds.shift() ??
        `drive_file_fixture_generated_${this.reserveFileId.mock.calls.length}`;
      return { outcome: "reserved", fileId };
    },
  );

  readonly getFolder = vi.fn(
    async (folderId: string): Promise<RenewalCompScreenshotFolderReadOutcome> => ({
      outcome: "found",
      httpStatus: 200,
      folder: {
        id: folderId,
        mimeType: "application/vnd.google-apps.folder",
        trashed: false,
        version: "1",
        isAppAuthorized: true,
        ownedByMe: true,
        capabilities: { canAddChildren: true },
      },
    }),
  );

  readonly createReservedFile = vi.fn(
    async (
      input: CreateReservedRenewalCompScreenshotInput,
    ): Promise<RenewalCompScreenshotMutationOutcome> => {
      const captured: CreateReservedRenewalCompScreenshotInput = {
        ...input,
        appProperties: { ...input.appProperties },
        bytes: new Uint8Array(input.bytes),
      };
      this.createdInputs.push(captured);
      const queued = this.createOutcomes.shift();
      if (queued) {
        if (queued.outcome === "accepted") {
          this.files.set(queued.file.id, cloneFile(queued.file));
        }
        return structuredClone(queued);
      }
      const file = driveFileFromCreate(captured);
      this.files.set(file.id, cloneFile(file));
      return { outcome: "accepted", httpStatus: 201, file: cloneFile(file) };
    },
  );

  readonly getFile = vi.fn(
    async (fileId: string): Promise<RenewalCompScreenshotReadOutcome> => {
      const current = this.files.get(fileId);
      const transform = this.readTransforms.shift();
      if (transform) return transform(fileId, current ? cloneFile(current) : undefined);
      return current
        ? { outcome: "found", httpStatus: 200, file: cloneFile(current) }
        : { outcome: "absent", httpStatus: 404 };
    },
  );

  readonly downloadFile = vi.fn(async (fileId: string) => {
    const created = [...this.createdInputs]
      .reverse()
      .find((input) => input.fileId === fileId);
    return created
      ? {
          outcome: "downloaded" as const,
          httpStatus: 200,
          contentType: created.mimeType,
          bytes: new Uint8Array(created.bytes),
        }
      : { outcome: "absent" as const, httpStatus: 404 as const };
  });

  readonly trashFile = vi.fn(
    async (fileId: string): Promise<RenewalCompScreenshotMutationOutcome> => {
      const queued = this.trashOutcomes.shift();
      if (queued) {
        if (queued.outcome === "accepted") {
          this.files.set(queued.file.id, cloneFile(queued.file));
        }
        return structuredClone(queued);
      }
      const current = this.files.get(fileId);
      if (!current) {
        return {
          outcome: "rejected",
          certainty: "not_applied",
          reason: "http",
          httpStatus: 404,
        };
      }
      const numericVersion = Number(current.version);
      const trashed: RenewalCompScreenshotDriveFile = {
        ...current,
        trashed: true,
        explicitlyTrashed: true,
        modifiedTime: PROVIDER_TRASHED_AT,
        version: Number.isFinite(numericVersion) ? String(numericVersion + 1) : "2",
        capabilities: {
          ...current.capabilities,
          canTrash: true,
          canUntrash: true,
        },
      };
      this.files.set(fileId, cloneFile(trashed));
      return { outcome: "accepted", httpStatus: 200, file: cloneFile(trashed) };
    },
  );
}

function openRegistry(): CreateActionRegistryInput[] {
  const entry = ACTION_REGISTRY_SEED.find(
    (candidate) => candidate.key === RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
  );
  if (!entry) throw new Error("Expected the committed screenshot action entry.");
  return [
    {
      ...entry,
      readiness: "Approved for Execution",
      evidence_status: "Documented",
      production_allowed: true,
    },
  ];
}

function createHarness(provider = new FakeDriveProvider()) {
  let nowMs = NOW_MS;
  let nonce = 0;
  const store = new MemoryCompScreenshotExecutionStore();
  const createProvider = vi.fn(() => provider);
  const deps: CompScreenshotServiceDeps = {
    store,
    folderId: FOLDER_ID,
    providerIdentityHash: PROVIDER_IDENTITY_HASH,
    createProvider,
    now: () => new Date(nowMs),
    nonce: () => `nonce_fixture_${++nonce}`,
  };
  const context: CompScreenshotExecutionContext = {
    descriptor: PRODUCTION_LIVE,
    registry: openRegistry(),
  };
  return {
    provider,
    store,
    deps,
    context,
    createProvider,
    advance(ms: number) {
      nowMs += ms;
    },
  };
}

async function prepare(
  harness: ReturnType<typeof createHarness>,
  input: CompScreenshotFileInput = FILE_INPUT,
  actor: AuthenticatedUser = ACTOR,
): Promise<{ outcome: PreviewOutcome; commitInput: CompScreenshotCommitInput }> {
  const outcome = await previewCompScreenshot(
    actor,
    input,
    harness.deps,
    harness.context,
  );
  if (outcome.status !== "preview") {
    throw new Error(`Expected preview, received ${outcome.status}.`);
  }
  return {
    outcome,
    commitInput: {
      ...input,
      executionId: outcome.preview.executionId,
      previewHash: outcome.preview.previewHash,
    },
  };
}

async function deliver(
  harness: ReturnType<typeof createHarness>,
  input: CompScreenshotFileInput = FILE_INPUT,
) {
  const prepared = await prepare(harness, input);
  const outcome = await commitCompScreenshot(
    ACTOR,
    prepared.commitInput,
    harness.deps,
    harness.context,
  );
  if (outcome.status !== "delivered") {
    throw new Error(`Expected delivered, received ${outcome.status}.`);
  }
  return { prepared, outcome };
}

async function expectContractError(
  promise: Promise<unknown>,
  code: CompScreenshotContractError["code"],
) {
  try {
    await promise;
    throw new Error(`Expected CompScreenshotContractError(${code}).`);
  } catch (error) {
    if (!(error instanceof CompScreenshotContractError)) throw error;
    expect(error.code).toBe(code);
  }
}

function requireStoredPreview(
  preview: PreviewOutcome,
  store: MemoryCompScreenshotExecutionStore,
): Promise<CompScreenshotPreviewRecord> {
  return store.getPreview(preview.preview.previewHash).then((record) => {
    if (!record) throw new Error("Expected stored preview fixture.");
    return record;
  });
}

describe("comp screenshot preview and exact confirmation binding", () => {
  // S51_DYNAMIC_REFUSAL:comp-screenshot-main-provider
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "does not construct Drive for an exact screenshot commit when runtime state is %s",
    async (status) => {
      const harness = createHarness();
      const prepared = await prepare(harness);
      expect(harness.createProvider).not.toHaveBeenCalled();
      runtimeSuspension.current = { status };
      try {
        await expect(
          commitCompScreenshot(
            ACTOR,
            prepared.commitInput,
            harness.deps,
            harness.context,
          ),
        ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);
        expect(harness.createProvider).not.toHaveBeenCalled();
        expect(
          await harness.store.getExecution(prepared.outcome.preview.executionId),
        ).toBeNull();
      } finally {
        runtimeSuspension.current = { status: "clear" };
      }
    },
  );

  it("hashes the exact decoded file and creates no Drive provider during preview", async () => {
    const harness = createHarness();
    const prepared = await prepare(harness);

    expect(harness.createProvider).not.toHaveBeenCalled();
    expect(harness.provider.reserveFileId).not.toHaveBeenCalled();
    expect(harness.provider.createReservedFile).not.toHaveBeenCalled();
    expect(harness.provider.getFile).not.toHaveBeenCalled();
    expect(harness.provider.trashFile).not.toHaveBeenCalled();

    const stored = await requireStoredPreview(prepared.outcome, harness.store);
    expect(stored.binding).toMatchObject({
      actorUid: ACTOR.uid,
      folderId: FOLDER_ID,
      providerIdentityHash: PROVIDER_IDENTITY_HASH,
      contentSha256: hashCompScreenshotBytes(PNG_BYTES, "sha256"),
      contentMd5: hashCompScreenshotBytes(PNG_BYTES, "md5"),
      mimeType: "image/png",
      sizeBytes: PNG_BYTES.byteLength,
      descriptor: PRODUCTION_LIVE,
    });
    const durable = JSON.stringify([...harness.store.previews.values()]);
    expect(durable).not.toContain(FILE_INPUT.leaseId);
    expect(durable).not.toContain(FILE_INPUT.filename);
    expect(durable).not.toContain(FILE_INPUT.base64);
    expect(durable).not.toContain('"bytes"');
    expect(durable).not.toContain('"base64"');
    expect(durable).not.toContain('"filename"');
  });

  it("refuses changed bytes, name, actor, lease, folder, provider identity, or environment before provider construction", async () => {
    const cases = [
      "bytes",
      "name",
      "actor",
      "lease",
      "folder",
      "provider",
      "environment",
    ] as const;

    for (const change of cases) {
      const harness = createHarness();
      const prepared = await prepare(harness);
      let actor = ACTOR;
      const input: CompScreenshotCommitInput = { ...prepared.commitInput };
      let context = harness.context;

      if (change === "bytes") {
        input.base64 = Buffer.from(OTHER_PNG_BYTES).toString("base64");
      } else if (change === "name") {
        input.filename = "fixture-comp-beta.png";
      } else if (change === "actor") {
        actor = OTHER_ACTOR;
      } else if (change === "lease") {
        input.leaseId = "lease_fixture_beta";
      } else if (change === "folder") {
        harness.deps.folderId = OTHER_FOLDER_ID;
      } else if (change === "provider") {
        harness.deps.providerIdentityHash = "d".repeat(64);
      } else {
        context = {
          ...harness.context,
          descriptor: { ...PRODUCTION_LIVE, source: "legacy-node-env" },
        };
      }

      await expectContractError(
        commitCompScreenshot(actor, input, harness.deps, context),
        "preview_stale",
      );
      expect(harness.createProvider, change).not.toHaveBeenCalled();
    }
  });

  it("requires the current folder boundary for an unclaimed first commit", async () => {
    const harness = createHarness();
    const prepared = await prepare(harness);
    harness.deps.folderId = "";

    await expectContractError(
      commitCompScreenshot(ACTOR, prepared.commitInput, harness.deps, harness.context),
      "not_configured",
    );
    expect(harness.createProvider).not.toHaveBeenCalled();
    expect(
      await harness.store.getExecution(prepared.outcome.preview.executionId),
    ).toBeNull();

    const rotated = createHarness();
    rotated.deps.approvedSharedDriveId = SHARED_DRIVE_ID;
    const rotatedPrepared = await prepare(rotated);
    rotated.deps.approvedSharedDriveId = OTHER_SHARED_DRIVE_ID;
    await expectContractError(
      commitCompScreenshot(
        ACTOR,
        rotatedPrepared.commitInput,
        rotated.deps,
        rotated.context,
      ),
      "preview_stale",
    );
    expect(rotated.createProvider).not.toHaveBeenCalled();
  });

  it("reselects an exact persisted attempt without Drive and refuses wrong bytes, actor, or lease", async () => {
    const harness = createHarness();
    harness.deps.approvedSharedDriveId = SHARED_DRIVE_ID;
    const prepared = await prepare(harness);
    const stored = await requireStoredPreview(prepared.outcome, harness.store);
    expect(
      (
        await harness.store.claim({
          previewHash: stored.id,
          executionId: stored.executionId,
          actorUid: ACTOR.uid,
          nowMs: NOW_MS,
        })
      ).status,
    ).toBe("claimed");
    harness.deps.folderId = "";
    harness.deps.approvedSharedDriveId = OTHER_SHARED_DRIVE_ID;

    const resumed = await resumeCompScreenshot(
      ACTOR,
      {
        ...FILE_INPUT,
        executionId: stored.executionId,
      },
      harness.deps,
      harness.context,
    );
    expect(resumed).toEqual({
      status: "resume",
      preview: {
        executionId: stored.executionId,
        previewHash: stored.id,
      },
      file: {
        filename: FILE_INPUT.filename,
        mimeType: FILE_INPUT.mimeType,
        sizeBytes: PNG_BYTES.byteLength,
        targetLabel: "PMI KC in-boundary Drive image folder",
      },
    });
    expect(harness.createProvider).not.toHaveBeenCalled();

    const mismatches = [
      {
        actor: ACTOR,
        input: {
          ...FILE_INPUT,
          base64: Buffer.from(OTHER_PNG_BYTES).toString("base64"),
          executionId: stored.executionId,
        },
      },
      {
        actor: OTHER_ACTOR,
        input: { ...FILE_INPUT, executionId: stored.executionId },
      },
      {
        actor: ACTOR,
        input: {
          ...FILE_INPUT,
          leaseId: "lease_fixture_beta",
          executionId: stored.executionId,
        },
      },
    ];
    for (const mismatch of mismatches) {
      await expectContractError(
        resumeCompScreenshot(
          mismatch.actor,
          mismatch.input,
          harness.deps,
          harness.context,
        ),
        "preview_stale",
      );
    }
    expect(harness.createProvider).not.toHaveBeenCalled();
    expect(harness.provider.reserveFileId).not.toHaveBeenCalled();
    expect(harness.provider.createReservedFile).not.toHaveBeenCalled();
  });

  it("expires an unclaimed preview but recovers an already claimed execution after expiry", async () => {
    const expired = createHarness();
    const expiredPrepared = await prepare(expired);
    expired.advance(COMP_SCREENSHOT_PREVIEW_TTL_MS);
    await expectContractError(
      commitCompScreenshot(
        ACTOR,
        expiredPrepared.commitInput,
        expired.deps,
        expired.context,
      ),
      "preview_expired",
    );
    expect(expired.createProvider).not.toHaveBeenCalled();

    const recovery = createHarness();
    const recoveryPrepared = await prepare(recovery);
    const stored = await requireStoredPreview(recoveryPrepared.outcome, recovery.store);
    expect(
      (
        await recovery.store.claim({
          previewHash: stored.id,
          executionId: stored.executionId,
          actorUid: ACTOR.uid,
          nowMs: NOW_MS,
        })
      ).status,
    ).toBe("claimed");
    recovery.advance(COMP_SCREENSHOT_PREVIEW_TTL_MS + 1);

    const recovered = await commitCompScreenshot(
      ACTOR,
      recoveryPrepared.commitInput,
      recovery.deps,
      recovery.context,
    );
    expect(recovered.status).toBe("delivered");
    expect(recovery.provider.reserveFileId).toHaveBeenCalledTimes(1);
  });

  it("allows one provider effect when different exact bytes race for the same record head", async () => {
    const harness = createHarness();
    const first = await prepare(harness);
    const secondInput: CompScreenshotFileInput = {
      ...FILE_INPUT,
      base64: Buffer.from(OTHER_PNG_BYTES).toString("base64"),
    };
    const second = await prepare(harness, secondInput);

    const results = await Promise.allSettled([
      commitCompScreenshot(ACTOR, first.commitInput, harness.deps, harness.context),
      commitCompScreenshot(ACTOR, second.commitInput, harness.deps, harness.context),
    ]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<CompScreenshotStoreOutcome> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0].value.status).toBe("delivered");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(CompScreenshotContractError);
    expect((rejected[0].reason as CompScreenshotContractError).code).toBe(
      "preview_stale",
    );
    expect(harness.createProvider).toHaveBeenCalledTimes(1);
    expect(harness.provider.reserveFileId).toHaveBeenCalledTimes(1);
    expect(harness.provider.createReservedFile).toHaveBeenCalledTimes(1);
  });

  it("discards a concurrent generated-ID loser and uploads only the durable CAS winner", async () => {
    const harness = createHarness();
    const prepared = await prepare(harness);
    const generatedIds = [
      "drive_generated_fixture_alpha",
      "drive_generated_fixture_beta",
    ];
    let invocation = 0;
    let release!: () => void;
    const bothReserved = new Promise<void>((resolve) => {
      release = resolve;
    });
    harness.provider.reserveFileId.mockImplementation(
      async (): Promise<RenewalCompScreenshotReserveOutcome> => {
        const fileId = generatedIds[invocation++];
        if (invocation === 2) release();
        await bothReserved;
        return { outcome: "reserved", fileId };
      },
    );

    const results = await Promise.all([
      commitCompScreenshot(ACTOR, prepared.commitInput, harness.deps, harness.context),
      commitCompScreenshot(ACTOR, prepared.commitInput, harness.deps, harness.context),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "delivered",
      "in_progress",
    ]);
    expect(harness.provider.reserveFileId).toHaveBeenCalledTimes(2);

    const record = await harness.store.getExecution(prepared.outcome.preview.executionId);
    const winner = record?.reservedFileId;
    expect(generatedIds).toContain(winner);
    expect(harness.provider.createdInputs).toHaveLength(1);
    expect(harness.provider.createdInputs.every((input) => input.fileId === winner)).toBe(
      true,
    );
    expect(
      harness.provider.createdInputs.some(
        (input) => input.fileId === generatedIds.find((id) => id !== winner),
      ),
    ).toBe(false);
    expect(results.find((result) => result.status === "delivered")).toMatchObject({
      status: "delivered",
      receipt: { fileId: winner },
    });
  });
});

describe("comp screenshot write-ahead, retry, readback, and receipt behavior", () => {
  it("marks a claimed or ID-reserved pre-start execution absent without constructing Drive", async () => {
    const harness = createHarness();
    const prepared = await prepare(harness);
    const stored = await requireStoredPreview(prepared.outcome, harness.store);
    expect(
      (
        await harness.store.claim({
          previewHash: stored.id,
          executionId: stored.executionId,
          actorUid: ACTOR.uid,
          nowMs: NOW_MS,
        })
      ).status,
    ).toBe("claimed");
    await harness.store.bindFolderEvidence(
      stored.executionId,
      { folderMetadataHash: "e".repeat(64), folderVersion: "1" },
      NOW_MS,
    );
    expect(
      (await harness.store.reserveFileId(stored.executionId, FILE_ID, NOW_MS + 1)).status,
    ).toBe("reserved");

    const outcome = await reconcileCompScreenshot(
      stored.executionId,
      harness.deps,
      harness.context,
    );
    expect(outcome.status).toBe("absent");
    expect(harness.createProvider).not.toHaveBeenCalled();
    expect((await harness.store.getExecution(stored.executionId))?.state).toBe("absent");
  });

  it("keeps an active exact-ID upload leased and makes it ambiguous only after expiry", async () => {
    const harness = createHarness();
    const prepared = await prepare(harness);
    const stored = await requireStoredPreview(prepared.outcome, harness.store);
    await harness.store.claim({
      previewHash: stored.id,
      executionId: stored.executionId,
      actorUid: ACTOR.uid,
      nowMs: NOW_MS,
    });
    await harness.store.bindFolderEvidence(
      stored.executionId,
      { folderMetadataHash: "e".repeat(64), folderVersion: "1" },
      NOW_MS,
    );
    await harness.store.reserveFileId(stored.executionId, FILE_ID, NOW_MS + 1);
    await harness.store.beginUpload(stored.executionId, NOW_MS + 2);
    harness.provider.readTransforms.push(() => ({
      outcome: "absent",
      httpStatus: 404,
    }));

    const outcome = await reconcileCompScreenshot(
      stored.executionId,
      harness.deps,
      harness.context,
    );
    expect(outcome.status).toBe("upload_started");
    expect(harness.provider.getFile).toHaveBeenCalledWith(FILE_ID);
    expect(harness.provider.reserveFileId).not.toHaveBeenCalled();
    expect(harness.provider.createReservedFile).not.toHaveBeenCalled();
    expect(harness.provider.trashFile).not.toHaveBeenCalled();
    expect((await harness.store.getExecution(stored.executionId))?.state).toBe(
      "upload_started",
    );

    harness.advance(COMP_SCREENSHOT_UPLOAD_DISPATCH_LEASE_MS + 3);
    const expired = await reconcileCompScreenshot(
      stored.executionId,
      harness.deps,
      harness.context,
    );
    expect(expired.status).toBe("ambiguous");
    expect((await harness.store.getExecution(stored.executionId))?.state).toBe(
      "ambiguous",
    );
  });

  it("ignores a stale rejected callback after a newer same-ID generation starts", async () => {
    const harness = createHarness();
    const prepared = await prepare(harness);
    let firstStarted!: () => void;
    let secondStarted!: () => void;
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstDispatched = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const secondDispatched = new Promise<void>((resolve) => {
      secondStarted = resolve;
    });
    const firstRelease = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondRelease = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    let invocation = 0;
    harness.provider.createReservedFile.mockImplementation(async (input) => {
      const captured: CreateReservedRenewalCompScreenshotInput = {
        ...input,
        appProperties: { ...input.appProperties },
        bytes: new Uint8Array(input.bytes),
      };
      harness.provider.createdInputs.push(captured);
      invocation += 1;
      if (invocation === 1) {
        firstStarted();
        await firstRelease;
        return {
          outcome: "rejected",
          certainty: "not_applied",
          reason: "http",
          httpStatus: 403,
        };
      }
      secondStarted();
      await secondRelease;
      const file = driveFileFromCreate(captured);
      harness.provider.files.set(file.id, cloneFile(file));
      return {
        outcome: "accepted",
        httpStatus: 201,
        file: cloneFile(file),
      };
    });

    const firstCommit = commitCompScreenshot(
      ACTOR,
      prepared.commitInput,
      harness.deps,
      harness.context,
    );
    await firstDispatched;
    harness.advance(COMP_SCREENSHOT_UPLOAD_DISPATCH_LEASE_MS + 1);
    const secondCommit = commitCompScreenshot(
      ACTOR,
      prepared.commitInput,
      harness.deps,
      harness.context,
    );
    await secondDispatched;

    releaseFirst();
    const stale = await firstCommit;
    expect(stale.status).toBe("in_progress");
    await expect(
      harness.store.getExecution(prepared.outcome.preview.executionId),
    ).resolves.toMatchObject({
      state: "upload_started",
      dispatchGeneration: 2,
      reservedFileId: FILE_ID,
    });

    releaseSecond();
    const delivered = await secondCommit;
    expect(delivered).toMatchObject({
      status: "delivered",
      receipt: { fileId: FILE_ID },
    });
    expect(harness.provider.createdInputs.map((input) => input.fileId)).toEqual([
      FILE_ID,
      FILE_ID,
    ]);
    await expect(
      harness.store.getExecution(prepared.outcome.preview.executionId),
    ).resolves.toMatchObject({
      state: "delivered",
      dispatchGeneration: 2,
      reservedFileId: FILE_ID,
    });
  });

  it("retries the exact same reserved-ID create after ambiguity and converges through 409 plus matching GET", async () => {
    const harness = createHarness();
    const prepared = await prepare(harness);
    harness.provider.createOutcomes.push({
      outcome: "ambiguous",
      certainty: "unknown",
      reason: "transport",
    });
    harness.provider.readTransforms.push(() => ({
      outcome: "absent",
      httpStatus: 404,
    }));

    const first = await commitCompScreenshot(
      ACTOR,
      prepared.commitInput,
      harness.deps,
      harness.context,
    );
    expect(first.status).toBe("ambiguous");
    const firstCreate = harness.provider.createdInputs[0];
    harness.deps.folderId = "";
    harness.createProvider.mockClear();
    const resumed = await resumeCompScreenshot(
      ACTOR,
      {
        ...FILE_INPUT,
        executionId: prepared.outcome.preview.executionId,
      },
      harness.deps,
      harness.context,
    );
    expect(resumed).toMatchObject({
      status: "resume",
      preview: {
        executionId: prepared.outcome.preview.executionId,
        previewHash: prepared.outcome.preview.previewHash,
      },
      file: {
        filename: FILE_INPUT.filename,
        mimeType: FILE_INPUT.mimeType,
        sizeBytes: PNG_BYTES.byteLength,
      },
    });
    expect(harness.createProvider).not.toHaveBeenCalled();
    harness.provider.files.set(firstCreate.fileId, driveFileFromCreate(firstCreate));
    harness.provider.createOutcomes.push({
      outcome: "conflict",
      certainty: "unknown",
      httpStatus: 409,
    });

    const recovered = await commitCompScreenshot(
      ACTOR,
      prepared.commitInput,
      harness.deps,
      harness.context,
    );
    expect(recovered).toMatchObject({
      status: "delivered",
      duplicate: true,
      receipt: { fileId: firstCreate.fileId, reconciled: true },
    });
    expect(harness.provider.reserveFileId).toHaveBeenCalledTimes(1);
    expect(harness.provider.createReservedFile).toHaveBeenCalledTimes(2);
    expect(harness.provider.createdInputs.map((input) => input.fileId)).toEqual([
      firstCreate.fileId,
      firstCreate.fileId,
    ]);
    expect(harness.provider.createdInputs[1].parentFolderId).toBe(FOLDER_ID);
    expect(
      (await harness.store.getExecution(prepared.outcome.preview.executionId))
        ?.reservedFileId,
    ).toBe(firstCreate.fileId);
  });

  it("refuses receipt creation for every mismatched or incomplete Drive readback", async () => {
    const cases: Array<{
      label: string;
      mutate: (file: RenewalCompScreenshotDriveFile) => RenewalCompScreenshotDriveFile;
    }> = [
      {
        label: "wrong parent",
        mutate: (file) => ({ ...file, parents: [OTHER_FOLDER_ID] }),
      },
      {
        label: "wrong name",
        mutate: (file) => ({ ...file, name: "renewal-comp-wrong.png" }),
      },
      {
        label: "wrong MIME",
        mutate: (file) => ({ ...file, mimeType: "image/jpeg" }),
      },
      {
        label: "wrong size",
        mutate: (file) => ({ ...file, size: String(Number(file.size) + 1) }),
      },
      {
        label: "wrong checksum",
        mutate: (file) => ({ ...file, sha256Checksum: "f".repeat(64) }),
      },
      {
        label: "wrong appProperties",
        mutate: (file) => ({
          ...file,
          appProperties: { ...file.appProperties, pmi_payload: "wrong" },
        }),
      },
      {
        label: "already trashed",
        mutate: (file) => ({
          ...file,
          trashed: true,
          explicitlyTrashed: true,
        }),
      },
      {
        label: "wrong file id",
        mutate: (file) => ({ ...file, id: "drive_file_fixture_wrong" }),
      },
      {
        label: "missing checksum",
        mutate: (file) => {
          const changed = cloneFile(file);
          delete changed.sha256Checksum;
          return changed;
        },
      },
      {
        label: "missing head revision",
        mutate: (file) => {
          const changed = cloneFile(file);
          delete changed.headRevisionId;
          return changed;
        },
      },
    ];

    for (const testCase of cases) {
      const harness = createHarness();
      const prepared = await prepare(harness);
      harness.provider.readTransforms.push((_fileId, current) => {
        if (!current) throw new Error("Expected created Drive fixture.");
        return {
          outcome: "found",
          httpStatus: 200,
          file: testCase.mutate(current),
        };
      });

      const outcome = await commitCompScreenshot(
        ACTOR,
        prepared.commitInput,
        harness.deps,
        harness.context,
      );
      expect(outcome.status, testCase.label).toBe("ambiguous");
      const record = await harness.store.getExecution(
        prepared.outcome.preview.executionId,
      );
      expect(record?.state, testCase.label).toBe("ambiguous");
      expect(record?.receipt, testCase.label).toBeUndefined();
    }
  });

  it("creates one stable bodyless receipt from exact readback and returns it unchanged on duplicate commit", async () => {
    const harness = createHarness();
    const delivered = await deliver(harness);
    expect(delivered.outcome.duplicate).toBe(false);
    const providerConstructions = harness.createProvider.mock.calls.length;
    harness.deps.folderId = "";

    const resumed = await resumeCompScreenshot(
      ACTOR,
      {
        ...FILE_INPUT,
        executionId: delivered.prepared.outcome.preview.executionId,
      },
      harness.deps,
      harness.context,
    );
    expect(resumed).toMatchObject({
      status: "resume",
      preview: {
        executionId: delivered.prepared.outcome.preview.executionId,
        previewHash: delivered.prepared.outcome.preview.previewHash,
      },
    });
    expect(harness.createProvider).toHaveBeenCalledTimes(providerConstructions);

    const duplicate = await commitCompScreenshot(
      ACTOR,
      delivered.prepared.commitInput,
      harness.deps,
      harness.context,
    );
    expect(duplicate.status).toBe("delivered");
    if (duplicate.status !== "delivered") throw new Error("Expected duplicate.");
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.receipt).toEqual(delivered.outcome.receipt);
    expect(harness.createProvider).toHaveBeenCalledTimes(providerConstructions);
    expect(harness.provider.reserveFileId).toHaveBeenCalledTimes(1);
    expect(harness.provider.createReservedFile).toHaveBeenCalledTimes(1);

    const durable = JSON.stringify({
      previews: [...harness.store.previews.values()],
      executions: [...harness.store.executions.values()],
    });
    const receiptJson = JSON.stringify(delivered.outcome.receipt);
    for (const rawValue of [FILE_INPUT.leaseId, FILE_INPUT.filename, FILE_INPUT.base64]) {
      expect(durable).not.toContain(rawValue);
      expect(receiptJson).not.toContain(rawValue);
    }
    expect(durable).not.toContain('"bytes"');
    expect(durable).not.toContain('"base64"');
    expect(delivered.outcome.receipt).toMatchObject({
      receiptId: delivered.outcome.executionId,
      idempotencyKey: delivered.outcome.executionId,
      fileId: FILE_ID,
      ref: `drive:${FILE_ID}`,
      md5Checksum: hashCompScreenshotBytes(PNG_BYTES, "md5"),
      sha256Checksum: hashCompScreenshotBytes(PNG_BYTES, "sha256"),
      headRevisionId: `head_${FILE_ID}`,
      createdAt: PROVIDER_CREATED_AT,
    });
  });

  it("reconcile reads only and never reserves, creates, uploads, or trashes", async () => {
    const harness = createHarness();
    const prepared = await prepare(harness);
    harness.provider.createOutcomes.push({
      outcome: "ambiguous",
      certainty: "unknown",
      reason: "transport",
    });
    harness.provider.readTransforms.push(() => ({
      outcome: "absent",
      httpStatus: 404,
    }));
    expect(
      (
        await commitCompScreenshot(
          ACTOR,
          prepared.commitInput,
          harness.deps,
          harness.context,
        )
      ).status,
    ).toBe("ambiguous");
    const created = harness.provider.createdInputs[0];
    harness.provider.files.set(created.fileId, driveFileFromCreate(created));

    harness.createProvider.mockClear();
    harness.provider.reserveFileId.mockClear();
    harness.provider.createReservedFile.mockClear();
    harness.provider.getFile.mockClear();
    harness.provider.trashFile.mockClear();
    runtimeSuspension.read.mockClear();
    runtimeSuspension.current = { status: "global_suspended" };
    const outcome = await reconcileCompScreenshot(
      prepared.outcome.preview.executionId,
      harness.deps,
      harness.context,
    );
    runtimeSuspension.current = { status: "clear" };

    expect(outcome).toMatchObject({
      status: "delivered",
      receipt: { fileId: created.fileId, reconciled: true },
    });
    expect(harness.createProvider).toHaveBeenCalledTimes(1);
    expect(harness.provider.getFile).toHaveBeenCalledTimes(1);
    expect(harness.provider.reserveFileId).not.toHaveBeenCalled();
    expect(harness.provider.createReservedFile).not.toHaveBeenCalled();
    expect(harness.provider.trashFile).not.toHaveBeenCalled();
    expect(runtimeSuspension.read).not.toHaveBeenCalled();
  });
});

describe("comp screenshot exact trash rollback", () => {
  // S51_DYNAMIC_REFUSAL:comp-screenshot-rollback-preview-provider
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "does not construct Drive for rollback preview when runtime state is %s",
    async (status) => {
      const harness = createHarness();
      const delivered = await deliver(harness);
      harness.createProvider.mockClear();
      runtimeSuspension.current = { status };
      try {
        await expect(
          previewCompScreenshotRollback(
            ACTOR,
            FILE_INPUT.leaseId,
            delivered.outcome.executionId,
            harness.deps,
            harness.context,
          ),
        ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);
        expect(harness.createProvider).not.toHaveBeenCalled();
        expect(harness.provider.trashFile).not.toHaveBeenCalled();
      } finally {
        runtimeSuspension.current = { status: "clear" };
      }
    },
  );

  // S51_DYNAMIC_REFUSAL:comp-screenshot-rollback-commit-provider
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "does not construct Drive for rollback commit when runtime state is %s",
    async (status) => {
      const harness = createHarness();
      const delivered = await deliver(harness);
      const preview = await previewCompScreenshotRollback(
        ACTOR,
        FILE_INPUT.leaseId,
        delivered.outcome.executionId,
        harness.deps,
        harness.context,
      );
      if (preview.status !== "preview") {
        throw new Error("Expected rollback preview.");
      }
      harness.createProvider.mockClear();
      runtimeSuspension.current = { status };
      try {
        await expect(
          commitCompScreenshotRollback(
            ACTOR,
            {
              leaseId: FILE_INPUT.leaseId,
              executionId: delivered.outcome.executionId,
              rollbackId: preview.preview.rollbackId,
              previewHash: preview.preview.previewHash,
            },
            harness.deps,
            harness.context,
          ),
        ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);
        expect(harness.createProvider).not.toHaveBeenCalled();
        expect(harness.provider.trashFile).not.toHaveBeenCalled();
      } finally {
        runtimeSuspension.current = { status: "clear" };
      }
    },
  );

  it("rejects a different lease before constructing a rollback provider", async () => {
    const harness = createHarness();
    const delivered = await deliver(harness);
    const constructionsAfterDelivery = harness.createProvider.mock.calls.length;

    await expectContractError(
      previewCompScreenshotRollback(
        ACTOR,
        "lease_fixture_other",
        delivered.outcome.executionId,
        harness.deps,
        harness.context,
      ),
      "rollback_stale",
    );
    expect(harness.createProvider).toHaveBeenCalledTimes(constructionsAfterDelivery);

    const preview = await previewCompScreenshotRollback(
      ACTOR,
      FILE_INPUT.leaseId,
      delivered.outcome.executionId,
      harness.deps,
      harness.context,
    );
    if (preview.status !== "preview") throw new Error("Expected rollback preview.");
    const constructionsAfterPreview = harness.createProvider.mock.calls.length;
    await expectContractError(
      commitCompScreenshotRollback(
        ACTOR,
        {
          leaseId: "lease_fixture_other",
          executionId: delivered.outcome.executionId,
          rollbackId: preview.preview.rollbackId,
          previewHash: preview.preview.previewHash,
        },
        harness.deps,
        harness.context,
      ),
      "rollback_stale",
    );
    expect(harness.createProvider).toHaveBeenCalledTimes(constructionsAfterPreview);
    expect(harness.provider.trashFile).not.toHaveBeenCalled();
  });

  it("blocks a concurrent active claim, then recovers its same lineage after lease expiry", async () => {
    const harness = createHarness();
    const delivered = await deliver(harness);
    const preview = await previewCompScreenshotRollback(
      ACTOR,
      FILE_INPUT.leaseId,
      delivered.outcome.executionId,
      harness.deps,
      harness.context,
    );
    if (preview.status !== "preview") throw new Error("Expected rollback preview.");
    const claimed = await harness.store.claimRollback({
      previewHash: preview.preview.previewHash,
      rollbackId: preview.preview.rollbackId,
      executionId: delivered.outcome.executionId,
      leaseId: FILE_INPUT.leaseId,
      actorUid: ACTOR.uid,
      nowMs: NOW_MS,
    });
    expect(claimed).toMatchObject({ status: "claimed", dispatchGeneration: 1 });
    const input = {
      leaseId: FILE_INPUT.leaseId,
      executionId: delivered.outcome.executionId,
      rollbackId: preview.preview.rollbackId,
      previewHash: preview.preview.previewHash,
    };

    await expect(
      commitCompScreenshotRollback(ACTOR, input, harness.deps, harness.context),
    ).resolves.toMatchObject({ status: "ambiguous" });
    expect(harness.provider.trashFile).not.toHaveBeenCalled();

    harness.advance(COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS);
    await expect(
      commitCompScreenshotRollback(ACTOR, input, harness.deps, harness.context),
    ).resolves.toMatchObject({
      status: "rolled_back",
      receipt: { fileId: delivered.outcome.receipt.fileId, reconciled: true },
    });
    expect(harness.provider.trashFile).toHaveBeenCalledTimes(1);
  });

  it("converges a stale ambiguity callback to a refreshed-preview recovery receipt", async () => {
    const harness = createHarness();
    const delivered = await deliver(harness);
    const preview = await previewCompScreenshotRollback(
      ACTOR,
      FILE_INPUT.leaseId,
      delivered.outcome.executionId,
      harness.deps,
      harness.context,
    );
    if (preview.status !== "preview") throw new Error("Expected rollback preview.");
    const storedPreview = await harness.store.getRollbackPreview(
      preview.preview.previewHash,
    );
    if (!storedPreview) throw new Error("Expected stored rollback preview.");
    const found = (
      _fileId: string,
      current: RenewalCompScreenshotDriveFile | undefined,
    ): RenewalCompScreenshotReadOutcome =>
      current
        ? { outcome: "found", httpStatus: 200, file: cloneFile(current) }
        : { outcome: "absent", httpStatus: 404 };
    harness.provider.readTransforms.push(found, found, () => ({
      outcome: "absent",
      httpStatus: 404,
    }));

    const originalMark = harness.store.markRollbackAmbiguous.bind(harness.store);
    let recoveryReceipt:
      | Awaited<ReturnType<typeof harness.store.finishRollback>>
      | undefined;
    vi.spyOn(harness.store, "markRollbackAmbiguous").mockImplementation(async (input) => {
      const recoveryPreview = refreshCompScreenshotRollbackPreview(
        storedPreview,
        NOW_MS + 100,
        "nonce_fixture_stale_mark_recovery",
      );
      await harness.store.createRollbackPreview(recoveryPreview);
      const recoveryClaim = await harness.store.claimRollback({
        previewHash: recoveryPreview.id,
        rollbackId: recoveryPreview.rollbackId,
        executionId: delivered.outcome.executionId,
        leaseId: FILE_INPUT.leaseId,
        actorUid: ACTOR.uid,
        nowMs: NOW_MS + 101,
        observedExplicitTrash: true,
      });
      if (recoveryClaim.status !== "retry") {
        throw new Error("Expected explicit-trash recovery claim.");
      }
      const trashed = harness.provider.files.get(delivered.outcome.receipt.fileId);
      if (!trashed) throw new Error("Expected trashed Drive fixture.");
      recoveryReceipt = await harness.store.finishRollback(
        delivered.outcome.executionId,
        recoveryClaim.dispatchGeneration,
        buildCompScreenshotRollbackReceipt(
          recoveryClaim.record,
          recoveryClaim.rollback,
          recoveryPreview,
          {
            providerMetadataHashAfter: "d".repeat(64),
            versionAfter: trashed.version,
            headRevisionIdAfter: trashed.headRevisionId!,
            explicitlyTrashed: true,
            canUntrash: trashed.capabilities.canUntrash ?? false,
            providerTimestamp: trashed.modifiedTime,
          },
          true,
        ),
      );
      return originalMark(input);
    });

    const outcome = await commitCompScreenshotRollback(
      ACTOR,
      {
        leaseId: FILE_INPUT.leaseId,
        executionId: delivered.outcome.executionId,
        rollbackId: preview.preview.rollbackId,
        previewHash: preview.preview.previewHash,
      },
      harness.deps,
      harness.context,
    );

    expect(outcome).toEqual({
      status: "rolled_back",
      executionId: delivered.outcome.executionId,
      receipt: recoveryReceipt,
      duplicate: true,
    });
    expect(harness.provider.trashFile).toHaveBeenCalledTimes(1);
  });

  it("does not project or reattach a delivered screenshot while rollback is running or ambiguous", async () => {
    const harness = createHarness();
    const delivered = await deliver(harness);
    const preview = await previewCompScreenshotRollback(
      ACTOR,
      FILE_INPUT.leaseId,
      delivered.outcome.executionId,
      harness.deps,
      harness.context,
    );
    if (preview.status !== "preview") throw new Error("Expected rollback preview.");
    const claim = await harness.store.claimRollback({
      previewHash: preview.preview.previewHash,
      rollbackId: preview.preview.rollbackId,
      executionId: delivered.outcome.executionId,
      leaseId: FILE_INPUT.leaseId,
      actorUid: ACTOR.uid,
      nowMs: NOW_MS,
    });
    if (claim.status !== "claimed") throw new Error("Expected rollback claim.");

    await expect(
      getCompScreenshotStatusForLease(FILE_INPUT.leaseId, harness.deps, harness.context),
    ).resolves.toMatchObject({
      status: "rollback_running",
      executionId: delivered.outcome.executionId,
    });
    await expect(
      getReceiptedCompScreenshotForLease(FILE_INPUT.leaseId, harness.store),
    ).resolves.toBeNull();

    await harness.store.markRollbackAmbiguous({
      executionId: delivered.outcome.executionId,
      rollbackId: claim.rollback.id,
      previewHash: claim.rollback.previewHash,
      dispatchGeneration: claim.dispatchGeneration,
      nowMs: NOW_MS + 1,
    });
    await expect(
      getCompScreenshotStatusForLease(FILE_INPUT.leaseId, harness.deps, harness.context),
    ).resolves.toMatchObject({
      status: "rollback_ambiguous",
      executionId: delivered.outcome.executionId,
    });
    await expect(
      getReceiptedCompScreenshotForLease(FILE_INPUT.leaseId, harness.store),
    ).resolves.toBeNull();

    await harness.store.markRollbackFailed({
      executionId: delivered.outcome.executionId,
      rollbackId: claim.rollback.id,
      previewHash: claim.rollback.previewHash,
      dispatchGeneration: claim.dispatchGeneration,
      nowMs: NOW_MS + 2,
    });
    await expect(
      getCompScreenshotStatusForLease(FILE_INPUT.leaseId, harness.deps, harness.context),
    ).resolves.toMatchObject({
      status: "delivered",
      receipt: { ref: delivered.outcome.receipt.ref },
    });
    await expect(
      getReceiptedCompScreenshotForLease(FILE_INPUT.leaseId, harness.store),
    ).resolves.toEqual(delivered.outcome.receipt);
    expect(harness.createProvider).toHaveBeenCalledTimes(2);
  });

  it("discloses provider drift, binds that exact generation, verifies explicit trash, and returns the same duplicate receipt", async () => {
    const harness = createHarness();
    const delivered = await deliver(harness);
    const fileId = delivered.outcome.receipt.fileId;
    const current = harness.provider.files.get(fileId);
    if (!current) throw new Error("Expected delivered Drive fixture.");
    harness.provider.files.set(fileId, {
      ...current,
      version: "2",
      modifiedTime: "2026-07-30T03:01:30.000Z",
    });

    const preview = await previewCompScreenshotRollback(
      ACTOR,
      FILE_INPUT.leaseId,
      delivered.outcome.executionId,
      harness.deps,
      harness.context,
    );
    expect(preview).toMatchObject({
      status: "preview",
      preview: {
        executionId: delivered.outcome.executionId,
        providerDriftedSinceReceipt: true,
      },
      target: { ref: `drive:${fileId}` },
    });
    if (preview.status !== "preview") throw new Error("Expected rollback preview.");
    const storedPreview = await harness.store.getRollbackPreview(
      preview.preview.previewHash,
    );
    expect(storedPreview?.binding).toMatchObject({
      actorUid: ACTOR.uid,
      executionId: delivered.outcome.executionId,
      originalReceiptId: delivered.outcome.receipt.receiptId,
      fileId,
      providerIdentityHash: PROVIDER_IDENTITY_HASH,
      providerVersion: "2",
      providerHeadRevisionId: `head_${fileId}`,
      canTrash: true,
      canUntrash: true,
      descriptor: PRODUCTION_LIVE,
    });

    const rolledBack = await commitCompScreenshotRollback(
      ACTOR,
      {
        leaseId: FILE_INPUT.leaseId,
        executionId: delivered.outcome.executionId,
        rollbackId: preview.preview.rollbackId,
        previewHash: preview.preview.previewHash,
      },
      harness.deps,
      harness.context,
    );
    expect(rolledBack).toMatchObject({
      status: "rolled_back",
      duplicate: false,
      receipt: {
        fileId,
        versionBefore: "2",
        versionAfter: "3",
        explicitlyTrashed: true,
        canUntrash: true,
      },
    });
    if (rolledBack.status !== "rolled_back") {
      throw new Error("Expected rolled-back outcome.");
    }
    const providerConstructions = harness.createProvider.mock.calls.length;

    const duplicate = await commitCompScreenshotRollback(
      ACTOR,
      {
        leaseId: FILE_INPUT.leaseId,
        executionId: delivered.outcome.executionId,
        rollbackId: preview.preview.rollbackId,
        previewHash: preview.preview.previewHash,
      },
      harness.deps,
      harness.context,
    );
    expect(duplicate).toEqual({
      status: "rolled_back",
      executionId: delivered.outcome.executionId,
      receipt: rolledBack.receipt,
      duplicate: true,
    });
    expect(harness.createProvider).toHaveBeenCalledTimes(providerConstructions);
    expect(harness.provider.trashFile).toHaveBeenCalledTimes(1);
    expect(harness.provider.trashFile).toHaveBeenCalledWith(fileId);
  });

  it("requires the exact successful rollback preview and actor before returning a duplicate receipt", async () => {
    const harness = createHarness();
    const delivered = await deliver(harness);
    const preview = await previewCompScreenshotRollback(
      ACTOR,
      FILE_INPUT.leaseId,
      delivered.outcome.executionId,
      harness.deps,
      harness.context,
    );
    if (preview.status !== "preview") throw new Error("Expected rollback preview.");
    const input = {
      leaseId: FILE_INPUT.leaseId,
      executionId: delivered.outcome.executionId,
      rollbackId: preview.preview.rollbackId,
      previewHash: preview.preview.previewHash,
    };
    await expect(
      commitCompScreenshotRollback(ACTOR, input, harness.deps, harness.context),
    ).resolves.toMatchObject({ status: "rolled_back" });
    const providerConstructions = harness.createProvider.mock.calls.length;
    const trashCalls = harness.provider.trashFile.mock.calls.length;

    await expectContractError(
      commitCompScreenshotRollback(OTHER_ACTOR, input, harness.deps, harness.context),
      "rollback_stale",
    );
    await expectContractError(
      commitCompScreenshotRollback(
        ACTOR,
        { ...input, rollbackId: `comp_trash_${"f".repeat(48)}` },
        harness.deps,
        harness.context,
      ),
      "rollback_stale",
    );
    await expectContractError(
      commitCompScreenshotRollback(
        ACTOR,
        { ...input, previewHash: "f".repeat(64) },
        harness.deps,
        harness.context,
      ),
      "rollback_stale",
    );
    expect(harness.createProvider).toHaveBeenCalledTimes(providerConstructions);
    expect(harness.provider.trashFile).toHaveBeenCalledTimes(trashCalls);
  });

  it("refuses a changed actor or provider version after rollback preview before trash", async () => {
    const harness = createHarness();
    const delivered = await deliver(harness);
    const preview = await previewCompScreenshotRollback(
      ACTOR,
      FILE_INPUT.leaseId,
      delivered.outcome.executionId,
      harness.deps,
      harness.context,
    );
    if (preview.status !== "preview") throw new Error("Expected rollback preview.");
    const input = {
      leaseId: FILE_INPUT.leaseId,
      executionId: delivered.outcome.executionId,
      rollbackId: preview.preview.rollbackId,
      previewHash: preview.preview.previewHash,
    };
    const constructionsAfterPreview = harness.createProvider.mock.calls.length;

    await expectContractError(
      commitCompScreenshotRollback(OTHER_ACTOR, input, harness.deps, harness.context),
      "rollback_stale",
    );
    expect(harness.createProvider).toHaveBeenCalledTimes(constructionsAfterPreview);
    expect(harness.provider.trashFile).not.toHaveBeenCalled();

    const file = harness.provider.files.get(delivered.outcome.receipt.fileId);
    if (!file) throw new Error("Expected delivered Drive fixture.");
    harness.provider.files.set(file.id, {
      ...file,
      version: "2",
      modifiedTime: "2026-07-30T03:01:30.000Z",
    });
    await expectContractError(
      commitCompScreenshotRollback(ACTOR, input, harness.deps, harness.context),
      "rollback_stale",
    );
    expect(harness.provider.trashFile).not.toHaveBeenCalled();
  });

  it("marks exact trash evidence reconciled when the provider mutation response is ambiguous", async () => {
    const harness = createHarness();
    const delivered = await deliver(harness);
    const preview = await previewCompScreenshotRollback(
      ACTOR,
      FILE_INPUT.leaseId,
      delivered.outcome.executionId,
      harness.deps,
      harness.context,
    );
    if (preview.status !== "preview") throw new Error("Expected rollback preview.");
    harness.provider.trashFile.mockImplementationOnce(async (fileId) => {
      const current = harness.provider.files.get(fileId);
      if (!current) throw new Error("Expected delivered Drive fixture.");
      harness.provider.files.set(fileId, {
        ...current,
        trashed: true,
        explicitlyTrashed: true,
        modifiedTime: PROVIDER_TRASHED_AT,
        version: "2",
        capabilities: { ...current.capabilities, canUntrash: true },
      });
      return {
        outcome: "ambiguous",
        certainty: "unknown",
        reason: "transport",
      };
    });

    await expect(
      commitCompScreenshotRollback(
        ACTOR,
        {
          leaseId: FILE_INPUT.leaseId,
          executionId: delivered.outcome.executionId,
          rollbackId: preview.preview.rollbackId,
          previewHash: preview.preview.previewHash,
        },
        harness.deps,
        harness.context,
      ),
    ).resolves.toMatchObject({
      status: "rolled_back",
      receipt: {
        fileId: delivered.outcome.receipt.fileId,
        explicitlyTrashed: true,
        reconciled: true,
      },
    });
    expect(harness.provider.trashFile).toHaveBeenCalledTimes(1);
  });

  it("recovers an ambiguous trash by retrying only the same file and records reconciled evidence", async () => {
    const harness = createHarness();
    const delivered = await deliver(harness);
    const preview = await previewCompScreenshotRollback(
      ACTOR,
      FILE_INPUT.leaseId,
      delivered.outcome.executionId,
      harness.deps,
      harness.context,
    );
    if (preview.status !== "preview") throw new Error("Expected rollback preview.");
    const input = {
      leaseId: FILE_INPUT.leaseId,
      executionId: delivered.outcome.executionId,
      rollbackId: preview.preview.rollbackId,
      previewHash: preview.preview.previewHash,
    };
    harness.provider.trashOutcomes.push({
      outcome: "ambiguous",
      certainty: "unknown",
      reason: "transport",
    });

    const first = await commitCompScreenshotRollback(
      ACTOR,
      input,
      harness.deps,
      harness.context,
    );
    expect(first.status).toBe("ambiguous");
    expect(
      (await harness.store.getExecution(delivered.outcome.executionId))?.rollback?.state,
    ).toBe("ambiguous");

    const recovered = await commitCompScreenshotRollback(
      ACTOR,
      input,
      harness.deps,
      harness.context,
    );
    expect(recovered).toMatchObject({
      status: "rolled_back",
      receipt: {
        fileId: delivered.outcome.receipt.fileId,
        explicitlyTrashed: true,
        reconciled: true,
      },
    });
    expect(harness.provider.trashFile).toHaveBeenCalledTimes(2);
    expect(harness.provider.trashFile.mock.calls.map(([fileId]) => fileId)).toEqual([
      delivered.outcome.receipt.fileId,
      delivered.outcome.receipt.fileId,
    ]);
  });

  it("lets a newly confirming Admin recover explicit trash after reload with no second PATCH", async () => {
    const harness = createHarness();
    const delivered = await deliver(harness);
    const preview = await previewCompScreenshotRollback(
      ACTOR,
      FILE_INPUT.leaseId,
      delivered.outcome.executionId,
      harness.deps,
      harness.context,
    );
    if (preview.status !== "preview") throw new Error("Expected rollback preview.");
    const passThrough: ReadTransform = (_fileId, current) => {
      if (!current) throw new Error("Expected delivered Drive fixture.");
      return { outcome: "found", httpStatus: 200, file: cloneFile(current) };
    };
    harness.provider.readTransforms.push(passThrough, passThrough, () => ({
      outcome: "absent",
      httpStatus: 404,
    }));

    await expect(
      commitCompScreenshotRollback(
        ACTOR,
        {
          leaseId: FILE_INPUT.leaseId,
          executionId: delivered.outcome.executionId,
          rollbackId: preview.preview.rollbackId,
          previewHash: preview.preview.previewHash,
        },
        harness.deps,
        harness.context,
      ),
    ).resolves.toMatchObject({ status: "ambiguous" });
    expect(harness.provider.trashFile).toHaveBeenCalledTimes(1);

    const refreshed = await previewCompScreenshotRollback(
      OTHER_ACTOR,
      FILE_INPUT.leaseId,
      delivered.outcome.executionId,
      harness.deps,
      harness.context,
    );
    if (refreshed.status !== "preview") {
      throw new Error("Expected refreshed recovery preview.");
    }
    expect(refreshed.preview.rollbackId).toBe(preview.preview.rollbackId);
    expect(refreshed.preview.previewHash).not.toBe(preview.preview.previewHash);
    await expect(
      harness.store.getRollbackPreview(refreshed.preview.previewHash),
    ).resolves.toMatchObject({
      binding: { actorUid: ACTOR.uid },
      recoveryActorUid: OTHER_ACTOR.uid,
    });
    await expectContractError(
      commitCompScreenshotRollback(
        ACTOR,
        {
          leaseId: FILE_INPUT.leaseId,
          executionId: delivered.outcome.executionId,
          rollbackId: refreshed.preview.rollbackId,
          previewHash: refreshed.preview.previewHash,
        },
        harness.deps,
        harness.context,
      ),
      "rollback_stale",
    );

    await expect(
      commitCompScreenshotRollback(
        OTHER_ACTOR,
        {
          leaseId: FILE_INPUT.leaseId,
          executionId: delivered.outcome.executionId,
          rollbackId: refreshed.preview.rollbackId,
          previewHash: refreshed.preview.previewHash,
        },
        harness.deps,
        harness.context,
      ),
    ).resolves.toMatchObject({
      status: "rolled_back",
      duplicate: true,
      receipt: {
        previewHash: refreshed.preview.previewHash,
        reconciled: true,
      },
    });
    expect(harness.provider.trashFile).toHaveBeenCalledTimes(1);
  });

  it("retries the same exact rollback lineage after a deterministic rejection", async () => {
    const harness = createHarness();
    const delivered = await deliver(harness);
    const preview = await previewCompScreenshotRollback(
      ACTOR,
      FILE_INPUT.leaseId,
      delivered.outcome.executionId,
      harness.deps,
      harness.context,
    );
    if (preview.status !== "preview") throw new Error("Expected rollback preview.");
    const input = {
      leaseId: FILE_INPUT.leaseId,
      executionId: delivered.outcome.executionId,
      rollbackId: preview.preview.rollbackId,
      previewHash: preview.preview.previewHash,
    };
    harness.provider.trashOutcomes.push({
      outcome: "rejected",
      certainty: "not_applied",
      reason: "http",
      httpStatus: 403,
    });

    await expect(
      commitCompScreenshotRollback(ACTOR, input, harness.deps, harness.context),
    ).resolves.toMatchObject({ status: "failed" });
    await expect(
      harness.store.getExecution(delivered.outcome.executionId),
    ).resolves.toMatchObject({
      state: "delivered",
      rollback: {
        id: preview.preview.rollbackId,
        state: "failed",
        attemptCount: 1,
      },
    });

    const refreshedPreview = await previewCompScreenshotRollback(
      ACTOR,
      FILE_INPUT.leaseId,
      delivered.outcome.executionId,
      harness.deps,
      harness.context,
    );
    if (refreshedPreview.status !== "preview") {
      throw new Error("Expected refreshed rollback preview.");
    }
    expect(refreshedPreview.preview.rollbackId).toBe(preview.preview.rollbackId);
    expect(refreshedPreview.preview.previewHash).not.toBe(preview.preview.previewHash);
    const refreshedInput = {
      ...input,
      rollbackId: refreshedPreview.preview.rollbackId,
      previewHash: refreshedPreview.preview.previewHash,
    };
    await expect(
      commitCompScreenshotRollback(ACTOR, refreshedInput, harness.deps, harness.context),
    ).resolves.toMatchObject({
      status: "rolled_back",
      receipt: {
        rollbackId: refreshedPreview.preview.rollbackId,
        previewHash: refreshedPreview.preview.previewHash,
        fileId: delivered.outcome.receipt.fileId,
        reconciled: true,
      },
    });
    expect(harness.provider.trashFile).toHaveBeenCalledTimes(2);
    expect(harness.provider.trashFile.mock.calls.map(([fileId]) => fileId)).toEqual([
      delivered.outcome.receipt.fileId,
      delivered.outcome.receipt.fileId,
    ]);
  });

  it("starts a new exact rollback lineage after proven no-effect when the actor or provider generation changes", async () => {
    for (const change of ["actor", "provider"] as const) {
      const harness = createHarness();
      const delivered = await deliver(harness);
      const firstPreview = await previewCompScreenshotRollback(
        ACTOR,
        FILE_INPUT.leaseId,
        delivered.outcome.executionId,
        harness.deps,
        harness.context,
      );
      if (firstPreview.status !== "preview") {
        throw new Error("Expected rollback preview.");
      }
      harness.provider.trashOutcomes.push({
        outcome: "rejected",
        certainty: "not_applied",
        reason: "http",
        httpStatus: 403,
      });
      await expect(
        commitCompScreenshotRollback(
          ACTOR,
          {
            leaseId: FILE_INPUT.leaseId,
            executionId: delivered.outcome.executionId,
            rollbackId: firstPreview.preview.rollbackId,
            previewHash: firstPreview.preview.previewHash,
          },
          harness.deps,
          harness.context,
        ),
      ).resolves.toMatchObject({ status: "failed" });

      const recoveryActor = change === "actor" ? OTHER_ACTOR : ACTOR;
      if (change === "provider") {
        const current = harness.provider.files.get(delivered.outcome.receipt.fileId);
        if (!current) throw new Error("Expected delivered Drive fixture.");
        harness.provider.files.set(current.id, {
          ...current,
          version: "2",
          headRevisionId: `head_${current.id}_2`,
          modifiedTime: "2026-07-30T03:03:00.000Z",
        });
      }
      const freshPreview = await previewCompScreenshotRollback(
        recoveryActor,
        FILE_INPUT.leaseId,
        delivered.outcome.executionId,
        harness.deps,
        harness.context,
      );
      if (freshPreview.status !== "preview") {
        throw new Error("Expected fresh rollback preview.");
      }
      if (change === "actor") {
        expect(freshPreview.preview.rollbackId).toBe(firstPreview.preview.rollbackId);
      } else {
        expect(freshPreview.preview.rollbackId).not.toBe(firstPreview.preview.rollbackId);
      }

      await expect(
        commitCompScreenshotRollback(
          recoveryActor,
          {
            leaseId: FILE_INPUT.leaseId,
            executionId: delivered.outcome.executionId,
            rollbackId: freshPreview.preview.rollbackId,
            previewHash: freshPreview.preview.previewHash,
          },
          harness.deps,
          harness.context,
        ),
      ).resolves.toMatchObject({
        status: "rolled_back",
        receipt: {
          rollbackId: freshPreview.preview.rollbackId,
          previewHash: freshPreview.preview.previewHash,
        },
      });
      await expect(
        harness.store.getExecution(delivered.outcome.executionId),
      ).resolves.toMatchObject({
        state: "rolled_back",
        rollback: {
          id: freshPreview.preview.rollbackId,
          actorUid: recoveryActor.uid,
          state: "succeeded",
        },
      });
    }
  });

  it("never accepts inherited-only trash as rollback success", async () => {
    const harness = createHarness();
    const delivered = await deliver(harness);
    const preview = await previewCompScreenshotRollback(
      ACTOR,
      FILE_INPUT.leaseId,
      delivered.outcome.executionId,
      harness.deps,
      harness.context,
    );
    if (preview.status !== "preview") throw new Error("Expected rollback preview.");
    const current = harness.provider.files.get(delivered.outcome.receipt.fileId);
    if (!current) throw new Error("Expected delivered Drive fixture.");
    const inheritedOnly: RenewalCompScreenshotDriveFile = {
      ...current,
      trashed: true,
      explicitlyTrashed: false,
      version: "2",
      modifiedTime: PROVIDER_TRASHED_AT,
    };
    harness.provider.trashOutcomes.push({
      outcome: "accepted",
      httpStatus: 200,
      file: inheritedOnly,
    });

    const outcome = await commitCompScreenshotRollback(
      ACTOR,
      {
        leaseId: FILE_INPUT.leaseId,
        executionId: delivered.outcome.executionId,
        rollbackId: preview.preview.rollbackId,
        previewHash: preview.preview.previewHash,
      },
      harness.deps,
      harness.context,
    );
    expect(outcome.status).toBe("ambiguous");
    const execution = await harness.store.getExecution(delivered.outcome.executionId);
    expect(execution?.state).toBe("delivered");
    expect(execution?.rollback?.state).toBe("ambiguous");
    expect(execution?.rollback?.receipt).toBeUndefined();
  });
});
