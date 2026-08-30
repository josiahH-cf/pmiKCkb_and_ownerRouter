import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeSuspension = vi.hoisted(() => ({
  current: { status: "clear" } as { status: string },
}));
vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: vi.fn(async () => runtimeSuspension.current),
}));

import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import type { RenewalCompScreenshotDriveFile } from "@/lib/google-drive/renewal-comp-screenshot";
import { ActionNotExecutableError } from "@/lib/integrations/action-gate";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  attachableCompScreenshot,
  compScreenshotDraftAttachmentIdentity,
  compScreenshotDriveFileMetadataHash,
} from "@/lib/lease-renewal/comp-screenshot-attachment";
import { resolveRenewalDraftCompScreenshotAttachment } from "@/lib/lease-renewal/comp-screenshot-attachment-runtime";
import { RENEWAL_COMP_SCREENSHOT_ACTION_KEY } from "@/lib/lease-renewal/comp-screenshot-action";
import { ActionRuntimeSuspendedError } from "@/lib/operations/runtime-suspension-gate";
import {
  buildCompScreenshotPreview,
  buildCompScreenshotReceipt,
  compScreenshotExecutionFromPreview,
  compScreenshotProviderPayload,
  compScreenshotRecordIdentity,
  hashCompScreenshotBytes,
  hashCompScreenshotFilename,
  type CompScreenshotExecutionRecord,
} from "@/lib/lease-renewal/comp-screenshot-contract";

const LEASE_ID = "lease_s79_fixture";
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04,
]);
const DESCRIPTOR: EnvironmentDescriptor = {
  environmentKind: "production",
  dataContext: "live",
  source: "explicit",
};

function deliveredRecord(): CompScreenshotExecutionRecord {
  const identity = compScreenshotRecordIdentity(LEASE_ID);
  const preview = buildCompScreenshotPreview({
    actorUid: "editor_s79",
    ...identity,
    folderId: "approved_folder_s79",
    providerIdentityHash: "a".repeat(64),
    contentSha256: hashCompScreenshotBytes(PNG_BYTES, "sha256"),
    contentMd5: hashCompScreenshotBytes(PNG_BYTES, "md5"),
    sourceFilenameHash: hashCompScreenshotFilename("browser-name.png"),
    mimeType: "image/png",
    sizeBytes: PNG_BYTES.byteLength,
    descriptor: DESCRIPTOR,
    nowMs: Date.parse("2026-08-30T04:00:00.000Z"),
    nonce: "s79_attachment_fixture",
  });
  const record = compScreenshotExecutionFromPreview(
    preview,
    Date.parse("2026-08-30T04:00:01.000Z"),
  );
  record.reservedFileId = "drive_file_s79_receipt";
  record.folderMetadataHash = "b".repeat(64);
  record.folderVersion = "7";
  const file = driveFile(record);
  const providerPayloadHash = compScreenshotProviderPayload(record).providerPayloadHash;
  record.receipt = buildCompScreenshotReceipt(
    record,
    {
      fileId: record.reservedFileId,
      providerPayloadHash,
      providerMetadataHash: compScreenshotDriveFileMetadataHash(file),
      md5Checksum: record.contentMd5,
      sha256Checksum: record.contentSha256,
      version: "11",
      headRevisionId: "head_s79_receipt",
      createdTime: "2026-08-30T04:00:02.000Z",
      canUntrash: true,
    },
    false,
  );
  record.state = "delivered";
  return record;
}

function driveFile(
  record: CompScreenshotExecutionRecord,
): RenewalCompScreenshotDriveFile {
  return {
    id: record.reservedFileId!,
    name: record.driveFilename,
    mimeType: record.mimeType,
    size: String(record.sizeBytes),
    md5Checksum: record.contentMd5,
    sha256Checksum: record.contentSha256,
    parents: [record.folderId],
    trashed: false,
    explicitlyTrashed: false,
    appProperties: compScreenshotProviderPayload(record).appProperties,
    createdTime: "2026-08-30T04:00:02.000Z",
    modifiedTime: "2026-08-30T04:00:02.000Z",
    version: "11",
    headRevisionId: "head_s79_receipt",
    isAppAuthorized: true,
    ownedByMe: true,
    capabilities: {
      canTrash: true,
      canUntrash: true,
      canMoveItemOutOfDrive: false,
    },
  };
}

