import { randomUUID } from "node:crypto";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  EnvironmentContextError,
  assertLiveProviderActionAllowed,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { canonicalJson, hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import type {
  RenewalCompScreenshotDriveFile,
  RenewalCompScreenshotDriveFolder,
  RenewalCompScreenshotDriveProvider,
  RenewalCompScreenshotMutationOutcome,
  RenewalCompScreenshotReadOutcome,
} from "@/lib/google-drive/renewal-comp-screenshot";
import { RENEWAL_COMP_SCREENSHOT_FOLDER_MIME } from "@/lib/google-drive/renewal-comp-screenshot";
import { requireDriveDwdIdentity } from "@/lib/google-drive/drive-dwd";
import { assertActionExecutable } from "@/lib/integrations/action-gate";
import {
  COMP_SCREENSHOT_MAX_BYTES,
  buildCompScreenshotPreview,
  buildCompScreenshotReceipt,
  buildCompScreenshotRollbackPreview,
  buildCompScreenshotRollbackReceipt,
  compScreenshotBindingMatches,
  compScreenshotDispatchGeneration,
  compScreenshotProviderPayload,
  compScreenshotRecordIdentity,
  compScreenshotRollbackBindingHash,
  compScreenshotRollbackDispatchGeneration,
  hashCompScreenshotBytes,
  hashCompScreenshotFilename,
  isCompScreenshotDispatchLeaseActive,
  isCompScreenshotTerminalWithoutEffect,
  refreshCompScreenshotRollbackPreview,
  type CompScreenshotActionBinding,
  type CompScreenshotExecutionRecord,
  type CompScreenshotExecutionStore,
  type CompScreenshotPreviewRecord,
  type CompScreenshotReceipt,
  type CompScreenshotRollbackBinding,
  type CompScreenshotRollbackPreviewRecord,
  type CompScreenshotRollbackReceipt,
  type CompScreenshotRollbackRecord,
} from "@/lib/lease-renewal/comp-screenshot-contract";
import {
  RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
  RENEWAL_COMP_SCREENSHOT_TARGET_LABEL,
} from "@/lib/lease-renewal/comp-screenshot-action";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  sniffImageMime,
  type AllowedImageMimeType,
} from "@/lib/maintenance/image-mime";

const MAX_BASE64_CHARACTERS = Math.ceil(COMP_SCREENSHOT_MAX_BYTES / 3) * 4;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type CompScreenshotContractErrorCode =
  | "invalid_file"
  | "invalid_request"
  | "not_configured"
  | "preview_expired"
  | "preview_stale"
  | "attempt_consumed"
  | "provider_ambiguous"
  | "provider_mismatch"
  | "not_found"
  | "rollback_stale";

export class CompScreenshotContractError extends Error {
  constructor(
    message: string,
    readonly code: CompScreenshotContractErrorCode,
    readonly status: 400 | 404 | 409 | 413 | 503 = 409,
  ) {
    super(message);
    this.name = "CompScreenshotContractError";
  }
}

export interface CompScreenshotExecutionContext {
  descriptor: EnvironmentDescriptor;
  /** Test seam only. Production callers omit this and read the committed seed. */
  registry?: CreateActionRegistryInput[];
}

export interface CompScreenshotServiceDeps {
  store: CompScreenshotExecutionStore;
  folderId: string;
  /** Empty/undefined selects only subject-owned My Drive. */
  approvedSharedDriveId?: string;
  providerIdentityHash: string;
  createProvider: () => RenewalCompScreenshotDriveProvider;
  now: () => Date;
  nonce: () => string;
}

export interface CompScreenshotFileInput {
  leaseId: string;
  filename: string;
  mimeType: string;
  base64: string;
}

export interface CompScreenshotCommitInput extends CompScreenshotFileInput {
  executionId: string;
  previewHash: string;
}

export interface CompScreenshotResumeInput extends CompScreenshotFileInput {
  executionId: string;
}

export interface CompScreenshotResumeOutcome {
  status: "resume";
  preview: {
    executionId: string;
    previewHash: string;
  };
  file: {
    filename: string;
    mimeType: AllowedImageMimeType;
    sizeBytes: number;
    targetLabel: string;
  };
}

export type CompScreenshotStoreOutcome =
  | {
      status: "preview";
      preview: {
        executionId: string;
        previewHash: string;
        expiresAt: string;
      };
      file: {
        filename: string;
        mimeType: AllowedImageMimeType;
        sizeBytes: number;
        targetLabel: string;
      };
    }
  | {
      status: "delivered";
      executionId: string;
      receipt: CompScreenshotReceipt;
      duplicate: boolean;
    }
  | {
      status: "in_progress" | "ambiguous" | "absent";
      executionId: string;
      reason: string;
    }
  | {
      status: "existing";
      executionId: string;
      receipt: CompScreenshotReceipt;
      reason: string;
    };

export type CompScreenshotStatusOutcome =
  | { status: "not_found" }
  | {
      status:
        | "claimed"
        | "id_reserved"
        | "upload_started"
        | "ambiguous"
        | "absent"
        | "failed"
        | "rollback_running"
        | "rollback_ambiguous";
      executionId: string;
      reason?: string;
    }
  | {
      status: "delivered";
      executionId: string;
      receipt: CompScreenshotReceipt;
    }
  | {
      status: "rolled_back";
      executionId: string;
      receipt: CompScreenshotReceipt;
      rollbackReceipt: CompScreenshotRollbackReceipt;
    };

export type CompScreenshotRollbackOutcome =
  | {
      status: "preview";
      preview: {
        executionId: string;
        rollbackId: string;
        previewHash: string;
        expiresAt: string;
        providerDriftedSinceReceipt: boolean;
      };
      target: {
        ref: string;
        targetLabel: string;
      };
    }
  | {
      status: "rolled_back";
      executionId: string;
      receipt: CompScreenshotRollbackReceipt;
      duplicate: boolean;
    }
  | {
      status: "ambiguous" | "failed";
      executionId: string;
      reason: string;
    };

interface ValidatedCompScreenshot {
  filename: string;
  mimeType: AllowedImageMimeType;
  bytes: Uint8Array;
  sizeBytes: number;
  contentSha256: string;
  contentMd5: string;
  sourceFilenameHash: string;
}

interface VerifiedFile {
  metadataHash: string;
  file: RenewalCompScreenshotDriveFile;
}

interface VerifiedFolder {
  folderMetadataHash: string;
  folderVersion: string;
  folder: RenewalCompScreenshotDriveFolder;
}

type FileVerification =
  | { status: "verified"; evidence: VerifiedFile }
  | { status: "pending"; reason: string }
  | { status: "mismatch"; reason: string };

type FolderVerification =
  | { status: "verified"; evidence: VerifiedFolder }
  | { status: "mismatch"; reason: string };

export function assertCompScreenshotExecutionAllowed(
  context: CompScreenshotExecutionContext,
  mode: "mutating" | "recovery" = "mutating",
): void {
  assertLiveProviderActionAllowed(context.descriptor);
  if (mode === "mutating") {
    assertActionExecutable(RENEWAL_COMP_SCREENSHOT_ACTION_KEY, context.registry);
  }
}

export function resolveCompScreenshotProviderIdentity(
  env: Record<string, string | undefined> = process.env,
): { hash: string } | null {
  let identity: { serviceAccount: string; subject: string };
  try {
    identity = requireDriveDwdIdentity({
      serviceAccount: env.SHEETS_IMPERSONATE_SA,
      subject: env.SHEETS_DWD_SUBJECT,
    });
  } catch {
    return null;
  }
  return {
    hash: hashExecutionPreview({
      provider: "google_drive_v3_dwd",
      serviceAccount: identity.serviceAccount,
      subject: identity.subject,
    }),
  };
}

export function assertCompScreenshotSetup(
  deps: Pick<
    CompScreenshotServiceDeps,
    "folderId" | "approvedSharedDriveId" | "providerIdentityHash"
  >,
): void {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(deps.folderId)) {
    throw new CompScreenshotContractError(
      "The approved in-boundary Drive folder is not configured.",
      "not_configured",
      503,
    );
  }
  const sharedDriveId = deps.approvedSharedDriveId?.trim() ?? "";
  if (sharedDriveId && !/^[A-Za-z0-9_-]{10,200}$/.test(sharedDriveId)) {
    throw new CompScreenshotContractError(
      "The approved Shared Drive boundary is not configured correctly.",
      "not_configured",
      503,
    );
  }
  assertCompScreenshotRecoverySetup(deps);
}

