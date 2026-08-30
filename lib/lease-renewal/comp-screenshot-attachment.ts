import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { RenewalCompScreenshotDriveFile } from "@/lib/google-drive/renewal-comp-screenshot";
import type { CompScreenshotExecutionRecord } from "@/lib/lease-renewal/comp-screenshot-contract";
import {
  buildCompScreenshotReceipt,
  hashCompScreenshotFilename,
  sameCompScreenshotReceipt,
} from "@/lib/lease-renewal/comp-screenshot-contract";
import {
  validateRenewalDraftAttachmentIdentity,
  type RenewalDraftAttachmentIdentity,
} from "@/lib/lease-renewal/execution/renewal-draft-attachment";

export interface CompScreenshotAttachment {
  /** Fixed product Space. Browser input can never select or widen this boundary. */
  spaceId: "renewals";
  compRecordHash: string;
  renewalRecordHash: string;
  executionId: string;
  receiptId: string;
  resultHash: string;
  fileId: string;
  folderId: string;
  approvedSharedDriveId?: string;
  filename: string;
  mimeType: RenewalDraftAttachmentIdentity["mimeType"];
  sizeBytes: number;
  md5Checksum: string;
  sha256Checksum: string;
  providerPayloadHash: string;
  providerMetadataHash: string;
  version: string;
  headRevisionId: string;
  createdTime: string;
  ref: string;
}

export function compScreenshotHeadDocId(compRecordHash: string): string {
  return hashExecutionPreview({ compRecordHash });
}

export function compScreenshotDraftAttachmentIdentity(
  attachment: CompScreenshotAttachment,
): RenewalDraftAttachmentIdentity {
  return validateRenewalDraftAttachmentIdentity({
    spaceId: attachment.spaceId,
    compRecordHash: attachment.compRecordHash,
    renewalRecordHash: attachment.renewalRecordHash,
    executionId: attachment.executionId,
    receiptId: attachment.receiptId,
    resultHash: attachment.resultHash,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    sha256Checksum: attachment.sha256Checksum,
  });
}

/** Shared exact metadata hash used both when issuing the receipt and when attaching later. */
export function compScreenshotDriveFileMetadataHash(
  file: RenewalCompScreenshotDriveFile,
): string {
  return hashExecutionPreview({
    fileId: file.id,
    nameHash: hashCompScreenshotFilename(file.name),
    mimeType: file.mimeType,
    size: file.size,
    md5Checksum: file.md5Checksum?.toLowerCase() ?? null,
    sha256Checksum: file.sha256Checksum?.toLowerCase() ?? null,
    parents: file.parents,
    trashed: file.trashed,
    explicitlyTrashed: file.explicitlyTrashed,
    appProperties: file.appProperties,
    createdTime: file.createdTime,
    modifiedTime: file.modifiedTime,
    version: file.version,
    headRevisionId: file.headRevisionId ?? null,
    isAppAuthorized: file.isAppAuthorized,
    ownedByMe: file.ownedByMe ?? null,
    driveId: file.driveId ?? null,
    canTrash: file.capabilities.canTrash,
    canUntrash: file.capabilities.canUntrash,
  });
}

/**
 * Treat a screenshot reference as authority only when it can be rebuilt from the current delivered
 * execution. A browser string, a stale head, a partially persisted receipt, and any active rollback
 * lineage all fail closed.
 */
export function attachableCompScreenshot(
  record: CompScreenshotExecutionRecord | null,
  expectedCompRecordHash: string,
  expectedRenewalRecordHash?: string,
): CompScreenshotAttachment | null {
  if (
    !record ||
    record.state !== "delivered" ||
    !record.receipt ||
    !record.reservedFileId ||
    record.compRecordHash !== expectedCompRecordHash ||
    (expectedRenewalRecordHash !== undefined &&
      record.renewalRecordHash !== expectedRenewalRecordHash) ||
    (record.rollback && record.rollback.state !== "failed")
  ) {
    return null;
  }

  const receipt = record.receipt;
  if (
    receipt.executionId !== record.id ||
    receipt.receiptId !== record.id ||
    receipt.idempotencyKey !== record.id ||
    receipt.previewHash !== record.previewHash ||
    receipt.compRecordHash !== record.compRecordHash ||
    receipt.fileId !== record.reservedFileId ||
    receipt.ref !== `drive:${record.reservedFileId}` ||
    receipt.mimeType !== record.mimeType ||
    receipt.sizeBytes !== record.sizeBytes ||
    receipt.md5Checksum !== record.contentMd5 ||
    receipt.sha256Checksum !== record.contentSha256
  ) {
    return null;
  }

  let rebuilt;
  try {
    rebuilt = buildCompScreenshotReceipt(
      record,
      {
        fileId: receipt.fileId,
        providerPayloadHash: receipt.providerPayloadHash,
        providerMetadataHash: receipt.providerMetadataHash,
        md5Checksum: receipt.md5Checksum,
        sha256Checksum: receipt.sha256Checksum,
        version: receipt.version,
        headRevisionId: receipt.headRevisionId,
        createdTime: receipt.createdTime,
        ...(receipt.webViewLink ? { webViewLink: receipt.webViewLink } : {}),
        canUntrash: receipt.canUntrash,
      },
      receipt.reconciled,
    );
  } catch {
    return null;
  }
  if (!sameCompScreenshotReceipt(receipt, rebuilt)) return null;

  return {
    spaceId: "renewals",
    compRecordHash: record.compRecordHash,
    renewalRecordHash: record.renewalRecordHash,
    executionId: record.id,
    receiptId: receipt.receiptId,
    resultHash: receipt.resultHash,
    fileId: receipt.fileId,
    folderId: record.folderId,
    ...(record.approvedSharedDriveId
      ? { approvedSharedDriveId: record.approvedSharedDriveId }
      : {}),
    filename: record.driveFilename,
    mimeType: receipt.mimeType,
    sizeBytes: receipt.sizeBytes,
    md5Checksum: receipt.md5Checksum,
    sha256Checksum: receipt.sha256Checksum,
    providerPayloadHash: receipt.providerPayloadHash,
    providerMetadataHash: receipt.providerMetadataHash,
    version: receipt.version,
    headRevisionId: receipt.headRevisionId,
    createdTime: receipt.createdTime,
    ref: receipt.ref,
  };
}