function openRegistry(): CreateActionRegistryInput[] {
  const entry = ACTION_REGISTRY_SEED.find(
    (candidate) => candidate.key === RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
  );
  if (!entry) throw new Error("Expected screenshot registry entry.");
  return [
    {
      ...entry,
      readiness: "Approved for Execution",
      evidence_status: "Documented",
      production_allowed: true,
    },
  ];
}

beforeEach(() => {
  runtimeSuspension.current = { status: "clear" };
});

describe("current receipt-bound comp screenshot attachment (ARCH-S79-1)", () => {
  it("projects the server filename and exact receipt/content identity, never the browser filename", () => {
    const record = deliveredRecord();
    const identity = compScreenshotRecordIdentity(LEASE_ID);

    const attachment = attachableCompScreenshot(
      record,
      identity.compRecordHash,
      identity.renewalRecordHash,
    );

    expect(attachment).toEqual({
      spaceId: "renewals",
      compRecordHash: identity.compRecordHash,
      renewalRecordHash: identity.renewalRecordHash,
      executionId: record.id,
      receiptId: record.receipt!.receiptId,
      resultHash: record.receipt!.resultHash,
      fileId: record.receipt!.fileId,
      folderId: record.folderId,
      filename: record.driveFilename,
      mimeType: "image/png",
      sizeBytes: PNG_BYTES.byteLength,
      md5Checksum: record.contentMd5,
      sha256Checksum: record.contentSha256,
      providerPayloadHash: record.receipt!.providerPayloadHash,
      providerMetadataHash: record.receipt!.providerMetadataHash,
      version: record.receipt!.version,
      headRevisionId: record.receipt!.headRevisionId,
      createdTime: record.receipt!.createdTime,
      ref: record.receipt!.ref,
    });
    expect(JSON.stringify(attachment)).not.toContain("browser-name.png");
    expect(() =>
      compScreenshotDraftAttachmentIdentity({
        ...attachment!,
        mimeType: "image/jpeg",
      }),
    ).toThrow(/filename does not match/i);
  });

  it("refuses the same receipt under another lease identity or any active/finished rollback", () => {
    const record = deliveredRecord();
    const identity = compScreenshotRecordIdentity(LEASE_ID);
    const other = compScreenshotRecordIdentity("lease_s79_other");

    expect(
      attachableCompScreenshot(record, identity.compRecordHash, other.renewalRecordHash),
    ).toBeNull();

    for (const state of ["running", "ambiguous", "succeeded"] as const) {
      expect(
        attachableCompScreenshot(
          {
            ...record,
            rollback: {
              id: `rollback_${state}`,
              bindingHash: "d".repeat(64),
              previewHash: "e".repeat(64),
              actorUid: "admin_s79",
              state,
              attemptCount: 1,
              createdAt: "2026-08-30T04:01:00.000Z",
              updatedAt: "2026-08-30T04:01:00.000Z",
            },
          },
          identity.compRecordHash,
          identity.renewalRecordHash,
        ),
      ).toBeNull();
    }
  });

  it("refuses the committed closed Drive key before receipt lookup or Drive construction", async () => {
    const record = deliveredRecord();
    const current = attachableCompScreenshot(
      record,
      record.compRecordHash,
      record.renewalRecordHash,
    )!;
    const getLatestExecution = vi.fn(async () => record);
    const createProvider = vi.fn();

    await expect(
      resolveRenewalDraftCompScreenshotAttachment(
        LEASE_ID,
        compScreenshotDraftAttachmentIdentity(current),
        {
          store: { getLatestExecution } as never,
          folderId: record.folderId,
          approvedSharedDriveId: "",
          providerIdentityHash: record.providerIdentityHash,
          createProvider: createProvider as never,
        },
        { descriptor: DESCRIPTOR },
      ),
    ).rejects.toBeInstanceOf(ActionNotExecutableError);
    expect(getLatestExecution).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
  });

  // S51_DYNAMIC_REFUSAL:comp-screenshot-attachment-provider
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "refuses attachment Drive construction when its dynamic runtime state is %s",
    async (status) => {
      const record = deliveredRecord();
      const current = attachableCompScreenshot(
        record,
        record.compRecordHash,
        record.renewalRecordHash,
      )!;
      const getLatestExecution = vi.fn(async () => record);
      const createProvider = vi.fn();
      runtimeSuspension.current = { status };
      try {
        await expect(
          resolveRenewalDraftCompScreenshotAttachment(
            LEASE_ID,
            compScreenshotDraftAttachmentIdentity(current),
            {
              store: { getLatestExecution } as never,
              folderId: record.folderId,
              approvedSharedDriveId: "",
              providerIdentityHash: record.providerIdentityHash,
              createProvider: createProvider as never,
            },
            { descriptor: DESCRIPTOR, registry: openRegistry() },
          ),
        ).rejects.toBeInstanceOf(ActionRuntimeSuspendedError);
        expect(getLatestExecution).not.toHaveBeenCalled();
        expect(createProvider).not.toHaveBeenCalled();
      } finally {
        runtimeSuspension.current = { status: "clear" };
      }
    },
  );

  it("under a test-open gate, reloads exact metadata and returns only byte-identical image bytes", async () => {
    const record = deliveredRecord();
    const file = driveFile(record);
    const current = attachableCompScreenshot(
      record,
      record.compRecordHash,
      record.renewalRecordHash,
    )!;
    const getFile = vi.fn(async () => ({
      outcome: "found" as const,
      httpStatus: 200,
      file,
    }));
    const downloadFile = vi.fn(async () => ({
      outcome: "downloaded" as const,
      httpStatus: 200,
      contentType: "image/png",
      bytes: PNG_BYTES,
    }));
    const createProvider = vi.fn(() => ({ getFile, downloadFile }));

    const resolved = await resolveRenewalDraftCompScreenshotAttachment(
      LEASE_ID,
      compScreenshotDraftAttachmentIdentity(current),
      {
        store: { getLatestExecution: async () => record } as never,
        folderId: record.folderId,
        approvedSharedDriveId: "",
        providerIdentityHash: record.providerIdentityHash,
        createProvider: createProvider as never,
      },
      { descriptor: DESCRIPTOR, registry: openRegistry() },
    );

    expect(resolved.bytes).toEqual(PNG_BYTES);
    expect(resolved).toMatchObject(compScreenshotDraftAttachmentIdentity(current));
    expect(createProvider).toHaveBeenCalledTimes(1);
    expect(getFile).toHaveBeenCalledWith(record.reservedFileId);
    expect(downloadFile).toHaveBeenCalledWith(record.reservedFileId);
  });

  it("refuses changed bytes after exact metadata without returning an attachment", async () => {
    const record = deliveredRecord();
    const file = driveFile(record);
    const current = attachableCompScreenshot(
      record,
      record.compRecordHash,
      record.renewalRecordHash,
    )!;
    const changed = new Uint8Array(PNG_BYTES);
    changed[changed.length - 1] ^= 0xff;

    await expect(
      resolveRenewalDraftCompScreenshotAttachment(
        LEASE_ID,
        compScreenshotDraftAttachmentIdentity(current),
        {
          store: { getLatestExecution: async () => record } as never,
          folderId: record.folderId,
          approvedSharedDriveId: "",
          providerIdentityHash: record.providerIdentityHash,
          createProvider: (() => ({
            getFile: async () => ({ outcome: "found", httpStatus: 200, file }),
            downloadFile: async () => ({
              outcome: "downloaded",
              httpStatus: 200,
              contentType: "image/png",
              bytes: changed,
            }),
          })) as never,
        },
        { descriptor: DESCRIPTOR, registry: openRegistry() },
      ),
    ).rejects.toMatchObject({ code: "provider_mismatch" });
  });
});
