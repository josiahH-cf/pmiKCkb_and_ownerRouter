import { createHash } from "node:crypto";

import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";
import { canonicalJson, hashExecutionPreview } from "@/lib/execution/preview-hash";
import { RENEWAL_COMP_SCREENSHOT_ACTION_KEY } from "@/lib/lease-renewal/comp-screenshot-action";
import type { AllowedImageMimeType } from "@/lib/maintenance/image-mime";

export const COMP_SCREENSHOT_PREVIEW_TTL_MS = 10 * 60 * 1_000;
export const COMP_SCREENSHOT_MAX_BYTES = 5 * 1_024 * 1_024;
/**
 * One create plus its exact-ID readback can each consume the provider's 30-second timeout.
 * The durable lease leaves another full minute of margin before same-ID recovery may dispatch.
 */
export const COMP_SCREENSHOT_UPLOAD_DISPATCH_LEASE_MS = 2 * 60 * 1_000;
export const COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS = 2 * 60 * 1_000;

export type CompScreenshotExecutionState =
  | "claimed"
  | "id_reserved"
  | "upload_started"
  | "ambiguous"
  | "delivered"
  | "absent"
  | "failed"
  | "rolled_back";

export type CompScreenshotRollbackState =
  | "running"
  | "ambiguous"
  | "succeeded"
  | "failed";

/**
 * Immutable, bodyless binding for one selected file and one server-owned renewal evidence slot.
 * It intentionally contains neither image bytes nor a caller-controlled filename.
 */
export interface CompScreenshotActionBinding {
  actorUid: string;
  renewalRecordHash: string;
  compRecordHash: string;
  folderId: string;
  /** Empty/absent means the exact parent must be subject-owned My Drive. */
  approvedSharedDriveId?: string;
  providerIdentityHash: string;
  contentSha256: string;
  contentMd5: string;
  sourceFilenameHash: string;
  mimeType: AllowedImageMimeType;
  sizeBytes: number;
  descriptor: EnvironmentDescriptor;
  predecessorExecutionId?: string;
}

export interface CompScreenshotPreviewRecord {
  id: string;
  executionId: string;
  bindingHash: string;
  binding: CompScreenshotActionBinding;
  issuedAtMs: number;
  expiresAtMs: number;
}

export interface CompScreenshotReceipt {
  receiptId: string;
  actionKey: typeof RENEWAL_COMP_SCREENSHOT_ACTION_KEY;
  executionId: string;
  idempotencyKey: string;
  previewHash: string;
  compRecordHash: string;
  fileId: string;
  ref: string;
  targetHash: string;
  folderMetadataHash: string;
  folderVersion: string;
  providerPayloadHash: string;
  providerMetadataHash: string;
  mimeType: AllowedImageMimeType;
  sizeBytes: number;
  md5Checksum: string;
  sha256Checksum: string;
  version: string;
  headRevisionId: string;
  createdTime: string;
  webViewLink?: string;
  canUntrash: boolean;
  resultHash: string;
  reconciled: boolean;
  createdAt: string;
}

export interface CompScreenshotRollbackReceipt {
  receiptId: string;
  actionKey: typeof RENEWAL_COMP_SCREENSHOT_ACTION_KEY;
  operation: "trash";
  rollbackId: string;
  executionId: string;
  originalReceiptId: string;
  previewHash: string;
  fileId: string;
  providerMetadataHashBefore: string;
  providerMetadataHashAfter: string;
  versionBefore: string;
  versionAfter: string;
  headRevisionIdBefore: string;
  headRevisionIdAfter: string;
  explicitlyTrashed: true;
  canUntrash: boolean;
  resultHash: string;
  reconciled: boolean;
  createdAt: string;
}

export interface CompScreenshotRollbackRecord {
  id: string;
  bindingHash: string;
  previewHash: string;
  actorUid: string;
  state: CompScreenshotRollbackState;
  attemptCount: 1;
  /** Monotonic same-file trash/recovery dispatch generation. */
  dispatchGeneration?: number;
  /** A competing caller may not dispatch trash before this server-owned deadline. */
  dispatchLeaseExpiresAtMs?: number;
  createdAt: string;
  updatedAt: string;
  receipt?: CompScreenshotRollbackReceipt;
}

export interface CompScreenshotExecutionRecord {
  id: string;
  actionKey: typeof RENEWAL_COMP_SCREENSHOT_ACTION_KEY;
  bindingHash: string;
  actorUid: string;
  renewalRecordHash: string;
  compRecordHash: string;
  folderId: string;
  approvedSharedDriveId?: string;
  providerIdentityHash: string;
  contentSha256: string;
  contentMd5: string;
  sourceFilenameHash: string;
  mimeType: AllowedImageMimeType;
  sizeBytes: number;
  descriptor: EnvironmentDescriptor;
  predecessorExecutionId?: string;
  previewHash: string;
  driveFilename: string;
  state: CompScreenshotExecutionState;
  /** One logical provider effect. Byte-identical same-ID HTTP recovery remains this same attempt. */
  attemptCount: 1;
  reservedFileId?: string;
  /** Exact, durable parent evidence bound before any file-create dispatch. */
  folderMetadataHash?: string;
  folderVersion?: string;
  /** Monotonic HTTP-dispatch recovery generation; it never changes logical effect identity. */
  dispatchGeneration?: number;
  /** A competing caller may not dispatch this reserved ID before this server-owned deadline. */
  dispatchLeaseExpiresAtMs?: number;
  createdAt: string;
  updatedAt: string;
  receipt?: CompScreenshotReceipt;
  rollback?: CompScreenshotRollbackRecord;
}

export interface CompScreenshotRollbackBinding {
  actorUid: string;
  executionId: string;
  originalReceiptId: string;
  originalResultHash: string;
  fileId: string;
  providerIdentityHash: string;
  providerMetadataHash: string;
  providerVersion: string;
  providerHeadRevisionId: string;
  canTrash: true;
  canUntrash: boolean;
  descriptor: EnvironmentDescriptor;
}

export interface CompScreenshotRollbackPreviewRecord {
  id: string;
  rollbackId: string;
  bindingHash: string;
  binding: CompScreenshotRollbackBinding;
  /**
   * A separately authenticated Admin who may finalize an already-observed explicit trash effect.
   * This never changes the original exact confirmer or provider-effect binding.
   */
  recoveryActorUid?: string;
  issuedAtMs: number;
  expiresAtMs: number;
  providerDriftedSinceReceipt: boolean;
}