export function assertCompScreenshotRecoverySetup(
  deps: Pick<CompScreenshotServiceDeps, "providerIdentityHash">,
): void {
  if (!/^[a-f0-9]{64}$/.test(deps.providerIdentityHash)) {
    throw new CompScreenshotContractError(
      "The managed Google Drive identity is not configured.",
      "not_configured",
      503,
    );
  }
}

export function validateCompScreenshotFile(
  input: Pick<CompScreenshotFileInput, "filename" | "mimeType" | "base64">,
): ValidatedCompScreenshot {
  if (
    input.filename.length === 0 ||
    input.filename.length > 200 ||
    input.filename.includes("\0") ||
    input.filename.includes("\r") ||
    input.filename.includes("\n")
  ) {
    throw new CompScreenshotContractError(
      "Choose a screenshot with a valid filename.",
      "invalid_file",
      400,
    );
  }
  if (
    input.base64.length === 0 ||
    input.base64.length > MAX_BASE64_CHARACTERS ||
    input.base64.length % 4 !== 0 ||
    !BASE64_PATTERN.test(input.base64)
  ) {
    throw new CompScreenshotContractError(
      "The screenshot data is malformed or larger than 5 MiB.",
      "invalid_file",
      input.base64.length > MAX_BASE64_CHARACTERS ? 413 : 400,
    );
  }
  const bytes = new Uint8Array(Buffer.from(input.base64, "base64"));
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > COMP_SCREENSHOT_MAX_BYTES ||
    Buffer.from(bytes).toString("base64") !== input.base64
  ) {
    throw new CompScreenshotContractError(
      "The screenshot data is malformed or larger than 5 MiB.",
      "invalid_file",
      bytes.byteLength > COMP_SCREENSHOT_MAX_BYTES ? 413 : 400,
    );
  }
  const detected = sniffImageMime(input.base64);
  if (!detected) {
    throw new CompScreenshotContractError(
      "Only JPEG, PNG, WebP, or HEIC screenshots are supported.",
      "invalid_file",
      400,
    );
  }
  if (
    !ALLOWED_IMAGE_MIME_TYPES.includes(
      input.mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
    ) ||
    input.mimeType !== detected
  ) {
    throw new CompScreenshotContractError(
      "The screenshot type does not match its file bytes.",
      "invalid_file",
      400,
    );
  }
  return {
    filename: input.filename,
    mimeType: detected,
    bytes,
    sizeBytes: bytes.byteLength,
    contentSha256: hashCompScreenshotBytes(bytes, "sha256"),
    contentMd5: hashCompScreenshotBytes(bytes, "md5"),
    sourceFilenameHash: hashCompScreenshotFilename(input.filename),
  };
}

export async function previewCompScreenshot(
  actor: AuthenticatedUser,
  input: CompScreenshotFileInput,
  deps: CompScreenshotServiceDeps,
  context: CompScreenshotExecutionContext,
): Promise<CompScreenshotStoreOutcome> {
  assertCompScreenshotExecutionAllowed(context, "mutating");
  assertCompScreenshotSetup(deps);
  const file = validateCompScreenshotFile(input);
  const records = compScreenshotRecordIdentity(input.leaseId);
  const latest = await deps.store.getLatestExecution(records.compRecordHash);
  if (latest && !isCompScreenshotTerminalWithoutEffect(latest)) {
    if (latest.state === "delivered" && latest.receipt) {
      return {
        status: "existing",
        executionId: latest.id,
        receipt: latest.receipt,
        reason:
          "This renewal already has a receipted screenshot. Remove it before storing a replacement.",
      };
    }
    return {
      status: latest.state === "ambiguous" ? "ambiguous" : "in_progress",
      executionId: latest.id,
      reason:
        "A screenshot attempt already owns this renewal evidence slot. Recover that attempt before starting another.",
    };
  }
  const nowMs = deps.now().getTime();
  const preview = buildCompScreenshotPreview({
    actorUid: actor.uid,
    ...records,
    folderId: deps.folderId,
    ...(deps.approvedSharedDriveId?.trim()
      ? { approvedSharedDriveId: deps.approvedSharedDriveId.trim() }
      : {}),
    providerIdentityHash: deps.providerIdentityHash,
    contentSha256: file.contentSha256,
    contentMd5: file.contentMd5,
    sourceFilenameHash: file.sourceFilenameHash,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    descriptor: context.descriptor,
    ...(latest ? { predecessorExecutionId: latest.id } : {}),
    nowMs,
    nonce: deps.nonce(),
  });
  await deps.store.createPreview(preview);
  return {
    status: "preview",
    preview: {
      executionId: preview.executionId,
      previewHash: preview.id,
      expiresAt: new Date(preview.expiresAtMs).toISOString(),
    },
    file: {
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      targetLabel: RENEWAL_COMP_SCREENSHOT_TARGET_LABEL,
    },
  };
}

