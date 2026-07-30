import { describe, expect, it, vi } from "vitest";

// This suite isolates the provider folder/file boundary with an explicit open registry fixture.
// Replace the production runtime reader too; suspension refusal and zero Drive construction are
// covered by the dedicated S51 service and route tests.
vi.mock("@/lib/operations/runtime-suspension-gate", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/operations/runtime-suspension-gate")>();
  return {
    ...actual,
    assertProductionRuntimeActionExecutable: vi.fn(async () => undefined),
  };
});

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import {
  type CreateReservedRenewalCompScreenshotInput,
  type RenewalCompScreenshotDriveFile,
  type RenewalCompScreenshotDriveFolder,
  type RenewalCompScreenshotDriveProvider,
  type RenewalCompScreenshotFolderReadOutcome,
  type RenewalCompScreenshotMutationOutcome,
  type RenewalCompScreenshotReadOutcome,
  type RenewalCompScreenshotReserveOutcome,
} from "@/lib/google-drive/renewal-comp-screenshot";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  MemoryCompScreenshotExecutionStore,
  hashCompScreenshotBytes,
  type CompScreenshotExecutionRecord,
} from "@/lib/lease-renewal/comp-screenshot-contract";
import { RENEWAL_COMP_SCREENSHOT_ACTION_KEY } from "@/lib/lease-renewal/comp-screenshot-action";
import {
  commitCompScreenshot,
  previewCompScreenshot,
  type CompScreenshotCommitInput,
  type CompScreenshotExecutionContext,
  type CompScreenshotServiceDeps,
} from "@/lib/lease-renewal/comp-screenshot-service";

const NOW_MS = Date.parse("2026-07-30T05:00:00.000Z");
const FOLDER_ID = "folder_boundary_fixture";
const SHARED_DRIVE_ID = "shared_drive_boundary_fixture";
const OTHER_SHARED_DRIVE_ID = "shared_drive_boundary_other";
const FILE_ID = "drive_file_boundary_fixture";
const PROVIDER_IDENTITY_HASH = "b".repeat(64);
const ACTOR: AuthenticatedUser = {
  uid: "actor_boundary_editor",
  email: "boundary.editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const PRODUCTION_LIVE: EnvironmentDescriptor = {
  environmentKind: "production",
  dataContext: "live",
  source: "explicit",
};
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
  0x44, 0x52, 0x42, 0x4f, 0x55, 0x4e, 0x44, 0x41, 0x52, 0x59,
]);
const FILE_INPUT = {
  leaseId: "lease_boundary_fixture",
  filename: "boundary-comp.png",
  mimeType: "image/png",
  base64: Buffer.from(PNG_BYTES).toString("base64"),
};

type FolderOverrides = Partial<
  Pick<
    RenewalCompScreenshotDriveFolder,
    | "id"
    | "mimeType"
    | "trashed"
    | "version"
    | "isAppAuthorized"
    | "ownedByMe"
    | "driveId"
  >
> & {
  canAddChildren?: boolean;
};

type FileBoundaryTransform = (
  file: RenewalCompScreenshotDriveFile,
) => RenewalCompScreenshotDriveFile;

function makeFolder(overrides: FolderOverrides = {}): RenewalCompScreenshotDriveFolder {
  const folder: RenewalCompScreenshotDriveFolder = {
    id: overrides.id ?? FOLDER_ID,
    mimeType: overrides.mimeType ?? "application/vnd.google-apps.folder",
    trashed: overrides.trashed ?? false,
    version: overrides.version ?? "1",
    isAppAuthorized: overrides.isAppAuthorized ?? true,
    ownedByMe: overrides.ownedByMe ?? true,
    ...(overrides.driveId ? { driveId: overrides.driveId } : {}),
    capabilities: {
      canAddChildren: overrides.canAddChildren ?? true,
    },
  };
  if (
    Object.prototype.hasOwnProperty.call(overrides, "ownedByMe") &&
    overrides.ownedByMe === undefined
  ) {
    delete folder.ownedByMe;
  }
  if (
    Object.prototype.hasOwnProperty.call(overrides, "driveId") &&
    overrides.driveId === undefined
  ) {
    delete folder.driveId;
  }
  return folder;
}

function makeSharedFolder(driveId: string | undefined): RenewalCompScreenshotDriveFolder {
  return makeFolder({ ownedByMe: undefined, driveId });
}