export type ClaimCompScreenshotResult =
  | { status: "claimed"; record: CompScreenshotExecutionRecord }
  | {
      status: "duplicate";
      record: CompScreenshotExecutionRecord;
      receipt: CompScreenshotReceipt;
    }
  | {
      status: "ambiguous" | "consumed" | "expired" | "in_progress" | "mismatch";
      record?: CompScreenshotExecutionRecord;
    };

export type ReserveCompScreenshotFileIdResult =
  | {
      status: "reserved" | "existing";
      record: CompScreenshotExecutionRecord;
      fileId: string;
    }
  | {
      status: "duplicate";
      record: CompScreenshotExecutionRecord;
      receipt: CompScreenshotReceipt;
    }
  | { status: "consumed" | "mismatch"; record?: CompScreenshotExecutionRecord };

export interface CompScreenshotFolderEvidence {
  folderMetadataHash: string;
  folderVersion: string;
}

export type BindCompScreenshotFolderEvidenceResult =
  | {
      status: "bound" | "existing";
      record: CompScreenshotExecutionRecord;
    }
  | {
      status: "duplicate";
      record: CompScreenshotExecutionRecord;
      receipt: CompScreenshotReceipt;
    }
  | { status: "consumed" | "mismatch"; record?: CompScreenshotExecutionRecord };

export type BeginCompScreenshotUploadResult =
  | {
      status: "started" | "retry";
      record: CompScreenshotExecutionRecord;
      fileId: string;
      dispatchGeneration: number;
      dispatchLeaseExpiresAtMs: number;
    }
  | {
      status: "in_progress";
      record: CompScreenshotExecutionRecord;
      fileId: string;
      dispatchGeneration: number;
      dispatchLeaseExpiresAtMs: number;
    }
  | {
      status: "duplicate";
      record: CompScreenshotExecutionRecord;
      receipt: CompScreenshotReceipt;
    }
  | { status: "consumed" | "mismatch"; record?: CompScreenshotExecutionRecord };

export type ClaimCompScreenshotRollbackResult =
  | {
      status: "claimed" | "retry";
      record: CompScreenshotExecutionRecord;
      rollback: CompScreenshotRollbackRecord;
      dispatchGeneration: number;
      dispatchLeaseExpiresAtMs: number;
    }
  | {
      status: "duplicate";
      record: CompScreenshotExecutionRecord;
      receipt: CompScreenshotRollbackReceipt;
    }
  | {
      status: "consumed" | "expired" | "in_progress" | "mismatch";
      record?: CompScreenshotExecutionRecord;
    };

export interface MarkCompScreenshotRollbackStateInput {
  executionId: string;
  rollbackId: string;
  previewHash: string;
  dispatchGeneration: number;
  nowMs: number;
}

export interface CompScreenshotExecutionStore {
  createPreview(record: CompScreenshotPreviewRecord): Promise<void>;
  getPreview(id: string): Promise<CompScreenshotPreviewRecord | null>;
  getExecution(id: string): Promise<CompScreenshotExecutionRecord | null>;
  getLatestExecution(
    compRecordHash: string,
  ): Promise<CompScreenshotExecutionRecord | null>;
  claim(input: {
    previewHash: string;
    executionId: string;
    actorUid: string;
    nowMs: number;
  }): Promise<ClaimCompScreenshotResult>;
  bindFolderEvidence(
    executionId: string,
    evidence: CompScreenshotFolderEvidence,
    nowMs: number,
  ): Promise<BindCompScreenshotFolderEvidenceResult>;
  reserveFileId(
    executionId: string,
    candidateFileId: string,
    nowMs: number,
  ): Promise<ReserveCompScreenshotFileIdResult>;
  beginUpload(
    executionId: string,
    nowMs: number,
  ): Promise<BeginCompScreenshotUploadResult>;
  finish(
    executionId: string,
    receipt: CompScreenshotReceipt,
  ): Promise<CompScreenshotReceipt>;
  markAmbiguous(input: {
    executionId: string;
    dispatchGeneration: number;
    nowMs: number;
    requireLeaseExpiry?: boolean;
  }): Promise<boolean>;
  markAbsentIfNotStarted(executionId: string, nowMs: number): Promise<boolean>;
  markDeterministicNoEffect(input: {
    executionId: string;
    dispatchGeneration: number;
    nowMs: number;
  }): Promise<boolean>;
  createRollbackPreview(record: CompScreenshotRollbackPreviewRecord): Promise<void>;
  getRollbackPreview(id: string): Promise<CompScreenshotRollbackPreviewRecord | null>;
  claimRollback(input: {
    previewHash: string;
    rollbackId: string;
    executionId: string;
    leaseId: string;
    actorUid: string;
    nowMs: number;
    observedExplicitTrash?: boolean;
  }): Promise<ClaimCompScreenshotRollbackResult>;
  finishRollback(
    executionId: string,
    dispatchGeneration: number,
    receipt: CompScreenshotRollbackReceipt,
  ): Promise<CompScreenshotRollbackReceipt>;
  markRollbackAmbiguous(input: MarkCompScreenshotRollbackStateInput): Promise<boolean>;
  markRollbackFailed(input: MarkCompScreenshotRollbackStateInput): Promise<boolean>;
}

export function compScreenshotRecordIdentity(leaseId: string): {
  renewalRecordHash: string;
  compRecordHash: string;
} {
  const canonicalLeaseId = leaseId.trim();
  if (canonicalLeaseId === "" || canonicalLeaseId.length > 120) {
    throw new Error("A canonical renewal record id is required.");
  }
  return {
    renewalRecordHash: hashExecutionPreview({
      kind: "lease_renewal",
      leaseId: canonicalLeaseId,
    }),
    compRecordHash: hashExecutionPreview({
      kind: "lease_renewal_comp_evidence_slot",
      leaseId: canonicalLeaseId,
      slot: "owner_decision.market.comp_screenshot",
    }),
  };
}

export function hashCompScreenshotFilename(filename: string): string {
  return createHash("sha256").update(filename, "utf8").digest("hex");
}

export function hashCompScreenshotBytes(
  bytes: Uint8Array,
  algorithm: "sha256" | "md5",
): string {
  return createHash(algorithm).update(bytes).digest("hex");
}