export async function commitCompScreenshot(
  actor: AuthenticatedUser,
  input: CompScreenshotCommitInput,
  deps: CompScreenshotServiceDeps,
  context: CompScreenshotExecutionContext,
): Promise<CompScreenshotStoreOutcome> {
  assertCompScreenshotExecutionAllowed(context, "mutating");
  assertCompScreenshotRecoverySetup(deps);
  const file = validateCompScreenshotFile(input);
  assertStoreExecutionId(input.executionId);
  const existing = await deps.store.getExecution(input.executionId);
  // A not-yet-claimed preview is still governed by the current approved folder boundary.
  // Once claimed, the durable record owns that exact target and survives later config rotation.
  if (!existing) assertCompScreenshotSetup(deps);
  const preview = await requireStorePreview(actor, input, deps, context, file, existing);
  if (existing?.state === "delivered" && existing.receipt) {
    return {
      status: "delivered",
      executionId: existing.id,
      receipt: existing.receipt,
      duplicate: true,
    };
  }
  if (existing && isCompScreenshotTerminalWithoutEffect(existing)) {
    throw new CompScreenshotContractError(
      "This screenshot attempt is already consumed. Prepare a new screenshot.",
      "attempt_consumed",
    );
  }

  const claim = await deps.store.claim({
    previewHash: preview.id,
    executionId: preview.executionId,
    actorUid: actor.uid,
    nowMs: deps.now().getTime(),
  });
  if (claim.status === "duplicate") {
    return {
      status: "delivered",
      executionId: claim.record.id,
      receipt: claim.receipt,
      duplicate: true,
    };
  }
  if (claim.status === "expired") {
    throw new CompScreenshotContractError(
      "The screenshot preview expired. Prepare it again.",
      "preview_expired",
    );
  }
  if (claim.status === "mismatch") {
    throw new CompScreenshotContractError(
      "The actor, file, renewal, folder, provider identity, or environment changed.",
      "preview_stale",
    );
  }
  if (claim.status === "consumed") {
    throw new CompScreenshotContractError(
      "This screenshot attempt is already consumed. Prepare it again.",
      "attempt_consumed",
    );
  }

  const claimedRecord =
    claim.status === "claimed"
      ? claim.record
      : (claim.record ?? (await deps.store.getExecution(preview.executionId)));
  if (!claimedRecord) {
    throw new CompScreenshotContractError(
      "The screenshot execution record is unavailable.",
      "provider_ambiguous",
      503,
    );
  }
  let record: CompScreenshotExecutionRecord = claimedRecord;
  let provider: RenewalCompScreenshotDriveProvider | null = null;
  const getProvider = () => {
    provider ??= deps.createProvider();
    return provider;
  };

  if (!record.folderMetadataHash || !record.folderVersion) {
    if (record.state !== "claimed") {
      throw new CompScreenshotContractError(
        "The screenshot attempt is missing its durable Drive parent evidence.",
        "provider_ambiguous",
        503,
      );
    }
    const folderRead = await getProvider().getFolder(record.folderId);
    const folderVerification =
      folderRead.outcome === "found"
        ? verifyApprovedDriveFolder(record, folderRead.folder)
        : {
            status: "mismatch" as const,
            reason:
              folderRead.outcome === "absent"
                ? "The approved Drive parent no longer exists."
                : "The approved Drive parent cannot be verified.",
          };
    if (folderVerification.status !== "verified") {
      const absent = await deps.store.markAbsentIfNotStarted(
        record.id,
        deps.now().getTime(),
      );
      if (!absent) return storeOutcomeAfterDispatchCasLoss(record.id, deps);
      return {
        status: "absent",
        executionId: record.id,
        reason: folderVerification.reason,
      };
    }
    const bound = await deps.store.bindFolderEvidence(
      record.id,
      {
        folderMetadataHash: folderVerification.evidence.folderMetadataHash,
        folderVersion: folderVerification.evidence.folderVersion,
      },
      deps.now().getTime(),
    );
    if (bound.status === "duplicate") {
      return {
        status: "delivered",
        executionId: record.id,
        receipt: bound.receipt,
        duplicate: true,
      };
    }
    if (bound.status !== "bound" && bound.status !== "existing") {
      throw new CompScreenshotContractError(
        "The Drive parent evidence changed before it could be bound.",
        "attempt_consumed",
      );
    }
    record = bound.record;
  }

  if (record.state === "claimed") {
    const reservation = await getProvider().reserveFileId();
    if (reservation.outcome !== "reserved") {
      const absent = await deps.store.markAbsentIfNotStarted(
        record.id,
        deps.now().getTime(),
      );
      if (!absent) return storeOutcomeAfterDispatchCasLoss(record.id, deps);
      return {
        status: "absent",
        executionId: record.id,
        reason:
          "No Drive file was created. Prepare the screenshot again after the connection recovers.",
      };
    }
    const reserved = await deps.store.reserveFileId(
      record.id,
      reservation.fileId,
      deps.now().getTime(),
    );
    if (reserved.status === "duplicate") {
      return {
        status: "delivered",
        executionId: record.id,
        receipt: reserved.receipt,
        duplicate: true,
      };
    }
    if (reserved.status !== "reserved" && reserved.status !== "existing") {
      throw new CompScreenshotContractError(
        "The screenshot attempt changed before Drive reservation completed.",
        "attempt_consumed",
      );
    }
    record = reserved.record;
  }

  const begun = await deps.store.beginUpload(record.id, deps.now().getTime());
  if (begun.status === "duplicate") {
    return {
      status: "delivered",
      executionId: record.id,
      receipt: begun.receipt,
      duplicate: true,
    };
  }
  if (begun.status === "in_progress") {
    return {
      status: "in_progress",
      executionId: record.id,
      reason:
        "The exact reserved-ID upload is already in progress. Reconcile that generation before retrying.",
    };
  }
  if (begun.status !== "started" && begun.status !== "retry") {
    throw new CompScreenshotContractError(
      "The screenshot attempt cannot start another Drive effect.",
      "attempt_consumed",
    );
  }
  record = begun.record;
  const folderRead = await getProvider().getFolder(record.folderId);
  const folderVerification =
    folderRead.outcome === "found"
      ? verifyApprovedDriveFolder(record, folderRead.folder)
      : {
          status: "mismatch" as const,
          reason:
            folderRead.outcome === "absent"
              ? "The approved Drive parent no longer exists."
              : "The approved Drive parent cannot be verified immediately before upload.",
        };
  if (
    folderVerification.status !== "verified" ||
    folderVerification.evidence.folderMetadataHash !== record.folderMetadataHash ||
    folderVerification.evidence.folderVersion !== record.folderVersion
  ) {
    const reason =
      folderVerification.status === "verified"
        ? "The approved Drive parent changed after its durable evidence was bound."
        : folderVerification.reason;
    const marked =
      begun.dispatchGeneration === 1
        ? await deps.store.markDeterministicNoEffect({
            executionId: record.id,
            dispatchGeneration: begun.dispatchGeneration,
            nowMs: deps.now().getTime(),
          })
        : await deps.store.markAmbiguous({
            executionId: record.id,
            dispatchGeneration: begun.dispatchGeneration,
            nowMs: deps.now().getTime(),
          });
    if (!marked) return storeOutcomeAfterDispatchCasLoss(record.id, deps);
    return {
      status: begun.dispatchGeneration === 1 ? "absent" : "ambiguous",
      executionId: record.id,
      reason,
    };
  }
  const providerPayload = compScreenshotProviderPayload(record);
  const mutation = await getProvider().createReservedFile({
    fileId: begun.fileId,
    parentFolderId: record.folderId,
    name: record.driveFilename,
    mimeType: record.mimeType,
    appProperties: providerPayload.appProperties,
    bytes: file.bytes,
  });
  const readback = await getProvider().getFile(begun.fileId);
  return finishStoreFromReadback(
    record,
    providerPayload.providerPayloadHash,
    mutation,
    readback,
    begun.status,
    begun.dispatchGeneration,
    deps,
    false,
  );
}

export async function resumeCompScreenshot(
  actor: AuthenticatedUser,
  input: CompScreenshotResumeInput,
  deps: CompScreenshotServiceDeps,
  context: CompScreenshotExecutionContext,
): Promise<CompScreenshotResumeOutcome> {
  assertCompScreenshotExecutionAllowed(context, "mutating");
  assertCompScreenshotRecoverySetup(deps);
  const file = validateCompScreenshotFile(input);
  assertStoreExecutionId(input.executionId);
  const record = await deps.store.getExecution(input.executionId);
  if (!record) {
    throw new CompScreenshotContractError(
      "The screenshot execution record is unavailable.",
      "not_found",
      404,
    );
  }
  if (
    !["claimed", "id_reserved", "upload_started", "ambiguous", "delivered"].includes(
      record.state,
    )
  ) {
    throw new CompScreenshotContractError(
      "This screenshot attempt cannot be resumed. Prepare a new screenshot.",
      "attempt_consumed",
    );
  }
  const preview = await requirePersistedStoreSelection(
    actor,
    input,
    deps,
    context,
    file,
    record,
  );
  return {
    status: "resume",
    preview: {
      executionId: record.id,
      previewHash: preview.id,
    },
    file: {
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      targetLabel: RENEWAL_COMP_SCREENSHOT_TARGET_LABEL,
    },
  };
}

export async function getCompScreenshotStatus(
  executionId: string,
  deps: CompScreenshotServiceDeps,
  context: CompScreenshotExecutionContext,
): Promise<CompScreenshotStatusOutcome> {
  assertCompScreenshotExecutionAllowed(context, "recovery");
  assertCompScreenshotRecoverySetup(deps);
  const record = await deps.store.getExecution(executionId);
  if (record) assertExecutionContext(record, deps, context);
  return publicStatus(record);
}

export async function getCompScreenshotStatusForLease(
  leaseId: string,
  deps: CompScreenshotServiceDeps,
  context: CompScreenshotExecutionContext,
): Promise<CompScreenshotStatusOutcome> {
  assertCompScreenshotExecutionAllowed(context, "recovery");
  assertCompScreenshotRecoverySetup(deps);
  const { compRecordHash } = compScreenshotRecordIdentity(leaseId);
  const record = await deps.store.getLatestExecution(compRecordHash);
  if (record) assertExecutionContext(record, deps, context);
  return publicStatus(record);
}

