import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { CompScreenshotExecutionRecord } from "@/lib/lease-renewal/comp-screenshot-contract";
import {
  buildCompScreenshotReceipt,
  sameCompScreenshotReceipt,
} from "@/lib/lease-renewal/comp-screenshot-contract";

export interface CompScreenshotAttachment {
  compRecordHash: string;
  executionId: string;
  receiptId: string;
  resultHash: string;
  ref: string;
}

export function compScreenshotHeadDocId(compRecordHash: string): string {
  return hashExecutionPreview({ compRecordHash });
}

/**
 * Treat a screenshot reference as authority only when it can be rebuilt from the current delivered
 * execution. A browser string, a stale head, a partially persisted receipt, and any active rollback
 * lineage all fail closed.
 */
export function attachableCompScreenshot(
  record: CompScreenshotExecutionRecord | null,
  expectedCompRecordHash: string,
): CompScreenshotAttachment | null {
  if (
    !record ||
    record.state !== "delivered" ||
    !record.receipt ||
    !record.reservedFileId ||
    record.compRecordHash !== expectedCompRecordHash ||
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
    compRecordHash: record.compRecordHash,
    executionId: record.id,
    receiptId: receipt.receiptId,
    resultHash: receipt.resultHash,
    ref: receipt.ref,
  };
}