export function buildCompScreenshotPreview(input: {
  actorUid: string;
  renewalRecordHash: string;
  compRecordHash: string;
  folderId: string;
  approvedSharedDriveId?: string;
  providerIdentityHash: string;
  contentSha256: string;
  contentMd5: string;
  sourceFilenameHash: string;
  mimeType: AllowedImageMimeType;
  sizeBytes: number;
  descriptor: EnvironmentDescriptor;
  predecessorExecutionId?: string;
  nowMs: number;
  nonce: string;
}): CompScreenshotPreviewRecord {
  const binding: CompScreenshotActionBinding = {
    actorUid: input.actorUid,
    renewalRecordHash: input.renewalRecordHash,
    compRecordHash: input.compRecordHash,
    folderId: input.folderId,
    ...(input.approvedSharedDriveId
      ? { approvedSharedDriveId: input.approvedSharedDriveId }
      : {}),
    providerIdentityHash: input.providerIdentityHash,
    contentSha256: input.contentSha256,
    contentMd5: input.contentMd5,
    sourceFilenameHash: input.sourceFilenameHash,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    descriptor: input.descriptor,
    ...(input.predecessorExecutionId
      ? { predecessorExecutionId: input.predecessorExecutionId }
      : {}),
  };
  const bindingHash = compScreenshotBindingHash(binding);
  const executionId = `comp_store_${hashExecutionPreview({
    actionKey: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
    binding: actorIndependentBinding(binding),
  }).slice(0, 48)}`;
  const expiresAtMs = input.nowMs + COMP_SCREENSHOT_PREVIEW_TTL_MS;
  const id = hashExecutionPreview({
    actionKey: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
    binding,
    issuedAtMs: input.nowMs,
    expiresAtMs,
    nonce: input.nonce,
  });
  return {
    id,
    executionId,
    bindingHash,
    binding,
    issuedAtMs: input.nowMs,
    expiresAtMs,
  };
}

export function compScreenshotBindingHash(binding: CompScreenshotActionBinding): string {
  return hashExecutionPreview({
    actionKey: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
    binding,
  });
}

export function compScreenshotBindingMatches(
  preview: CompScreenshotPreviewRecord,
  binding: CompScreenshotActionBinding,
): boolean {
  return (
    preview.bindingHash === compScreenshotBindingHash(binding) &&
    canonicalJson(preview.binding) === canonicalJson(binding)
  );
}