export async function reconcileCompScreenshot(
  executionId: string,
  deps: CompScreenshotServiceDeps,
  context: CompScreenshotExecutionContext,
): Promise<CompScreenshotStatusOutcome> {
  assertCompScreenshotExecutionAllowed(context, "recovery");
  assertCompScreenshotRecoverySetup(deps);
  const record = await deps.store.getExecution(executionId);
  if (!record) return { status: "not_found" };
  if (
    record.providerIdentityHash !== deps.providerIdentityHash ||
    canonicalJson(record.descriptor) !== canonicalJson(context.descriptor)
  ) {
    throw new CompScreenshotContractError(
      "The Drive provider identity or environment changed.",
      "preview_stale",
    );
  }
  if (record.state === "delivered" || record.state === "rolled_back") {
    return publicStatus(record);
  }
  if (record.state === "claimed" || record.state === "id_reserved") {
    const absent = await deps.store.markAbsentIfNotStarted(
      record.id,
      deps.now().getTime(),
    );
    if (absent) {
      return {
        status: "absent",
        executionId: record.id,
        reason: "The write-ahead ledger proves no Drive upload started.",
      };
    }
    const current = await deps.store.getExecution(record.id);
    return publicStatus(current);
  }
  if (record.state === "absent" || record.state === "failed") {
    return publicStatus(record);
  }
  if (!record.reservedFileId) {
    return reconcileUnverifiedDispatch(
      record,
      "The upload started without a recoverable Drive file id.",
      deps,
    );
  }
  const provider = deps.createProvider();
  const readback = await provider.getFile(record.reservedFileId);
  if (readback.outcome !== "found") {
    return reconcileUnverifiedDispatch(
      record,
      readback.outcome === "absent"
        ? "Drive does not currently return the reserved file. A late upload remains possible, so absence is not inferred."
        : "Drive cannot currently corroborate the reserved file.",
      deps,
    );
  }
  const providerPayload = compScreenshotProviderPayload(record);
  const verification = verifyStoredDriveFile(
    record,
    readback.file,
    providerPayload.providerPayloadHash,
    false,
  );
  if (verification.status !== "verified") {
    return reconcileUnverifiedDispatch(record, verification.reason, deps);
  }
  const receipt = await deps.store.finish(
    record.id,
    receiptFromVerifiedFile(
      record,
      providerPayload.providerPayloadHash,
      verification.evidence,
      true,
    ),
  );
  return { status: "delivered", executionId: record.id, receipt };
}

export async function previewCompScreenshotRollback(
  actor: AuthenticatedUser,
  leaseId: string,
  executionId: string,
  deps: CompScreenshotServiceDeps,
  context: CompScreenshotExecutionContext,
): Promise<CompScreenshotRollbackOutcome> {
  assertCompScreenshotExecutionAllowed(context, "recovery");
  assertCompScreenshotRecoverySetup(deps);
  const record = await requireDeliveredExecution(executionId, deps, context);
  assertCompScreenshotLeaseIdentity(record, leaseId);
  const provider = deps.createProvider();
  const readback = await provider.getFile(record.reservedFileId!);
  if (readback.outcome !== "found") {
    throw new CompScreenshotContractError(
      "The exact receipted Drive file cannot be read for rollback.",
      "provider_ambiguous",
      503,
    );
  }
  const providerPayload = compScreenshotProviderPayload(record);
  const recoveringExplicitTrash =
    readback.file.trashed &&
    readback.file.explicitlyTrashed &&
    (record.rollback?.state === "running" || record.rollback?.state === "ambiguous");
  const verification = verifyStoredDriveFile(
    record,
    readback.file,
    providerPayload.providerPayloadHash,
    recoveringExplicitTrash,
  );
  if (verification.status !== "verified") {
    throw new CompScreenshotContractError(
      verification.reason,
      verification.status === "mismatch" ? "provider_mismatch" : "provider_ambiguous",
    );
  }
  if (!recoveringExplicitTrash && !readback.file.capabilities.canTrash) {
    throw new CompScreenshotContractError(
      "The managed Drive identity cannot move this file to trash.",
      "not_configured",
      503,
    );
  }
  const receipt = record.receipt!;
  const nowMs = deps.now().getTime();
  let preview: CompScreenshotRollbackPreviewRecord;
  if (recoveringExplicitTrash) {
    const prior = await deps.store.getRollbackPreview(record.rollback!.previewHash);
    if (
      !prior ||
      prior.rollbackId !== record.rollback!.id ||
      prior.bindingHash !== record.rollback!.bindingHash ||
      prior.binding.actorUid !== record.rollback!.actorUid ||
      prior.binding.executionId !== record.id ||
      prior.binding.originalResultHash !== receipt.resultHash ||
      prior.binding.fileId !== record.reservedFileId ||
      prior.binding.providerIdentityHash !== deps.providerIdentityHash ||
      canonicalJson(prior.binding.descriptor) !== canonicalJson(context.descriptor)
    ) {
      throw new CompScreenshotContractError(
        "The original rollback lineage cannot be recovered.",
        "rollback_stale",
      );
    }
    preview = refreshCompScreenshotRollbackPreview(prior, nowMs, deps.nonce(), actor.uid);
  } else {
    preview = buildCompScreenshotRollbackPreview({
      actorUid: actor.uid,
      execution: record,
      providerIdentityHash: deps.providerIdentityHash,
      providerMetadataHash: verification.evidence.metadataHash,
      providerVersion: readback.file.version,
      providerHeadRevisionId: readback.file.headRevisionId!,
      canTrash: true,
      canUntrash: readback.file.capabilities.canUntrash ?? false,
      descriptor: context.descriptor,
      providerDriftedSinceReceipt:
        receipt.version !== readback.file.version ||
        receipt.headRevisionId !== readback.file.headRevisionId ||
        receipt.providerMetadataHash !== verification.evidence.metadataHash,
      nowMs,
      nonce: deps.nonce(),
    });
  }
  await deps.store.createRollbackPreview(preview);
  return publicRollbackPreview(preview, receipt.ref);
}