function fileFromCreate(
  input: CreateReservedRenewalCompScreenshotInput,
  sharedDriveId?: string,
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
    createdTime: "2026-07-30T05:00:01.000Z",
    modifiedTime: "2026-07-30T05:00:01.000Z",
    version: "1",
    headRevisionId: `head_${input.fileId}`,
    webViewLink: `https://drive.google.test/file/d/${input.fileId}/view`,
    isAppAuthorized: true,
    ...(sharedDriveId ? { driveId: sharedDriveId } : { ownedByMe: true }),
    capabilities: {
      canTrash: true,
      canUntrash: true,
      canMoveItemOutOfDrive: false,
    },
  };
}

class BoundaryDriveProvider implements RenewalCompScreenshotDriveProvider {
  private folderIndex = 0;
  private file: RenewalCompScreenshotDriveFile | undefined;

  constructor(
    private readonly folderReads: RenewalCompScreenshotDriveFolder[],
    private readonly sharedDriveId?: string,
    private readonly fileBoundaryTransform?: FileBoundaryTransform,
  ) {}

  readonly reserveFileId = vi.fn(
    async (): Promise<RenewalCompScreenshotReserveOutcome> => ({
      outcome: "reserved",
      fileId: FILE_ID,
    }),
  );

  readonly getFolder = vi.fn(
    async (): Promise<RenewalCompScreenshotFolderReadOutcome> => {
      const folder =
        this.folderReads[
          Math.min(this.folderIndex++, Math.max(0, this.folderReads.length - 1))
        ];
      if (!folder) {
        return { outcome: "absent", httpStatus: 404 };
      }
      return {
        outcome: "found",
        httpStatus: 200,
        folder: structuredClone(folder),
      };
    },
  );

  readonly createReservedFile = vi.fn(
    async (
      input: CreateReservedRenewalCompScreenshotInput,
    ): Promise<RenewalCompScreenshotMutationOutcome> => {
      this.file = fileFromCreate(input, this.sharedDriveId);
      return {
        outcome: "accepted",
        httpStatus: 201,
        file: structuredClone(this.file),
      };
    },
  );

  readonly getFile = vi.fn(async (): Promise<RenewalCompScreenshotReadOutcome> => {
    if (!this.file) return { outcome: "absent", httpStatus: 404 };
    const file = this.fileBoundaryTransform
      ? this.fileBoundaryTransform(structuredClone(this.file))
      : structuredClone(this.file);
    return { outcome: "found", httpStatus: 200, file };
  });