export function compScreenshotExecutionFromPreview(
  preview: CompScreenshotPreviewRecord,
  nowMs: number,
): CompScreenshotExecutionRecord {
  const now = new Date(nowMs).toISOString();
  return {
    id: preview.executionId,
    actionKey: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
    bindingHash: preview.bindingHash,
    actorUid: preview.binding.actorUid,
    renewalRecordHash: preview.binding.renewalRecordHash,
    compRecordHash: preview.binding.compRecordHash,
    folderId: preview.binding.folderId,
    ...(preview.binding.approvedSharedDriveId
      ? { approvedSharedDriveId: preview.binding.approvedSharedDriveId }
      : {}),
    providerIdentityHash: preview.binding.providerIdentityHash,
    contentSha256: preview.binding.contentSha256,
    contentMd5: preview.binding.contentMd5,
    sourceFilenameHash: preview.binding.sourceFilenameHash,
    mimeType: preview.binding.mimeType,
    sizeBytes: preview.binding.sizeBytes,
    descriptor: preview.binding.descriptor,
    ...(preview.binding.predecessorExecutionId
      ? { predecessorExecutionId: preview.binding.predecessorExecutionId }
      : {}),
    previewHash: preview.id,
    driveFilename: compScreenshotDriveFilename(
      preview.executionId,
      preview.binding.mimeType,
    ),
    state: "claimed",
    attemptCount: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function compScreenshotDriveFilename(
  executionId: string,
  mimeType: AllowedImageMimeType,
): string {
  const extension: Record<AllowedImageMimeType, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
  };
  return `renewal-comp-${executionId.slice(-24)}.${extension[mimeType]}`;
}

export function compScreenshotProviderPayload(record: CompScreenshotExecutionRecord) {
  if (!record.reservedFileId || !record.folderMetadataHash || !record.folderVersion) {
    throw new Error("A reserved Drive file id and bound parent evidence are required.");
  }
  const providerPayloadHash = hashExecutionPreview({
    actionKey: record.actionKey,
    executionId: record.id,
    previewHash: record.previewHash,
    fileId: record.reservedFileId,
    folderId: record.folderId,
    approvedSharedDriveId: record.approvedSharedDriveId ?? "",
    folderMetadataHash: record.folderMetadataHash,
    folderVersion: record.folderVersion,
    driveFilename: record.driveFilename,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    contentSha256: record.contentSha256,
    contentMd5: record.contentMd5,
    compRecordHash: record.compRecordHash,
    providerIdentityHash: record.providerIdentityHash,
  });
  return {
    providerPayloadHash,
    appProperties: {
      pmi_action: "renewal_comp_screenshot",
      pmi_execution: record.id,
      pmi_preview: record.previewHash,
      pmi_payload: providerPayloadHash,
      pmi_parent: record.folderMetadataHash,
      pmi_content_sha256: record.contentSha256,
      pmi_record: record.compRecordHash,
    },
  };
}

export function buildCompScreenshotReceipt(
  record: CompScreenshotExecutionRecord,
  evidence: {
    fileId: string;
    providerPayloadHash: string;
    providerMetadataHash: string;
    md5Checksum: string;
    sha256Checksum: string;
    version: string;
    headRevisionId: string;
    createdTime: string;
    webViewLink?: string;
    canUntrash: boolean;
  },
  reconciled: boolean,
): CompScreenshotReceipt {
  if (!record.reservedFileId || evidence.fileId !== record.reservedFileId) {
    throw new Error("Drive readback did not use the reserved file id.");
  }
  const expected = compScreenshotProviderPayload(record);
  const folderMetadataHash = record.folderMetadataHash!;
  const folderVersion = record.folderVersion!;
  const webViewLink = evidence.webViewLink ?? null;
  if (evidence.providerPayloadHash !== expected.providerPayloadHash) {
    throw new Error("Drive readback does not match the bound provider payload.");
  }
  if (
    evidence.md5Checksum !== record.contentMd5 ||
    evidence.sha256Checksum !== record.contentSha256
  ) {
    throw new Error("Drive readback checksum does not match the selected bytes.");
  }
  // Drive's immutable creation timestamp makes a receipt rebuilt during reconciliation byte-stable.
  // A wall-clock "now" here would make two reconcilers produce conflicting receipts for one file.
  const createdAt = evidence.createdTime;
  const targetHash = hashExecutionPreview({
    fileId: evidence.fileId,
    folderId: record.folderId,
    approvedSharedDriveId: record.approvedSharedDriveId ?? "",
    folderMetadataHash,
    folderVersion,
    providerIdentityHash: record.providerIdentityHash,
  });
  const resultHash = hashExecutionPreview({
    actionKey: record.actionKey,
    executionId: record.id,
    previewHash: record.previewHash,
    compRecordHash: record.compRecordHash,
    fileId: evidence.fileId,
    targetHash,
    folderMetadataHash,
    folderVersion,
    providerPayloadHash: evidence.providerPayloadHash,
    providerMetadataHash: evidence.providerMetadataHash,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    md5Checksum: evidence.md5Checksum,
    sha256Checksum: evidence.sha256Checksum,
    version: evidence.version,
    headRevisionId: evidence.headRevisionId,
    createdTime: evidence.createdTime,
    webViewLink,
    canUntrash: evidence.canUntrash,
  });
  return {
    receiptId: record.id,
    actionKey: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
    executionId: record.id,
    idempotencyKey: record.id,
    previewHash: record.previewHash,
    compRecordHash: record.compRecordHash,
    fileId: evidence.fileId,
    ref: `drive:${evidence.fileId}`,
    targetHash,
    folderMetadataHash,
    folderVersion,
    providerPayloadHash: evidence.providerPayloadHash,
    providerMetadataHash: evidence.providerMetadataHash,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    md5Checksum: evidence.md5Checksum,
    sha256Checksum: evidence.sha256Checksum,
    version: evidence.version,
    headRevisionId: evidence.headRevisionId,
    createdTime: evidence.createdTime,
    ...(webViewLink ? { webViewLink } : {}),
    canUntrash: evidence.canUntrash,
    resultHash,
    reconciled,
    createdAt,
  };
}

export function buildCompScreenshotRollbackPreview(input: {
  actorUid: string;
  execution: CompScreenshotExecutionRecord;
  providerIdentityHash: string;
  providerMetadataHash: string;
  providerVersion: string;
  providerHeadRevisionId: string;
  canTrash: true;
  canUntrash: boolean;
  descriptor: EnvironmentDescriptor;
  providerDriftedSinceReceipt: boolean;
  nowMs: number;
  nonce: string;
}): CompScreenshotRollbackPreviewRecord {
  const receipt = input.execution.receipt;
  if (input.execution.state !== "delivered" || !receipt) {
    throw new Error("A delivered screenshot receipt is required for rollback.");
  }
  if (!input.execution.reservedFileId) {
    throw new Error("The receipted Drive file id is missing.");
  }
  const binding: CompScreenshotRollbackBinding = {
    actorUid: input.actorUid,
    executionId: input.execution.id,
    originalReceiptId: receipt.receiptId,
    originalResultHash: receipt.resultHash,
    fileId: input.execution.reservedFileId,
    providerIdentityHash: input.providerIdentityHash,
    providerMetadataHash: input.providerMetadataHash,
    providerVersion: input.providerVersion,
    providerHeadRevisionId: input.providerHeadRevisionId,
    canTrash: true,
    canUntrash: input.canUntrash,
    descriptor: input.descriptor,
  };
  const bindingHash = compScreenshotRollbackBindingHash(binding);
  const rollbackId = `comp_trash_${hashExecutionPreview({
    actionKey: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
    operation: "trash",
    binding: actorIndependentRollbackBinding(binding),
  }).slice(0, 48)}`;
  const expiresAtMs = input.nowMs + COMP_SCREENSHOT_PREVIEW_TTL_MS;
  const id = hashExecutionPreview({
    actionKey: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
    operation: "trash",
    binding,
    issuedAtMs: input.nowMs,
    expiresAtMs,
    nonce: input.nonce,
  });
  return {
    id,
    rollbackId,
    bindingHash,
    binding,
    issuedAtMs: input.nowMs,
    expiresAtMs,
    providerDriftedSinceReceipt: input.providerDriftedSinceReceipt,
  };
}

export function refreshCompScreenshotRollbackPreview(
  prior: CompScreenshotRollbackPreviewRecord,
  nowMs: number,
  nonce: string,
  recoveryActorUid?: string,
): CompScreenshotRollbackPreviewRecord {
  if (
    recoveryActorUid !== undefined &&
    (recoveryActorUid.trim() === "" || recoveryActorUid.length > 128)
  ) {
    throw new Error("A valid recovery actor UID is required.");
  }
  const expiresAtMs = nowMs + COMP_SCREENSHOT_PREVIEW_TTL_MS;
  const priorWithoutRecoveryActor = { ...prior };
  delete priorWithoutRecoveryActor.recoveryActorUid;
  return {
    ...priorWithoutRecoveryActor,
    id: hashExecutionPreview({
      actionKey: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
      operation: "trash",
      binding: prior.binding,
      recoveryActorUid: recoveryActorUid ?? null,
      issuedAtMs: nowMs,
      expiresAtMs,
      nonce,
    }),
    ...(recoveryActorUid ? { recoveryActorUid } : {}),
    issuedAtMs: nowMs,
    expiresAtMs,
    providerDriftedSinceReceipt: true,
  };
}

export function compScreenshotRollbackBindingHash(
  binding: CompScreenshotRollbackBinding,
): string {
  return hashExecutionPreview({
    actionKey: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
    operation: "trash",
    binding,
  });
}

export function buildCompScreenshotRollbackReceipt(
  execution: CompScreenshotExecutionRecord,
  rollback: CompScreenshotRollbackRecord,
  preview: CompScreenshotRollbackPreviewRecord,
  evidence: {
    providerMetadataHashAfter: string;
    versionAfter: string;
    headRevisionIdAfter: string;
    explicitlyTrashed: true;
    canUntrash: boolean;
    providerTimestamp: string;
  },
  reconciled: boolean,
): CompScreenshotRollbackReceipt {
  if (!execution.receipt || !execution.reservedFileId) {
    throw new Error("The screenshot receipt is missing.");
  }
  const resultHash = hashExecutionPreview({
    actionKey: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
    operation: "trash",
    rollbackId: rollback.id,
    executionId: execution.id,
    originalReceiptId: execution.receipt.receiptId,
    previewHash: preview.id,
    fileId: execution.reservedFileId,
    providerMetadataHashBefore: preview.binding.providerMetadataHash,
    providerMetadataHashAfter: evidence.providerMetadataHashAfter,
    versionBefore: preview.binding.providerVersion,
    versionAfter: evidence.versionAfter,
    headRevisionIdBefore: preview.binding.providerHeadRevisionId,
    headRevisionIdAfter: evidence.headRevisionIdAfter,
    explicitlyTrashed: true,
    canUntrash: evidence.canUntrash,
    createdAt: evidence.providerTimestamp,
  });
  return {
    receiptId: rollback.id,
    actionKey: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
    operation: "trash",
    rollbackId: rollback.id,
    executionId: execution.id,
    originalReceiptId: execution.receipt.receiptId,
    previewHash: preview.id,
    fileId: execution.reservedFileId,
    providerMetadataHashBefore: preview.binding.providerMetadataHash,
    providerMetadataHashAfter: evidence.providerMetadataHashAfter,
    versionBefore: preview.binding.providerVersion,
    versionAfter: evidence.versionAfter,
    headRevisionIdBefore: preview.binding.providerHeadRevisionId,
    headRevisionIdAfter: evidence.headRevisionIdAfter,
    explicitlyTrashed: true,
    canUntrash: evidence.canUntrash,
    resultHash,
    reconciled,
    createdAt: evidence.providerTimestamp,
  };
}

export class MemoryCompScreenshotExecutionStore implements CompScreenshotExecutionStore {
  readonly previews = new Map<string, CompScreenshotPreviewRecord>();
  readonly executions = new Map<string, CompScreenshotExecutionRecord>();
  readonly heads = new Map<string, string>();
  readonly rollbackPreviews = new Map<string, CompScreenshotRollbackPreviewRecord>();

  async createPreview(record: CompScreenshotPreviewRecord): Promise<void> {
    const existing = this.previews.get(record.id);
    if (existing && canonicalJson(existing) !== canonicalJson(record)) {
      throw new Error("Comp screenshot preview hash collision.");
    }
    this.previews.set(record.id, clone(record));
  }

  async getPreview(id: string): Promise<CompScreenshotPreviewRecord | null> {
    return cloneOptional(this.previews.get(id));
  }

  async getExecution(id: string): Promise<CompScreenshotExecutionRecord | null> {
    return cloneOptional(this.executions.get(id));
  }

  async getLatestExecution(
    compRecordHash: string,
  ): Promise<CompScreenshotExecutionRecord | null> {
    const id = this.heads.get(compRecordHash);
    return id ? this.getExecution(id) : null;
  }

  async claim(input: {
    previewHash: string;
    executionId: string;
    actorUid: string;
    nowMs: number;
  }): Promise<ClaimCompScreenshotResult> {
    const preview = this.previews.get(input.previewHash);
    if (
      !preview ||
      preview.executionId !== input.executionId ||
      preview.binding.actorUid !== input.actorUid
    ) {
      return { status: "mismatch" };
    }
    const existing = this.executions.get(input.executionId);
    if (existing) return existingClaimResult(existing, preview);
    if (preview.expiresAtMs <= input.nowMs) return { status: "expired" };
    const currentHead = this.heads.get(preview.binding.compRecordHash);
    if (currentHead !== preview.binding.predecessorExecutionId) {
      return { status: "mismatch" };
    }
    const record = compScreenshotExecutionFromPreview(preview, input.nowMs);
    this.executions.set(record.id, clone(record));
    this.heads.set(record.compRecordHash, record.id);
    return { status: "claimed", record: clone(record) };
  }

  async bindFolderEvidence(
    executionId: string,
    evidence: CompScreenshotFolderEvidence,
    nowMs: number,
  ): Promise<BindCompScreenshotFolderEvidenceResult> {
    if (!validFolderEvidence(evidence)) return { status: "mismatch" };
    const record = this.executions.get(executionId);
    if (!record) return { status: "mismatch" };
    if (record.state === "delivered" && record.receipt) {
      return {
        status: "duplicate",
        record: clone(record),
        receipt: clone(record.receipt),
      };
    }
    if (record.folderMetadataHash || record.folderVersion) {
      if (
        record.folderMetadataHash === evidence.folderMetadataHash &&
        record.folderVersion === evidence.folderVersion
      ) {
        return { status: "existing", record: clone(record) };
      }
      return { status: "mismatch", record: clone(record) };
    }
    if (record.state !== "claimed") {
      return { status: "consumed", record: clone(record) };
    }
    const next: CompScreenshotExecutionRecord = {
      ...record,
      folderMetadataHash: evidence.folderMetadataHash,
      folderVersion: evidence.folderVersion,
      updatedAt: new Date(nowMs).toISOString(),
    };
    this.executions.set(executionId, next);
    return { status: "bound", record: clone(next) };
  }

  async reserveFileId(
    executionId: string,
    candidateFileId: string,
    nowMs: number,
  ): Promise<ReserveCompScreenshotFileIdResult> {
    if (!isDriveFileId(candidateFileId)) return { status: "mismatch" };
    const record = this.executions.get(executionId);
    if (!record) return { status: "mismatch" };
    if (record.state === "delivered" && record.receipt) {
      return {
        status: "duplicate",
        record: clone(record),
        receipt: clone(record.receipt),
      };
    }
    if (
      (record.state === "id_reserved" ||
        record.state === "upload_started" ||
        record.state === "ambiguous") &&
      record.reservedFileId
    ) {
      return {
        status: "existing",
        record: clone(record),
        fileId: record.reservedFileId,
      };
    }
    if (
      record.state !== "claimed" ||
      !record.folderMetadataHash ||
      !record.folderVersion
    ) {
      return { status: "consumed", record: clone(record) };
    }
    const next: CompScreenshotExecutionRecord = {
      ...record,
      state: "id_reserved",
      reservedFileId: candidateFileId,
      updatedAt: new Date(nowMs).toISOString(),
    };
    this.executions.set(executionId, next);
    return {
      status: "reserved",
      record: clone(next),
      fileId: candidateFileId,
    };
  }

  async beginUpload(
    executionId: string,
    nowMs: number,
  ): Promise<BeginCompScreenshotUploadResult> {
    const record = this.executions.get(executionId);
    if (!record) return { status: "mismatch" };
    if (record.state === "delivered" && record.receipt) {
      return {
        status: "duplicate",
        record: clone(record),
        receipt: clone(record.receipt),
      };
    }
    if (
      record.state === "upload_started" &&
      record.reservedFileId &&
      isCompScreenshotDispatchLeaseActive(record, nowMs)
    ) {
      return {
        status: "in_progress",
        record: clone(record),
        fileId: record.reservedFileId,
        dispatchGeneration: record.dispatchGeneration!,
        dispatchLeaseExpiresAtMs: record.dispatchLeaseExpiresAtMs!,
      };
    }
    const recovering =
      record.state === "ambiguous" ||
      (record.state === "upload_started" &&
        !isCompScreenshotDispatchLeaseActive(record, nowMs));
    if (
      (record.state !== "id_reserved" && !recovering) ||
      !record.reservedFileId ||
      !record.folderMetadataHash ||
      !record.folderVersion
    ) {
      return { status: "consumed", record: clone(record) };
    }
    const dispatchGeneration = compScreenshotDispatchGeneration(record) + 1;
    if (!Number.isSafeInteger(dispatchGeneration)) {
      return { status: "consumed", record: clone(record) };
    }
    const dispatchLeaseExpiresAtMs = nowMs + COMP_SCREENSHOT_UPLOAD_DISPATCH_LEASE_MS;
    const next: CompScreenshotExecutionRecord = {
      ...record,
      state: "upload_started",
      dispatchGeneration,
      dispatchLeaseExpiresAtMs,
      updatedAt: new Date(nowMs).toISOString(),
    };
    this.executions.set(executionId, next);
    return {
      status: recovering ? "retry" : "started",
      record: clone(next),
      fileId: record.reservedFileId,
      dispatchGeneration,
      dispatchLeaseExpiresAtMs,
    };
  }

  async finish(
    executionId: string,
    receipt: CompScreenshotReceipt,
  ): Promise<CompScreenshotReceipt> {
    const record = this.executions.get(executionId);
    if (!record) throw new Error("Comp screenshot execution is missing.");
    if (record.state === "delivered" && record.receipt) {
      if (sameCompScreenshotReceipt(record.receipt, receipt)) {
        return clone(record.receipt);
      }
      throw new Error("Comp screenshot execution has a conflicting receipt.");
    }
    if (
      !["upload_started", "ambiguous"].includes(record.state) ||
      receipt.receiptId !== record.id ||
      receipt.previewHash !== record.previewHash ||
      receipt.fileId !== record.reservedFileId
    ) {
      throw new Error(`Comp screenshot receipt cannot finish ${record.state}.`);
    }
    const next: CompScreenshotExecutionRecord = {
      ...record,
      state: "delivered",
      receipt: clone(receipt),
      updatedAt: receipt.createdAt,
    };
    this.executions.set(executionId, next);
    return clone(receipt);
  }

  async markAmbiguous(input: {
    executionId: string;
    dispatchGeneration: number;
    nowMs: number;
    requireLeaseExpiry?: boolean;
  }): Promise<boolean> {
    const record = this.executions.get(input.executionId);
    if (
      !record ||
      !isDispatchGeneration(input.dispatchGeneration) ||
      compScreenshotDispatchGeneration(record) !== input.dispatchGeneration ||
      (record.state !== "upload_started" && record.state !== "ambiguous")
    ) {
      return false;
    }
    if (record.state === "ambiguous") return true;
    if (
      input.requireLeaseExpiry &&
      isCompScreenshotDispatchLeaseActive(record, input.nowMs)
    ) {
      return false;
    }
    this.executions.set(input.executionId, {
      ...record,
      state: "ambiguous",
      updatedAt: new Date(input.nowMs).toISOString(),
    });
    return true;
  }

  async markAbsentIfNotStarted(executionId: string, nowMs: number): Promise<boolean> {
    const record = this.executions.get(executionId);
    if (!record) return false;
    if (record.state === "absent") return true;
    if (record.state !== "claimed" && record.state !== "id_reserved") return false;
    this.executions.set(executionId, {
      ...record,
      state: "absent",
      updatedAt: new Date(nowMs).toISOString(),
    });
    return true;
  }

  async markDeterministicNoEffect(input: {
    executionId: string;
    dispatchGeneration: number;
    nowMs: number;
  }): Promise<boolean> {
    const record = this.executions.get(input.executionId);
    if (
      !record ||
      input.dispatchGeneration !== 1 ||
      compScreenshotDispatchGeneration(record) !== input.dispatchGeneration ||
      !["upload_started", "ambiguous"].includes(record.state)
    ) {
      return false;
    }
    this.executions.set(input.executionId, {
      ...record,
      state: "absent",
      updatedAt: new Date(input.nowMs).toISOString(),
    });
    return true;
  }

  async createRollbackPreview(
    record: CompScreenshotRollbackPreviewRecord,
  ): Promise<void> {
    const existing = this.rollbackPreviews.get(record.id);
    if (existing && canonicalJson(existing) !== canonicalJson(record)) {
      throw new Error("Comp screenshot rollback preview hash collision.");
    }
    this.rollbackPreviews.set(record.id, clone(record));
  }

  async getRollbackPreview(
    id: string,
  ): Promise<CompScreenshotRollbackPreviewRecord | null> {
    return cloneOptional(this.rollbackPreviews.get(id));
  }

  async claimRollback(input: {
    previewHash: string;
    rollbackId: string;
    executionId: string;
    leaseId: string;
    actorUid: string;
    nowMs: number;
    observedExplicitTrash?: boolean;
  }): Promise<ClaimCompScreenshotRollbackResult> {
    const preview = this.rollbackPreviews.get(input.previewHash);
    const record = this.executions.get(input.executionId);
    let recordIdentity: ReturnType<typeof compScreenshotRecordIdentity> | null = null;
    try {
      recordIdentity = compScreenshotRecordIdentity(input.leaseId);
    } catch {
      // A malformed lease identity cannot claim a provider effect.
    }
    if (
      !preview ||
      !record ||
      !recordIdentity ||
      record.renewalRecordHash !== recordIdentity.renewalRecordHash ||
      record.compRecordHash !== recordIdentity.compRecordHash ||
      preview.rollbackId !== input.rollbackId ||
      preview.binding.executionId !== input.executionId ||
      (preview.recoveryActorUid ?? preview.binding.actorUid) !== input.actorUid ||
      (preview.recoveryActorUid !== undefined && !input.observedExplicitTrash) ||
      preview.bindingHash !== compScreenshotRollbackBindingHash(preview.binding) ||
      !record.receipt ||
      preview.binding.originalResultHash !== record.receipt.resultHash ||
      preview.binding.fileId !== record.reservedFileId
    ) {
      return { status: "mismatch", ...(record ? { record: clone(record) } : {}) };
    }
    if (preview.expiresAtMs <= input.nowMs) {
      return { status: "expired", record: clone(record) };
    }
    if (record.rollback) {
      const lineageChanged =
        record.rollback.id !== input.rollbackId ||
        record.rollback.bindingHash !== preview.bindingHash;
      if (lineageChanged) {
        if (
          record.rollback.state !== "failed" ||
          input.observedExplicitTrash ||
          record.state !== "delivered"
        ) {
          return { status: "mismatch", record: clone(record) };
        }
        const now = new Date(input.nowMs).toISOString();
        const rollback: CompScreenshotRollbackRecord = {
          id: input.rollbackId,
          bindingHash: preview.bindingHash,
          previewHash: preview.id,
          actorUid: input.actorUid,
          state: "running",
          attemptCount: 1,
          dispatchGeneration: 1,
          dispatchLeaseExpiresAtMs:
            input.nowMs + COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS,
          createdAt: now,
          updatedAt: now,
        };
        const next: CompScreenshotExecutionRecord = {
          ...record,
          rollback,
          updatedAt: now,
        };
        this.executions.set(record.id, next);
        return {
          status: "claimed",
          record: clone(next),
          rollback: clone(rollback),
          dispatchGeneration: 1,
          dispatchLeaseExpiresAtMs: rollback.dispatchLeaseExpiresAtMs!,
        };
      }
      if (record.rollback.state === "succeeded" && record.rollback.receipt) {
        if (
          record.rollback.previewHash !== preview.id ||
          record.rollback.receipt.previewHash !== preview.id
        ) {
          return { status: "mismatch", record: clone(record) };
        }
        return {
          status: "duplicate",
          record: clone(record),
          receipt: clone(record.rollback.receipt),
        };
      }
      const currentGeneration = compScreenshotRollbackDispatchGeneration(record.rollback);
      if (
        input.observedExplicitTrash &&
        (record.rollback.state === "running" || record.rollback.state === "ambiguous")
      ) {
        const recoveryGeneration = currentGeneration + 1;
        if (!isDispatchGeneration(recoveryGeneration)) {
          return { status: "consumed", record: clone(record) };
        }
        const recoveryLeaseExpiresAtMs =
          input.nowMs + COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS;
        const rollback: CompScreenshotRollbackRecord = {
          ...record.rollback,
          previewHash: preview.id,
          dispatchGeneration: recoveryGeneration,
          dispatchLeaseExpiresAtMs: recoveryLeaseExpiresAtMs,
          updatedAt: new Date(input.nowMs).toISOString(),
        };
        const next: CompScreenshotExecutionRecord = {
          ...record,
          rollback,
          updatedAt: rollback.updatedAt,
        };
        this.executions.set(record.id, next);
        return {
          status: "retry",
          record: clone(next),
          rollback: clone(rollback),
          dispatchGeneration: recoveryGeneration,
          dispatchLeaseExpiresAtMs: recoveryLeaseExpiresAtMs,
        };
      }
      if (record.rollback.state === "running") {
        if (isCompScreenshotRollbackDispatchLeaseActive(record.rollback, input.nowMs)) {
          return { status: "in_progress", record: clone(record) };
        }
      }
      if (
        record.rollback.state === "running" ||
        record.rollback.state === "ambiguous" ||
        record.rollback.state === "failed"
      ) {
        const dispatchGeneration = currentGeneration + 1;
        if (!isDispatchGeneration(dispatchGeneration)) {
          return { status: "consumed", record: clone(record) };
        }
        const dispatchLeaseExpiresAtMs =
          input.nowMs + COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS;
        const rollback: CompScreenshotRollbackRecord = {
          ...record.rollback,
          previewHash: preview.id,
          state: "running",
          dispatchGeneration,
          dispatchLeaseExpiresAtMs,
          updatedAt: new Date(input.nowMs).toISOString(),
        };
        const next: CompScreenshotExecutionRecord = {
          ...record,
          rollback,
          updatedAt: rollback.updatedAt,
        };
        this.executions.set(record.id, next);
        return {
          status: "retry",
          record: clone(next),
          rollback: clone(rollback),
          dispatchGeneration,
          dispatchLeaseExpiresAtMs,
        };
      }
      return { status: "consumed", record: clone(record) };
    }
    if (input.observedExplicitTrash) {
      return { status: "mismatch", record: clone(record) };
    }
    if (record.state !== "delivered") {
      return { status: "consumed", record: clone(record) };
    }
    const now = new Date(input.nowMs).toISOString();
    const rollback: CompScreenshotRollbackRecord = {
      id: input.rollbackId,
      bindingHash: preview.bindingHash,
      previewHash: preview.id,
      actorUid: input.actorUid,
      state: "running",
      attemptCount: 1,
      dispatchGeneration: 1,
      dispatchLeaseExpiresAtMs: input.nowMs + COMP_SCREENSHOT_ROLLBACK_DISPATCH_LEASE_MS,
      createdAt: now,
      updatedAt: now,
    };
    const next = { ...record, rollback };
    this.executions.set(record.id, next);
    return {
      status: "claimed",
      record: clone(next),
      rollback: clone(rollback),
      dispatchGeneration: 1,
      dispatchLeaseExpiresAtMs: rollback.dispatchLeaseExpiresAtMs!,
    };
  }

  async finishRollback(
    executionId: string,
    dispatchGeneration: number,
    receipt: CompScreenshotRollbackReceipt,
  ): Promise<CompScreenshotRollbackReceipt> {
    const record = this.executions.get(executionId);
    if (!record?.rollback) {
      throw new Error("Comp screenshot rollback execution is missing.");
    }
    if (record.rollback.state === "succeeded" && record.rollback.receipt) {
      if (sameCompScreenshotRollbackReceipt(record.rollback.receipt, receipt)) {
        return clone(record.rollback.receipt);
      }
      const currentGeneration = compScreenshotRollbackDispatchGeneration(record.rollback);
      const staleGeneration =
        isDispatchGeneration(dispatchGeneration) &&
        dispatchGeneration < currentGeneration;
      const stalePreviewAtCurrentGeneration =
        dispatchGeneration === currentGeneration &&
        receipt.previewHash !== record.rollback.receipt.previewHash;
      const preview = this.rollbackPreviews.get(receipt.previewHash);
      if (
        (staleGeneration || stalePreviewAtCurrentGeneration) &&
        preview &&
        compScreenshotRollbackReceiptMatchesLineage(record, receipt, preview)
      ) {
        return clone(record.rollback.receipt);
      }
      throw new Error("Comp screenshot rollback has a conflicting receipt.");
    }
    if (
      !["running", "ambiguous"].includes(record.rollback.state) ||
      compScreenshotRollbackDispatchGeneration(record.rollback) !== dispatchGeneration ||
      receipt.rollbackId !== record.rollback.id ||
      receipt.executionId !== record.id ||
      receipt.previewHash !== record.rollback.previewHash ||
      receipt.fileId !== record.reservedFileId
    ) {
      throw new Error(
        `Comp screenshot rollback receipt cannot finish ${record.rollback.state}.`,
      );
    }
    const rollback: CompScreenshotRollbackRecord = {
      ...record.rollback,
      state: "succeeded",
      receipt: clone(receipt),
      updatedAt: receipt.createdAt,
    };
    this.executions.set(executionId, {
      ...record,
      state: "rolled_back",
      rollback,
      updatedAt: receipt.createdAt,
    });
    return clone(receipt);
  }

  async markRollbackAmbiguous(
    input: MarkCompScreenshotRollbackStateInput,
  ): Promise<boolean> {
    return this.markRollbackState(input, "ambiguous");
  }

  async markRollbackFailed(
    input: MarkCompScreenshotRollbackStateInput,
  ): Promise<boolean> {
    return this.markRollbackState(input, "failed");
  }

  private markRollbackState(
    input: MarkCompScreenshotRollbackStateInput,
    state: "ambiguous" | "failed",
  ): boolean {
    const record = this.executions.get(input.executionId);
    if (
      !record?.rollback ||
      record.rollback.id !== input.rollbackId ||
      record.rollback.previewHash !== input.previewHash ||
      compScreenshotRollbackDispatchGeneration(record.rollback) !==
        input.dispatchGeneration ||
      record.rollback.state === "succeeded" ||
      (record.rollback.state === "failed" && state === "ambiguous")
    ) {
      return false;
    }
    if (record.rollback.state === state) {
      return true;
    }
    const rollback = {
      ...record.rollback,
      state,
      updatedAt: new Date(input.nowMs).toISOString(),
    };
    this.executions.set(input.executionId, {
      ...record,
      rollback,
      updatedAt: rollback.updatedAt,
    });
    return true;
  }
}

export function sameCompScreenshotReceipt(
  left: CompScreenshotReceipt,
  right: CompScreenshotReceipt,
): boolean {
  return (
    canonicalJson(withoutReconciled(left)) === canonicalJson(withoutReconciled(right))
  );
}

export function sameCompScreenshotRollbackReceipt(
  left: CompScreenshotRollbackReceipt,
  right: CompScreenshotRollbackReceipt,
): boolean {
  return (
    canonicalJson(withoutReconciled(left)) === canonicalJson(withoutReconciled(right))
  );
}

export function compScreenshotRollbackReceiptMatchesLineage(
  record: CompScreenshotExecutionRecord,
  receipt: CompScreenshotRollbackReceipt,
  preview: CompScreenshotRollbackPreviewRecord,
): boolean {
  const rollback = record.rollback;
  const originalReceipt = record.receipt;
  if (!rollback || !originalReceipt || !record.reservedFileId) return false;
  return (
    receipt.actionKey === RENEWAL_COMP_SCREENSHOT_ACTION_KEY &&
    receipt.operation === "trash" &&
    receipt.receiptId === rollback.id &&
    receipt.rollbackId === rollback.id &&
    receipt.executionId === record.id &&
    receipt.originalReceiptId === originalReceipt.receiptId &&
    receipt.fileId === record.reservedFileId &&
    receipt.previewHash === preview.id &&
    preview.rollbackId === rollback.id &&
    preview.bindingHash === rollback.bindingHash &&
    preview.bindingHash === compScreenshotRollbackBindingHash(preview.binding) &&
    preview.binding.actorUid === rollback.actorUid &&
    preview.binding.executionId === record.id &&
    preview.binding.originalReceiptId === originalReceipt.receiptId &&
    preview.binding.originalResultHash === originalReceipt.resultHash &&
    preview.binding.fileId === record.reservedFileId
  );
}

export function isCompScreenshotTerminalWithoutEffect(
  record: CompScreenshotExecutionRecord,
): boolean {
  return (
    record.state === "absent" ||
    record.state === "failed" ||
    record.state === "rolled_back"
  );
}

export function compScreenshotDispatchGeneration(
  record: Pick<CompScreenshotExecutionRecord, "dispatchGeneration">,
): number {
  return isDispatchGeneration(record.dispatchGeneration) ? record.dispatchGeneration : 0;
}

export function isCompScreenshotDispatchLeaseActive(
  record: Pick<
    CompScreenshotExecutionRecord,
    "state" | "dispatchGeneration" | "dispatchLeaseExpiresAtMs"
  >,
  nowMs: number,
): boolean {
  return (
    record.state === "upload_started" &&
    isDispatchGeneration(record.dispatchGeneration) &&
    typeof record.dispatchLeaseExpiresAtMs === "number" &&
    Number.isSafeInteger(record.dispatchLeaseExpiresAtMs) &&
    record.dispatchLeaseExpiresAtMs > nowMs
  );
}

export function compScreenshotRollbackDispatchGeneration(
  rollback: Pick<CompScreenshotRollbackRecord, "dispatchGeneration">,
): number {
  return isDispatchGeneration(rollback.dispatchGeneration)
    ? rollback.dispatchGeneration
    : 0;
}

export function isCompScreenshotRollbackDispatchLeaseActive(
  rollback: Pick<
    CompScreenshotRollbackRecord,
    "state" | "dispatchGeneration" | "dispatchLeaseExpiresAtMs"
  >,
  nowMs: number,
): boolean {
  return (
    rollback.state === "running" &&
    isDispatchGeneration(rollback.dispatchGeneration) &&
    typeof rollback.dispatchLeaseExpiresAtMs === "number" &&
    Number.isSafeInteger(rollback.dispatchLeaseExpiresAtMs) &&
    rollback.dispatchLeaseExpiresAtMs > nowMs
  );
}

function existingClaimResult(
  existing: CompScreenshotExecutionRecord,
  preview: CompScreenshotPreviewRecord,
): ClaimCompScreenshotResult {
  if (
    existing.bindingHash !== preview.bindingHash ||
    existing.actorUid !== preview.binding.actorUid
  ) {
    return { status: "mismatch", record: clone(existing) };
  }
  if (existing.state === "delivered" && existing.receipt) {
    return {
      status: "duplicate",
      record: clone(existing),
      receipt: clone(existing.receipt),
    };
  }
  if (existing.state === "ambiguous") {
    return { status: "ambiguous", record: clone(existing) };
  }
  if (
    existing.state === "claimed" ||
    existing.state === "id_reserved" ||
    existing.state === "upload_started"
  ) {
    return { status: "in_progress", record: clone(existing) };
  }
  return { status: "consumed", record: clone(existing) };
}

function actorIndependentBinding(binding: CompScreenshotActionBinding) {
  return Object.fromEntries(
    Object.entries(binding).filter(([key]) => key !== "actorUid"),
  );
}

function actorIndependentRollbackBinding(binding: CompScreenshotRollbackBinding) {
  return Object.fromEntries(
    Object.entries(binding).filter(([key]) => key !== "actorUid"),
  );
}

function isDriveFileId(value: string): boolean {
  return /^[A-Za-z0-9_-]{10,200}$/.test(value);
}

function isDispatchGeneration(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function validFolderEvidence(evidence: CompScreenshotFolderEvidence): boolean {
  return (
    /^[a-f0-9]{64}$/.test(evidence.folderMetadataHash) &&
    /^\d+$/.test(evidence.folderVersion)
  );
}

function withoutReconciled<T extends { reconciled: boolean }>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "reconciled"),
  );
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function cloneOptional<T>(value: T | undefined): T | null {
  return value === undefined ? null : clone(value);
}