export async function commitCompScreenshotRollback(
  actor: AuthenticatedUser,
  input: {
    leaseId: string;
    executionId: string;
    rollbackId: string;
    previewHash: string;
  },
  deps: CompScreenshotServiceDeps,
  context: CompScreenshotExecutionContext,
): Promise<CompScreenshotRollbackOutcome> {
  assertCompScreenshotExecutionAllowed(context, "recovery");
  assertCompScreenshotRecoverySetup(deps);
  let record = await requireDeliveredOrRollbackExecution(
    input.executionId,
    deps,
    context,
  );
  assertCompScreenshotLeaseIdentity(record, input.leaseId);
  const preview = await requireRollbackPreview(actor, input, record, deps, context);
  if (record.state === "rolled_back" && record.rollback?.receipt) {
    if (
      record.rollback.id !== preview.rollbackId ||
      record.rollback.previewHash !== preview.id ||
      record.rollback.receipt.previewHash !== preview.id
    ) {
      throw new CompScreenshotContractError(
        "The rollback confirmation does not match the successful rollback lineage.",
        "rollback_stale",
      );
    }
    return {
      status: "rolled_back",
      executionId: record.id,
      receipt: record.rollback.receipt,
      duplicate: true,
    };
  }
  const provider = deps.createProvider();
  const before = await provider.getFile(record.reservedFileId!);
  if (before.outcome !== "found") {
    throw new CompScreenshotContractError(
      "The exact Drive file cannot be read before rollback.",
      "provider_ambiguous",
      503,
    );
  }
  const providerPayload = compScreenshotProviderPayload(record);
  if (before.file.trashed) {
    if (!record.rollback || !before.file.explicitlyTrashed) {
      throw new CompScreenshotContractError(
        "The Drive file was trashed outside this exact rollback lineage.",
        "rollback_stale",
      );
    }
    const recovered = verifyStoredDriveFile(
      record,
      before.file,
      providerPayload.providerPayloadHash,
      true,
    );
    if (recovered.status !== "verified") {
      throw new CompScreenshotContractError(
        recovered.reason,
        recovered.status === "mismatch" ? "provider_mismatch" : "provider_ambiguous",
      );
    }
    const recoveryClaim = await deps.store.claimRollback({
      previewHash: preview.id,
      rollbackId: preview.rollbackId,
      executionId: record.id,
      leaseId: input.leaseId,
      actorUid: actor.uid,
      nowMs: deps.now().getTime(),
      observedExplicitTrash: true,
    });
    if (recoveryClaim.status === "duplicate") {
      return {
        status: "rolled_back",
        executionId: record.id,
        receipt: recoveryClaim.receipt,
        duplicate: true,
      };
    }
    if (recoveryClaim.status !== "retry") {
      throw new CompScreenshotContractError(
        "The explicit trash evidence no longer matches the recoverable rollback lineage.",
        "rollback_stale",
      );
    }
    record = recoveryClaim.record;
    const receipt = await deps.store.finishRollback(
      record.id,
      recoveryClaim.dispatchGeneration,
      buildCompScreenshotRollbackReceipt(
        record,
        recoveryClaim.rollback,
        preview,
        {
          providerMetadataHashAfter: recovered.evidence.metadataHash,
          versionAfter: before.file.version,
          headRevisionIdAfter: before.file.headRevisionId!,
          explicitlyTrashed: true,
          canUntrash: before.file.capabilities.canUntrash,
          providerTimestamp: before.file.modifiedTime,
        },
        true,
      ),
    );
    return {
      status: "rolled_back",
      executionId: record.id,
      receipt,
      duplicate: true,
    };
  }
  const beforeVerification = verifyStoredDriveFile(
    record,
    before.file,
    providerPayload.providerPayloadHash,
    false,
  );
  if (
    beforeVerification.status !== "verified" ||
    beforeVerification.evidence.metadataHash !== preview.binding.providerMetadataHash ||
    before.file.version !== preview.binding.providerVersion ||
    before.file.headRevisionId !== preview.binding.providerHeadRevisionId
  ) {
    throw new CompScreenshotContractError(
      "The receipted Drive file changed after the rollback preview.",
      "rollback_stale",
    );
  }

  const claim = await deps.store.claimRollback({
    previewHash: preview.id,
    rollbackId: preview.rollbackId,
    executionId: record.id,
    leaseId: input.leaseId,
    actorUid: actor.uid,
    nowMs: deps.now().getTime(),
  });
  if (claim.status === "duplicate") {
    return {
      status: "rolled_back",
      executionId: record.id,
      receipt: claim.receipt,
      duplicate: true,
    };
  }
  if (claim.status === "expired") {
    throw new CompScreenshotContractError(
      "The rollback preview expired. Prepare it again.",
      "preview_expired",
    );
  }
  if (claim.status === "in_progress") {
    return {
      status: "ambiguous",
      executionId: record.id,
      reason:
        "The exact rollback is already in progress. Check its status before retrying.",
    };
  }
  if (claim.status !== "claimed" && claim.status !== "retry") {
    throw new CompScreenshotContractError(
      "The rollback attempt no longer matches the exact receipted Drive file.",
      "rollback_stale",
    );
  }
  record = claim.record;

  // The API exposes no documented ETag precondition for this metadata patch. Re-read after the
  // durable claim and refuse before PATCH if any bound provider generation changed.
  const claimedRead = await provider.getFile(record.reservedFileId!);
  if (claimedRead.outcome !== "found") {
    const marked = await deps.store.markRollbackAmbiguous({
      executionId: record.id,
      rollbackId: claim.rollback.id,
      previewHash: claim.rollback.previewHash,
      dispatchGeneration: claim.dispatchGeneration,
      nowMs: deps.now().getTime(),
    });
    if (!marked) {
      return currentRollbackOutcomeAfterLostMark(
        record.id,
        claim.rollback,
        claim.dispatchGeneration,
        deps,
      );
    }
    const completed = await completedRollbackOutcome(record.id, deps);
    if (completed) return completed;
    return {
      status: "ambiguous",
      executionId: record.id,
      reason: "Drive became unreadable after the rollback claim.",
    };
  }
  const claimedVerification = verifyStoredDriveFile(
    record,
    claimedRead.file,
    providerPayload.providerPayloadHash,
    false,
  );
  if (
    claimedVerification.status !== "verified" ||
    claimedVerification.evidence.metadataHash !== preview.binding.providerMetadataHash ||
    claimedRead.file.version !== preview.binding.providerVersion ||
    claimedRead.file.headRevisionId !== preview.binding.providerHeadRevisionId
  ) {
    const marked = await deps.store.markRollbackFailed({
      executionId: record.id,
      rollbackId: claim.rollback.id,
      previewHash: claim.rollback.previewHash,
      dispatchGeneration: claim.dispatchGeneration,
      nowMs: deps.now().getTime(),
    });
    if (!marked) {
      return currentRollbackOutcomeAfterLostMark(
        record.id,
        claim.rollback,
        claim.dispatchGeneration,
        deps,
      );
    }
    const completed = await completedRollbackOutcome(record.id, deps);
    if (completed) return completed;
    throw new CompScreenshotContractError(
      "The Drive file changed before rollback could start.",
      "rollback_stale",
    );
  }

  const mutation = await provider.trashFile(record.reservedFileId!);
  const after = await provider.getFile(record.reservedFileId!);
  if (after.outcome !== "found") {
    const marked = await deps.store.markRollbackAmbiguous({
      executionId: record.id,
      rollbackId: claim.rollback.id,
      previewHash: claim.rollback.previewHash,
      dispatchGeneration: claim.dispatchGeneration,
      nowMs: deps.now().getTime(),
    });
    if (!marked) {
      return currentRollbackOutcomeAfterLostMark(
        record.id,
        claim.rollback,
        claim.dispatchGeneration,
        deps,
      );
    }
    const completed = await completedRollbackOutcome(record.id, deps);
    if (completed) return completed;
    return {
      status: "ambiguous",
      executionId: record.id,
      reason: "Drive did not return exact post-trash evidence.",
    };
  }
  const afterVerification = verifyStoredDriveFile(
    record,
    after.file,
    providerPayload.providerPayloadHash,
    true,
  );
  const noEffectVerification =
    mutation.outcome === "rejected" && mutation.certainty === "not_applied"
      ? verifyStoredDriveFile(
          record,
          after.file,
          providerPayload.providerPayloadHash,
          false,
        )
      : null;
  if (
    afterVerification.status === "verified" &&
    after.file.trashed &&
    after.file.explicitlyTrashed
  ) {
    const receipt = await deps.store.finishRollback(
      record.id,
      claim.dispatchGeneration,
      buildCompScreenshotRollbackReceipt(
        record,
        claim.rollback,
        preview,
        {
          providerMetadataHashAfter: afterVerification.evidence.metadataHash,
          versionAfter: after.file.version,
          headRevisionIdAfter: after.file.headRevisionId!,
          explicitlyTrashed: true,
          canUntrash: after.file.capabilities.canUntrash ?? false,
          providerTimestamp: after.file.modifiedTime,
        },
        claim.status === "retry" || mutation.outcome !== "accepted",
      ),
    );
    return {
      status: "rolled_back",
      executionId: record.id,
      receipt,
      duplicate: false,
    };
  }
  if (
    mutation.outcome === "rejected" &&
    mutation.certainty === "not_applied" &&
    noEffectVerification?.status === "verified" &&
    !after.file.trashed
  ) {
    const marked = await deps.store.markRollbackFailed({
      executionId: record.id,
      rollbackId: claim.rollback.id,
      previewHash: claim.rollback.previewHash,
      dispatchGeneration: claim.dispatchGeneration,
      nowMs: deps.now().getTime(),
    });
    if (!marked) {
      return currentRollbackOutcomeAfterLostMark(
        record.id,
        claim.rollback,
        claim.dispatchGeneration,
        deps,
      );
    }
    const completed = await completedRollbackOutcome(record.id, deps);
    if (completed) return completed;
    return {
      status: "failed",
      executionId: record.id,
      reason: "Drive definitively rejected the trash request.",
    };
  }
  const marked = await deps.store.markRollbackAmbiguous({
    executionId: record.id,
    rollbackId: claim.rollback.id,
    previewHash: claim.rollback.previewHash,
    dispatchGeneration: claim.dispatchGeneration,
    nowMs: deps.now().getTime(),
  });
  if (!marked) {
    return currentRollbackOutcomeAfterLostMark(
      record.id,
      claim.rollback,
      claim.dispatchGeneration,
      deps,
    );
  }
  const completed = await completedRollbackOutcome(record.id, deps);
  if (completed) return completed;
  return {
    status: "ambiguous",
    executionId: record.id,
    reason:
      afterVerification.status === "verified"
        ? "Drive has not yet corroborated an explicit trash effect."
        : afterVerification.reason,
  };
}