  readonly trashFile = vi.fn(
    async (): Promise<RenewalCompScreenshotMutationOutcome> => ({
      outcome: "rejected",
      certainty: "not_applied",
      reason: "http",
      httpStatus: 404,
    }),
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

function createHarness(input?: {
  approvedSharedDriveId?: string;
  folderReads?: RenewalCompScreenshotDriveFolder[];
  fileBoundaryTransform?: FileBoundaryTransform;
}) {
  const provider = new BoundaryDriveProvider(
    input?.folderReads ?? [makeFolder()],
    input?.approvedSharedDriveId,
    input?.fileBoundaryTransform,
  );
  const store = new MemoryCompScreenshotExecutionStore();
  const createProvider = vi.fn(() => provider);
  const deps: CompScreenshotServiceDeps = {
    store,
    folderId: FOLDER_ID,
    ...(input?.approvedSharedDriveId
      ? { approvedSharedDriveId: input.approvedSharedDriveId }
      : {}),
    providerIdentityHash: PROVIDER_IDENTITY_HASH,
    createProvider,
    now: () => new Date(NOW_MS),
    nonce: () => "nonce_folder_boundary_fixture",
  };
  const context: CompScreenshotExecutionContext = {
    descriptor: PRODUCTION_LIVE,
    registry: openRegistry(),
  };
  return { provider, store, deps, context };
}

async function prepareCommit(harness: ReturnType<typeof createHarness>) {
  const outcome = await previewCompScreenshot(
    ACTOR,
    FILE_INPUT,
    harness.deps,
    harness.context,
  );
  if (outcome.status !== "preview") {
    throw new Error(`Expected preview, received ${outcome.status}.`);
  }
  const input: CompScreenshotCommitInput = {
    ...FILE_INPUT,
    executionId: outcome.preview.executionId,
    previewHash: outcome.preview.previewHash,
  };
  return { outcome, input };
}

async function commit(harness: ReturnType<typeof createHarness>) {
  const prepared = await prepareCommit(harness);
  const outcome = await commitCompScreenshot(
    ACTOR,
    prepared.input,
    harness.deps,
    harness.context,
  );
  return { prepared, outcome };
}

function withoutOwnedByMe(
  file: RenewalCompScreenshotDriveFile,
): RenewalCompScreenshotDriveFile {
  delete file.ownedByMe;
  return file;
}

function withoutDriveId(
  file: RenewalCompScreenshotDriveFile,
): RenewalCompScreenshotDriveFile {
  delete file.driveId;
  return file;
}

describe("renewal comp screenshot Drive parent boundary", () => {
  it("accepts only an owned subject My Drive folder with no driveId", async () => {
    const harness = createHarness({
      folderReads: [makeFolder({ ownedByMe: true, driveId: undefined })],
    });

    const { outcome } = await commit(harness);

    expect(outcome.status).toBe("delivered");
    expect(harness.provider.getFolder).toHaveBeenCalledTimes(2);
    expect(harness.provider.reserveFileId).toHaveBeenCalledTimes(1);
    expect(harness.provider.createReservedFile).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["ownedByMe false", makeFolder({ ownedByMe: false, driveId: undefined })],
    ["ownedByMe omitted", makeFolder({ ownedByMe: undefined, driveId: undefined })],
    ["any Shared Drive id", makeFolder({ ownedByMe: true, driveId: SHARED_DRIVE_ID })],
  ])("rejects My Drive parent evidence with %s before reservation", async (_, folder) => {
    const harness = createHarness({ folderReads: [folder] });

    const { outcome } = await commit(harness);

    expect(outcome.status).toBe("absent");
    expect(harness.provider.reserveFileId).not.toHaveBeenCalled();
    expect(harness.provider.createReservedFile).not.toHaveBeenCalled();
    expect(harness.provider.getFile).not.toHaveBeenCalled();
  });

  it("accepts only the exact configured Shared Drive id", async () => {
    const harness = createHarness({
      approvedSharedDriveId: SHARED_DRIVE_ID,
      folderReads: [makeSharedFolder(SHARED_DRIVE_ID)],
    });

    const { outcome } = await commit(harness);

    expect(outcome.status).toBe("delivered");
    expect(harness.provider.getFolder).toHaveBeenCalledTimes(2);
    expect(harness.provider.reserveFileId).toHaveBeenCalledTimes(1);
    expect(harness.provider.createReservedFile).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an absent driveId", makeSharedFolder(undefined)],
    ["a different driveId", makeSharedFolder(OTHER_SHARED_DRIVE_ID)],
  ])("rejects a Shared Drive parent with %s before reservation", async (_, folder) => {
    const harness = createHarness({
      approvedSharedDriveId: SHARED_DRIVE_ID,
      folderReads: [folder],
    });

    const { outcome } = await commit(harness);

    expect(outcome.status).toBe("absent");
    expect(harness.provider.reserveFileId).not.toHaveBeenCalled();
    expect(harness.provider.createReservedFile).not.toHaveBeenCalled();
    expect(harness.provider.getFile).not.toHaveBeenCalled();
  });

  it.each([
    ["version changes", makeFolder({ version: "1" }), makeFolder({ version: "2" })],
    [
      "app authorization disappears",
      makeFolder({ version: "1", isAppAuthorized: true }),
      makeFolder({ version: "1", isAppAuthorized: false }),
    ],
  ])(
    "creates no file when bound parent metadata %s before the immediate pre-create read",
    async (_, firstFolder, secondFolder) => {
      const harness = createHarness({
        folderReads: [firstFolder, secondFolder],
      });

      const { outcome } = await commit(harness);

      expect(outcome.status).toBe("absent");
      expect(harness.provider.getFolder).toHaveBeenCalledTimes(2);
      expect(harness.provider.reserveFileId).toHaveBeenCalledTimes(1);
      expect(harness.provider.createReservedFile).not.toHaveBeenCalled();
      expect(harness.provider.getFile).not.toHaveBeenCalled();
    },
  );
});

describe("renewal comp screenshot Drive file readback boundary", () => {
  it.each([
    [
      "My Drive ownedByMe false",
      undefined,
      (file: RenewalCompScreenshotDriveFile) => ({ ...file, ownedByMe: false }),
    ],
    ["My Drive ownedByMe omitted", undefined, withoutOwnedByMe],
    [
      "My Drive file reports a driveId",
      undefined,
      (file: RenewalCompScreenshotDriveFile) => ({
        ...file,
        driveId: SHARED_DRIVE_ID,
      }),
    ],
    ["Shared Drive file omits driveId", SHARED_DRIVE_ID, withoutDriveId],
    [
      "Shared Drive file reports another driveId",
      SHARED_DRIVE_ID,
      (file: RenewalCompScreenshotDriveFile) => ({
        ...file,
        driveId: OTHER_SHARED_DRIVE_ID,
      }),
    ],
  ])(
    "creates no receipt when %s",
    async (_, approvedSharedDriveId, fileBoundaryTransform) => {
      const harness = createHarness({
        ...(approvedSharedDriveId ? { approvedSharedDriveId } : {}),
        folderReads: [
          approvedSharedDriveId ? makeSharedFolder(SHARED_DRIVE_ID) : makeFolder(),
        ],
        fileBoundaryTransform,
      });

      const { prepared, outcome } = await commit(harness);
      const record = await harness.store.getExecution(
        prepared.outcome.preview.executionId,
      );

      expect(harness.provider.createReservedFile).toHaveBeenCalledTimes(1);
      expect(harness.provider.getFile).toHaveBeenCalledTimes(1);
      expect(outcome.status).toBe("ambiguous");
      expect(record?.state).toBe("ambiguous");
      expect(record?.receipt).toBeUndefined();
    },
  );
});

describe("MemoryCompScreenshotExecutionStore folder evidence interlock", () => {
  async function claimedRecord() {
    const harness = createHarness();
    const prepared = await prepareCommit(harness);
    const preview = await harness.store.getPreview(prepared.outcome.preview.previewHash);
    if (!preview) throw new Error("Expected stored preview.");
    const claim = await harness.store.claim({
      previewHash: preview.id,
      executionId: preview.executionId,
      actorUid: ACTOR.uid,
      nowMs: NOW_MS,
    });
    if (claim.status !== "claimed") {
      throw new Error(`Expected claimed, received ${claim.status}.`);
    }
    return { harness, preview, record: claim.record };
  }

  it.each([
    ["metadata hash only", { folderMetadataHash: "f".repeat(64) }],
    ["folder version only", { folderVersion: "1" }],
  ])("refuses file reservation and upload start with %s", async (_, partialEvidence) => {
    const reservedFixture = await claimedRecord();
    reservedFixture.harness.store.executions.set(reservedFixture.record.id, {
      ...reservedFixture.record,
      ...partialEvidence,
    } as CompScreenshotExecutionRecord);
    expect(
      await reservedFixture.harness.store.reserveFileId(
        reservedFixture.record.id,
        FILE_ID,
        NOW_MS + 1,
      ),
    ).toMatchObject({ status: "consumed" });

    const uploadFixture = await claimedRecord();
    uploadFixture.harness.store.executions.set(uploadFixture.record.id, {
      ...uploadFixture.record,
      ...partialEvidence,
      state: "id_reserved",
      reservedFileId: FILE_ID,
    } as CompScreenshotExecutionRecord);
    expect(
      await uploadFixture.harness.store.beginUpload(uploadFixture.record.id, NOW_MS + 1),
    ).toMatchObject({ status: "consumed" });
  });

  it("rejects malformed evidence and permits reservation then upload only after both fields bind", async () => {
    const { harness, preview, record } = await claimedRecord();
    expect(
      await harness.store.bindFolderEvidence(
        record.id,
        { folderMetadataHash: "short", folderVersion: "1" },
        NOW_MS + 1,
      ),
    ).toMatchObject({ status: "mismatch" });
    expect(
      await harness.store.bindFolderEvidence(
        record.id,
        { folderMetadataHash: "f".repeat(64), folderVersion: "not-a-version" },
        NOW_MS + 2,
      ),
    ).toMatchObject({ status: "mismatch" });
    expect(
      await harness.store.reserveFileId(record.id, FILE_ID, NOW_MS + 3),
    ).toMatchObject({ status: "consumed" });

    expect(
      await harness.store.bindFolderEvidence(
        preview.executionId,
        { folderMetadataHash: "f".repeat(64), folderVersion: "1" },
        NOW_MS + 4,
      ),
    ).toMatchObject({ status: "bound" });
    expect(
      await harness.store.reserveFileId(record.id, FILE_ID, NOW_MS + 5),
    ).toMatchObject({ status: "reserved" });
    expect(await harness.store.beginUpload(record.id, NOW_MS + 6)).toMatchObject({
      status: "started",
    });
  });
});