async function currentRollbackOutcomeAfterLostMark(
  executionId: string,
  expectedRollback: CompScreenshotRollbackRecord,
  expectedGeneration: number,
  deps: Pick<CompScreenshotServiceDeps, "store">,
): Promise<CompScreenshotRollbackOutcome> {
  const current = await deps.store.getExecution(executionId);
  if (
    !current?.rollback ||
    current.rollback.id !== expectedRollback.id ||
    current.rollback.bindingHash !== expectedRollback.bindingHash
  ) {
    throw new CompScreenshotContractError(
      "A newer rollback confirmation replaced this callback lineage.",
      "rollback_stale",
    );
  }
  if (
    current.state === "rolled_back" &&
    current.rollback.state === "succeeded" &&
    current.rollback.receipt
  ) {
    return {
      status: "rolled_back",
      executionId: current.id,
      receipt: current.rollback.receipt,
      duplicate: true,
    };
  }
  const currentGeneration = compScreenshotRollbackDispatchGeneration(current.rollback);
  const previewAdvanced = current.rollback.previewHash !== expectedRollback.previewHash;
  if (
    currentGeneration < expectedGeneration ||
    (previewAdvanced && currentGeneration <= expectedGeneration)
  ) {
    throw new CompScreenshotContractError(
      "The rollback callback is ahead of durable dispatch state.",
      "rollback_stale",
    );
  }
  const newer = currentGeneration > expectedGeneration || previewAdvanced;
  if (current.rollback.state === "failed") {
    return {
      status: "failed",
      executionId: current.id,
      reason: newer
        ? "A newer exact rollback attempt definitively failed."
        : "The exact rollback has a durable deterministic failure.",
    };
  }
  if (current.rollback.state === "running" || current.rollback.state === "ambiguous") {
    return {
      status: "ambiguous",
      executionId: current.id,
      reason: newer
        ? "A newer exact rollback attempt is in progress or awaiting reconciliation."
        : "The exact rollback is in progress or awaiting reconciliation.",
    };
  }
  throw new CompScreenshotContractError(
    "The rollback callback no longer matches durable dispatch state.",
    "rollback_stale",
  );
}

async function completedRollbackOutcome(
  executionId: string,
  deps: Pick<CompScreenshotServiceDeps, "store">,
): Promise<Extract<CompScreenshotRollbackOutcome, { status: "rolled_back" }> | null> {
  const current = await deps.store.getExecution(executionId);
  if (
    current?.state !== "rolled_back" ||
    current.rollback?.state !== "succeeded" ||
    !current.rollback.receipt
  ) {
    return null;
  }
  return {
    status: "rolled_back",
    executionId: current.id,
    receipt: current.rollback.receipt,
    duplicate: true,
  };
}

export async function getReceiptedCompScreenshotForLease(
  leaseId: string,
  store: CompScreenshotExecutionStore,
): Promise<CompScreenshotReceipt | null> {
  const { compRecordHash } = compScreenshotRecordIdentity(leaseId);
  const record = await store.getLatestExecution(compRecordHash);
  return record?.state === "delivered" &&
    record.receipt &&
    record.rollback?.state !== "running" &&
    record.rollback?.state !== "ambiguous"
    ? record.receipt
    : null;
}

function requireStoreBinding(
  actor: AuthenticatedUser,
  input: CompScreenshotCommitInput,
  preview: CompScreenshotPreviewRecord,
  file: ValidatedCompScreenshot,
  deps: CompScreenshotServiceDeps,
  context: CompScreenshotExecutionContext,
): CompScreenshotActionBinding {
  const records = compScreenshotRecordIdentity(input.leaseId);
  return {
    actorUid: actor.uid,
    ...records,
    folderId: deps.folderId,
    ...(deps.approvedSharedDriveId?.trim()
      ? { approvedSharedDriveId: deps.approvedSharedDriveId.trim() }
      : {}),
    providerIdentityHash: deps.providerIdentityHash,
    contentSha256: file.contentSha256,
    contentMd5: file.contentMd5,
    sourceFilenameHash: file.sourceFilenameHash,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    descriptor: context.descriptor,
    ...(preview.binding.predecessorExecutionId
      ? { predecessorExecutionId: preview.binding.predecessorExecutionId }
      : {}),
  };
}

async function requireStorePreview(
  actor: AuthenticatedUser,
  input: CompScreenshotCommitInput,
  deps: CompScreenshotServiceDeps,
  context: CompScreenshotExecutionContext,
  file: ValidatedCompScreenshot,
  existing: CompScreenshotExecutionRecord | null,
): Promise<CompScreenshotPreviewRecord> {
  if (!/^[a-f0-9]{64}$/.test(input.previewHash)) {
    throw new CompScreenshotContractError(
      "Exact screenshot preview identifiers are required.",
      "invalid_request",
      400,
    );
  }
  if (existing) {
    if (existing.previewHash !== input.previewHash) {
      throw new CompScreenshotContractError(
        "The screenshot no longer matches the exact server preview.",
        "preview_stale",
      );
    }
    return requirePersistedStoreSelection(actor, input, deps, context, file, existing);
  }
  const preview = await deps.store.getPreview(input.previewHash);
  if (
    !preview ||
    preview.executionId !== input.executionId ||
    preview.binding.actorUid !== actor.uid ||
    !compScreenshotBindingMatches(
      preview,
      requireStoreBinding(actor, input, preview, file, deps, context),
    )
  ) {
    throw new CompScreenshotContractError(
      "The screenshot no longer matches the exact server preview.",
      "preview_stale",
    );
  }
  return preview;
}

async function requirePersistedStoreSelection(
  actor: AuthenticatedUser,
  input: CompScreenshotResumeInput,
  deps: CompScreenshotServiceDeps,
  context: CompScreenshotExecutionContext,
  file: ValidatedCompScreenshot,
  record: CompScreenshotExecutionRecord,
): Promise<CompScreenshotPreviewRecord> {
  assertExecutionContext(record, deps, context);
  const preview = await deps.store.getPreview(record.previewHash);
  const selectedBinding: CompScreenshotActionBinding = {
    actorUid: actor.uid,
    ...compScreenshotRecordIdentity(input.leaseId),
    folderId: record.folderId,
    ...(record.approvedSharedDriveId
      ? { approvedSharedDriveId: record.approvedSharedDriveId }
      : {}),
    providerIdentityHash: deps.providerIdentityHash,
    contentSha256: file.contentSha256,
    contentMd5: file.contentMd5,
    sourceFilenameHash: file.sourceFilenameHash,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    descriptor: context.descriptor,
    ...(record.predecessorExecutionId
      ? { predecessorExecutionId: record.predecessorExecutionId }
      : {}),
  };
  const persistedBinding: CompScreenshotActionBinding = {
    actorUid: record.actorUid,
    renewalRecordHash: record.renewalRecordHash,
    compRecordHash: record.compRecordHash,
    folderId: record.folderId,
    ...(record.approvedSharedDriveId
      ? { approvedSharedDriveId: record.approvedSharedDriveId }
      : {}),
    providerIdentityHash: record.providerIdentityHash,
    contentSha256: record.contentSha256,
    contentMd5: record.contentMd5,
    sourceFilenameHash: record.sourceFilenameHash,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    descriptor: record.descriptor,
    ...(record.predecessorExecutionId
      ? { predecessorExecutionId: record.predecessorExecutionId }
      : {}),
  };
  if (
    !preview ||
    record.id !== input.executionId ||
    preview.executionId !== record.id ||
    preview.id !== record.previewHash ||
    preview.bindingHash !== record.bindingHash ||
    !compScreenshotBindingMatches(preview, persistedBinding) ||
    !compScreenshotBindingMatches(preview, selectedBinding)
  ) {
    throw new CompScreenshotContractError(
      "The reselected screenshot does not match the exact persisted execution.",
      "preview_stale",
    );
  }
  return preview;
}

function assertStoreExecutionId(executionId: string): void {
  if (!/^comp_store_[a-f0-9]{48}$/.test(executionId)) {
    throw new CompScreenshotContractError(
      "Exact screenshot preview identifiers are required.",
      "invalid_request",
      400,
    );
  }
}

async function finishStoreFromReadback(
  record: CompScreenshotExecutionRecord,
  providerPayloadHash: string,
  mutation: RenewalCompScreenshotMutationOutcome,
  readback: RenewalCompScreenshotReadOutcome,
  beginStatus: "started" | "retry",
  dispatchGeneration: number,
  deps: CompScreenshotServiceDeps,
  reconciled: boolean,
): Promise<CompScreenshotStoreOutcome> {
  if (readback.outcome === "found") {
    const verification = verifyStoredDriveFile(
      record,
      readback.file,
      providerPayloadHash,
      false,
    );
    if (verification.status === "verified") {
      const receipt = await deps.store.finish(
        record.id,
        receiptFromVerifiedFile(
          record,
          providerPayloadHash,
          verification.evidence,
          reconciled || beginStatus === "retry" || mutation.outcome === "conflict",
        ),
      );
      return {
        status: "delivered",
        executionId: record.id,
        receipt,
        duplicate: beginStatus === "retry" || mutation.outcome === "conflict",
      };
    }
    const marked = await deps.store.markAmbiguous({
      executionId: record.id,
      dispatchGeneration,
      nowMs: deps.now().getTime(),
    });
    if (!marked) return storeOutcomeAfterDispatchCasLoss(record.id, deps);
    return {
      status: "ambiguous",
      executionId: record.id,
      reason: verification.reason,
    };
  }
  if (
    beginStatus === "started" &&
    mutation.outcome === "rejected" &&
    readback.outcome === "absent"
  ) {
    const marked = await deps.store.markDeterministicNoEffect({
      executionId: record.id,
      dispatchGeneration,
      nowMs: deps.now().getTime(),
    });
    if (!marked) return storeOutcomeAfterDispatchCasLoss(record.id, deps);
    return {
      status: "absent",
      executionId: record.id,
      reason: "Drive definitively rejected the create request; no file was created.",
    };
  }
  const marked = await deps.store.markAmbiguous({
    executionId: record.id,
    dispatchGeneration,
    nowMs: deps.now().getTime(),
  });
  if (!marked) return storeOutcomeAfterDispatchCasLoss(record.id, deps);
  return {
    status: "ambiguous",
    executionId: record.id,
    reason:
      readback.outcome === "absent"
        ? "Drive does not currently return the reserved file. The exact same-ID create may be retried; a new ID is forbidden."
        : "Drive cannot currently corroborate the reserved file.",
  };
}

async function reconcileUnverifiedDispatch(
  record: CompScreenshotExecutionRecord,
  reason: string,
  deps: CompScreenshotServiceDeps,
): Promise<CompScreenshotStatusOutcome> {
  const nowMs = deps.now().getTime();
  if (isCompScreenshotDispatchLeaseActive(record, nowMs)) {
    return {
      status: "upload_started",
      executionId: record.id,
      reason:
        "The exact reserved-ID upload is still in progress; reconciliation did not release its dispatch lease.",
    };
  }
  const dispatchGeneration = compScreenshotDispatchGeneration(record);
  if (record.state === "ambiguous" || dispatchGeneration === 0) {
    return { status: "ambiguous", executionId: record.id, reason };
  }
  const marked = await deps.store.markAmbiguous({
    executionId: record.id,
    dispatchGeneration,
    nowMs,
    requireLeaseExpiry: true,
  });
  if (!marked) return publicStatus(await deps.store.getExecution(record.id));
  return { status: "ambiguous", executionId: record.id, reason };
}

async function storeOutcomeAfterDispatchCasLoss(
  executionId: string,
  deps: CompScreenshotServiceDeps,
): Promise<CompScreenshotStoreOutcome> {
  const current = await deps.store.getExecution(executionId);
  if (!current) {
    throw new CompScreenshotContractError(
      "The screenshot execution record is unavailable.",
      "provider_ambiguous",
      503,
    );
  }
  if (
    (current.state === "delivered" || current.state === "rolled_back") &&
    current.receipt
  ) {
    return {
      status: "delivered",
      executionId: current.id,
      receipt: current.receipt,
      duplicate: true,
    };
  }
  if (current.state === "ambiguous") {
    return {
      status: "ambiguous",
      executionId: current.id,
      reason: "A newer same-ID recovery generation owns the uncertain provider result.",
    };
  }
  if (current.state === "absent" || current.state === "failed") {
    return {
      status: "absent",
      executionId: current.id,
      reason: "The current dispatch generation recorded no provider effect.",
    };
  }
  return {
    status: "in_progress",
    executionId: current.id,
    reason:
      "A newer same-ID upload generation is in progress; the older callback was ignored.",
  };
}

function verifyApprovedDriveFolder(
  record: Pick<CompScreenshotExecutionRecord, "folderId" | "approvedSharedDriveId">,
  folder: RenewalCompScreenshotDriveFolder,
): FolderVerification {
  if (
    folder.id !== record.folderId ||
    folder.mimeType !== RENEWAL_COMP_SCREENSHOT_FOLDER_MIME ||
    folder.trashed ||
    !folder.isAppAuthorized ||
    !folder.capabilities.canAddChildren
  ) {
    return {
      status: "mismatch",
      reason:
        "The exact Drive parent is not an app-authorized writable folder in the approved boundary.",
    };
  }
  const approvedSharedDriveId = record.approvedSharedDriveId ?? "";
  if (
    approvedSharedDriveId
      ? folder.driveId !== approvedSharedDriveId
      : folder.driveId !== undefined || folder.ownedByMe !== true
  ) {
    return {
      status: "mismatch",
      reason: approvedSharedDriveId
        ? "The Drive parent is not in the exact approved Shared Drive."
        : "The Drive parent is not owned by the managed delegated subject in My Drive.",
    };
  }
  return {
    status: "verified",
    evidence: {
      folderMetadataHash: hashExecutionPreview({
        folderId: folder.id,
        mimeType: folder.mimeType,
        trashed: folder.trashed,
        version: folder.version,
        isAppAuthorized: folder.isAppAuthorized,
        ownedByMe: folder.ownedByMe ?? null,
        driveId: folder.driveId ?? null,
        canAddChildren: folder.capabilities.canAddChildren,
      }),
      folderVersion: folder.version,
      folder,
    },
  };
}

function verifyStoredDriveFile(
  record: CompScreenshotExecutionRecord,
  file: RenewalCompScreenshotDriveFile,
  providerPayloadHash: string,
  expectedTrashed: boolean,
): FileVerification {
  if (!record.reservedFileId || file.id !== record.reservedFileId) {
    return { status: "mismatch", reason: "Drive returned a different file id." };
  }
  if (
    file.name !== record.driveFilename ||
    file.mimeType !== record.mimeType ||
    file.size !== String(record.sizeBytes) ||
    file.parents.length !== 1 ||
    file.parents[0] !== record.folderId ||
    !file.isAppAuthorized ||
    (record.approvedSharedDriveId
      ? file.driveId !== record.approvedSharedDriveId
      : file.driveId !== undefined || file.ownedByMe !== true) ||
    canonicalJson(file.appProperties) !==
      canonicalJson(compScreenshotProviderPayload(record).appProperties)
  ) {
    return {
      status: "mismatch",
      reason:
        "The Drive file name, folder, type, size, or private action binding does not match the receipt candidate.",
    };
  }
  if (file.trashed !== expectedTrashed || file.explicitlyTrashed !== expectedTrashed) {
    return {
      status: "mismatch",
      reason: expectedTrashed
        ? "Drive did not verify an explicit trash effect."
        : "The Drive file is already trashed or inherits a trashed state.",
    };
  }
  if (!file.md5Checksum || !file.sha256Checksum || !file.headRevisionId) {
    return {
      status: "pending",
      reason:
        "Drive has not yet returned complete checksum and revision evidence for the file.",
    };
  }
  if (
    file.md5Checksum.toLowerCase() !== record.contentMd5 ||
    file.sha256Checksum.toLowerCase() !== record.contentSha256
  ) {
    return {
      status: "mismatch",
      reason: "The Drive checksum does not match the exact selected bytes.",
    };
  }
  if (
    !file.capabilities.canUntrash ||
    (!expectedTrashed && !file.capabilities.canTrash)
  ) {
    return {
      status: "pending",
      reason:
        "The managed Drive identity cannot prove the required trash/untrash recovery capability.",
    };
  }
  const metadataHash = hashExecutionPreview({
    fileId: file.id,
    nameHash: hashCompScreenshotFilename(file.name),
    mimeType: file.mimeType,
    size: file.size,
    md5Checksum: file.md5Checksum.toLowerCase(),
    sha256Checksum: file.sha256Checksum.toLowerCase(),
    parents: file.parents,
    trashed: file.trashed,
    explicitlyTrashed: file.explicitlyTrashed,
    appProperties: file.appProperties,
    createdTime: file.createdTime,
    modifiedTime: file.modifiedTime,
    version: file.version,
    headRevisionId: file.headRevisionId,
    isAppAuthorized: file.isAppAuthorized,
    ownedByMe: file.ownedByMe ?? null,
    driveId: file.driveId ?? null,
    canTrash: file.capabilities.canTrash,
    canUntrash: file.capabilities.canUntrash,
  });
  if (providerPayloadHash !== compScreenshotProviderPayload(record).providerPayloadHash) {
    return {
      status: "mismatch",
      reason: "The Drive provider payload binding changed.",
    };
  }
  return { status: "verified", evidence: { metadataHash, file } };
}

function receiptFromVerifiedFile(
  record: CompScreenshotExecutionRecord,
  providerPayloadHash: string,
  evidence: VerifiedFile,
  reconciled: boolean,
): CompScreenshotReceipt {
  const file = evidence.file;
  return buildCompScreenshotReceipt(
    record,
    {
      fileId: file.id,
      providerPayloadHash,
      providerMetadataHash: evidence.metadataHash,
      md5Checksum: file.md5Checksum!.toLowerCase(),
      sha256Checksum: file.sha256Checksum!.toLowerCase(),
      version: file.version,
      headRevisionId: file.headRevisionId!,
      createdTime: file.createdTime,
      ...(file.webViewLink ? { webViewLink: file.webViewLink } : {}),
      canUntrash: file.capabilities.canUntrash ?? false,
    },
    reconciled,
  );
}

async function requireDeliveredExecution(
  executionId: string,
  deps: CompScreenshotServiceDeps,
  context: CompScreenshotExecutionContext,
): Promise<CompScreenshotExecutionRecord> {
  const record = await deps.store.getExecution(executionId);
  if (!record || record.state !== "delivered" || !record.receipt) {
    throw new CompScreenshotContractError(
      "A delivered screenshot receipt is required.",
      "not_found",
      404,
    );
  }
  assertExecutionContext(record, deps, context);
  return record;
}

async function requireDeliveredOrRollbackExecution(
  executionId: string,
  deps: CompScreenshotServiceDeps,
  context: CompScreenshotExecutionContext,
): Promise<CompScreenshotExecutionRecord> {
  const record = await deps.store.getExecution(executionId);
  if (
    !record ||
    (record.state !== "delivered" && record.state !== "rolled_back") ||
    !record.receipt
  ) {
    throw new CompScreenshotContractError(
      "A delivered screenshot receipt is required.",
      "not_found",
      404,
    );
  }
  assertExecutionContext(record, deps, context);
  return record;
}

function assertExecutionContext(
  record: CompScreenshotExecutionRecord,
  deps: CompScreenshotServiceDeps,
  context: CompScreenshotExecutionContext,
) {
  if (
    record.providerIdentityHash !== deps.providerIdentityHash ||
    canonicalJson(record.descriptor) !== canonicalJson(context.descriptor)
  ) {
    throw new CompScreenshotContractError(
      "The Drive provider identity or environment changed.",
      "preview_stale",
    );
  }
}

function assertCompScreenshotLeaseIdentity(
  record: CompScreenshotExecutionRecord,
  leaseId: string,
) {
  let identity: ReturnType<typeof compScreenshotRecordIdentity>;
  try {
    identity = compScreenshotRecordIdentity(leaseId);
  } catch {
    throw new CompScreenshotContractError(
      "A canonical renewal record id is required for rollback.",
      "invalid_request",
      400,
    );
  }
  if (
    record.renewalRecordHash !== identity.renewalRecordHash ||
    record.compRecordHash !== identity.compRecordHash
  ) {
    throw new CompScreenshotContractError(
      "The rollback lease does not match the receipted screenshot execution.",
      "rollback_stale",
    );
  }
}

async function requireRollbackPreview(
  actor: AuthenticatedUser,
  input: { executionId: string; rollbackId: string; previewHash: string },
  record: CompScreenshotExecutionRecord,
  deps: CompScreenshotServiceDeps,
  context: CompScreenshotExecutionContext,
): Promise<CompScreenshotRollbackPreviewRecord> {
  if (
    !/^comp_trash_[a-f0-9]{48}$/.test(input.rollbackId) ||
    !/^[a-f0-9]{64}$/.test(input.previewHash)
  ) {
    throw new CompScreenshotContractError(
      "Exact rollback preview identifiers are required.",
      "invalid_request",
      400,
    );
  }
  const preview = await deps.store.getRollbackPreview(input.previewHash);
  if (!preview || !record.receipt) {
    throw new CompScreenshotContractError(
      "The rollback preview is missing.",
      "rollback_stale",
    );
  }
  const confirmingActorUid = preview.recoveryActorUid ?? preview.binding.actorUid;
  const binding: CompScreenshotRollbackBinding = {
    ...preview.binding,
    executionId: input.executionId,
    originalReceiptId: record.receipt.receiptId,
    originalResultHash: record.receipt.resultHash,
    fileId: record.reservedFileId!,
    providerIdentityHash: deps.providerIdentityHash,
    descriptor: context.descriptor,
  };
  if (
    confirmingActorUid !== actor.uid ||
    preview.rollbackId !== input.rollbackId ||
    preview.bindingHash !== compScreenshotRollbackBindingHash(binding) ||
    canonicalJson(preview.binding) !== canonicalJson(binding)
  ) {
    throw new CompScreenshotContractError(
      "The rollback actor, receipt, file, provider identity, or environment changed.",
      "rollback_stale",
    );
  }
  return preview;
}

function publicStatus(
  record: CompScreenshotExecutionRecord | null,
): CompScreenshotStatusOutcome {
  if (!record) return { status: "not_found" };
  if (
    record.state === "delivered" &&
    record.receipt &&
    (record.rollback?.state === "running" || record.rollback?.state === "ambiguous")
  ) {
    return {
      status:
        record.rollback.state === "running" ? "rollback_running" : "rollback_ambiguous",
      executionId: record.id,
      reason:
        record.rollback.state === "running"
          ? "Screenshot removal is still in progress. Recover this exact rollback before treating the attachment as delivered."
          : "Screenshot removal is uncertain. Recover this exact rollback before treating the attachment as delivered.",
    };
  }
  if (record.state === "delivered" && record.receipt) {
    return { status: "delivered", executionId: record.id, receipt: record.receipt };
  }
  if (record.state === "rolled_back" && record.receipt && record.rollback?.receipt) {
    return {
      status: "rolled_back",
      executionId: record.id,
      receipt: record.receipt,
      rollbackReceipt: record.rollback.receipt,
    };
  }
  if (record.state === "delivered" || record.state === "rolled_back") {
    return {
      status: "ambiguous",
      executionId: record.id,
      reason: "The execution is missing its durable receipt evidence.",
    };
  }
  return {
    status: record.state,
    executionId: record.id,
    ...(record.state === "ambiguous"
      ? {
          reason:
            "Drive delivery is uncertain. Reconcile reads the reserved file id without generating another.",
        }
      : {}),
  };
}

function publicRollbackPreview(
  preview: CompScreenshotRollbackPreviewRecord,
  ref: string,
): CompScreenshotRollbackOutcome {
  return {
    status: "preview",
    preview: {
      executionId: preview.binding.executionId,
      rollbackId: preview.rollbackId,
      previewHash: preview.id,
      expiresAt: new Date(preview.expiresAtMs).toISOString(),
      providerDriftedSinceReceipt: preview.providerDriftedSinceReceipt,
    },
    target: {
      ref,
      targetLabel: RENEWAL_COMP_SCREENSHOT_TARGET_LABEL,
    },
  };
}

export function compScreenshotErrorResponse(error: unknown) {
  if (error instanceof CompScreenshotContractError) {
    return {
      status: error.status,
      body: {
        action_key: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
        error: error.message,
        error_type: error.code,
      },
    };
  }
  if (error instanceof EnvironmentContextError) {
    return {
      status: 409,
      body: {
        action_key: RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
        data_context: error.descriptor.dataContext,
        environment_kind: error.descriptor.environmentKind,
        error: error.message,
        error_type: "environment_context_not_allowed",
      },
    };
  }
  return null;
}

export function defaultCompScreenshotServiceClock() {
  return {
    now: () => new Date(),
    nonce: randomUUID,
  };
}
