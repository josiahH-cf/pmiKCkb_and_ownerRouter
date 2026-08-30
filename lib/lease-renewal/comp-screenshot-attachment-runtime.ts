import { canonicalJson } from "@/lib/execution/preview-hash";
import type { RenewalCompScreenshotDriveFile } from "@/lib/google-drive/renewal-comp-screenshot";
import {
  attachableCompScreenshot,
  compScreenshotDraftAttachmentIdentity,
  compScreenshotDriveFileMetadataHash,
} from "@/lib/lease-renewal/comp-screenshot-attachment";
import {
  compScreenshotProviderPayload,
  compScreenshotRecordIdentity,
  hashCompScreenshotBytes,
  type CompScreenshotExecutionRecord,
} from "@/lib/lease-renewal/comp-screenshot-contract";
import {
  assertCompScreenshotExecutionAllowed,
  assertCompScreenshotSetup,
  CompScreenshotContractError,
  type CompScreenshotExecutionContext,
  type CompScreenshotServiceDeps,
} from "@/lib/lease-renewal/comp-screenshot-service";
import {
  sameRenewalDraftAttachmentIdentity,
  validateRenewalDraftAttachmentIdentity,
  type RenewalDraftAttachmentIdentity,
  type ResolvedRenewalDraftAttachment,
} from "@/lib/lease-renewal/execution/renewal-draft-attachment";
import { sniffImageMime } from "@/lib/maintenance/image-mime";

export async function loadCurrentRenewalDraftCompScreenshotAttachment(
  leaseId: string,
  store: Pick<CompScreenshotServiceDeps["store"], "getLatestExecution">,
) {
  const identity = compScreenshotRecordIdentity(leaseId);
  const record = await store.getLatestExecution(identity.compRecordHash);
  return attachableCompScreenshot(
    record,
    identity.compRecordHash,
    identity.renewalRecordHash,
  );
}

/**
 * Resolve the one exact current receipt to verified bytes immediately before Gmail construction.
 * The closed Drive key and all stale/forged receipt cases stop before either provider factory runs.
 */
export async function resolveRenewalDraftCompScreenshotAttachment(
  leaseId: string,
  expected: RenewalDraftAttachmentIdentity,
  deps: Pick<
    CompScreenshotServiceDeps,
    | "store"
    | "folderId"
    | "approvedSharedDriveId"
    | "providerIdentityHash"
    | "createProvider"
  >,
  context: CompScreenshotExecutionContext,
): Promise<ResolvedRenewalDraftAttachment> {
  const expectedIdentity = validateRenewalDraftAttachmentIdentity(expected);

  // Load-bearing order: the separately governed Drive action is checked before a Firestore receipt
  // lookup and, critically, before Drive/Gmail construction. The Gmail caller invokes this resolver
  // before its own client factory.
  await assertCompScreenshotExecutionAllowed(context, "mutating");
  assertCompScreenshotSetup(deps);

  const identity = compScreenshotRecordIdentity(leaseId);
  if (
    expectedIdentity.spaceId !== "renewals" ||
    expectedIdentity.compRecordHash !== identity.compRecordHash ||
    expectedIdentity.renewalRecordHash !== identity.renewalRecordHash
  ) {
    throw new CompScreenshotContractError(
      "The screenshot receipt does not belong to this Renewals-space lease.",
      "preview_stale",
    );
  }

  const record = await deps.store.getLatestExecution(identity.compRecordHash);
  const current = attachableCompScreenshot(
    record,
    identity.compRecordHash,
    identity.renewalRecordHash,
  );
  if (
    !record ||
    !current ||
    !sameRenewalDraftAttachmentIdentity(
      expectedIdentity,
      compScreenshotDraftAttachmentIdentity(current),
    )
  ) {
    throw new CompScreenshotContractError(
      "The current screenshot receipt changed, was rolled back, or is no longer attachable.",
      "preview_stale",
    );
  }
  if (
    record.folderId !== deps.folderId ||
    (record.approvedSharedDriveId ?? "") !== (deps.approvedSharedDriveId ?? "") ||
    record.providerIdentityHash !== deps.providerIdentityHash
  ) {
    throw new CompScreenshotContractError(
      "The approved Drive folder or managed provider identity changed after preview.",
      "preview_stale",
    );
  }

  const provider = deps.createProvider();
  const metadata = await provider.getFile(current.fileId);
  if (metadata.outcome !== "found") {
    throw new CompScreenshotContractError(
      metadata.outcome === "absent"
        ? "The receipted Drive screenshot no longer exists. Store and review a new screenshot."
        : "The receipted Drive screenshot metadata could not be verified.",
      metadata.outcome === "absent" ? "not_found" : "provider_ambiguous",
      metadata.outcome === "absent" ? 409 : 503,
    );
  }
  assertExactReceiptedFile(record, metadata.file);

  const media = await provider.downloadFile(current.fileId);
  if (media.outcome !== "downloaded") {
    throw new CompScreenshotContractError(
      media.outcome === "absent"
        ? "The receipted Drive screenshot disappeared before its bytes were read."
        : "The receipted Drive screenshot bytes could not be verified.",
      media.outcome === "absent" ? "not_found" : "provider_ambiguous",
      media.outcome === "absent" ? 409 : 503,
    );
  }
  const declaredContentType = media.contentType?.split(";", 1)[0]?.trim().toLowerCase();
  const sha256 = hashCompScreenshotBytes(media.bytes, "sha256");
  const md5 = hashCompScreenshotBytes(media.bytes, "md5");
  const detectedMime = sniffImageMime(Buffer.from(media.bytes).toString("base64"));
  if (
    media.bytes.byteLength !== current.sizeBytes ||
    sha256 !== current.sha256Checksum ||
    md5 !== current.md5Checksum ||
    detectedMime !== current.mimeType ||
    (declaredContentType !== undefined && declaredContentType !== current.mimeType)
  ) {
    throw new CompScreenshotContractError(
      "The Drive bytes no longer match the exact receipted image type, size, or content hash.",
      "provider_mismatch",
    );
  }

  return {
    ...expectedIdentity,
    bytes: new Uint8Array(media.bytes),
  };
}

function assertExactReceiptedFile(
  record: CompScreenshotExecutionRecord,
  file: RenewalCompScreenshotDriveFile,
): void {
  const receipt = record.receipt;
  if (!receipt || !record.reservedFileId) {
    throw new CompScreenshotContractError(
      "The screenshot execution has no complete delivered receipt.",
      "preview_stale",
    );
  }
  const payload = compScreenshotProviderPayload(record);
  const boundaryMatches = record.approvedSharedDriveId
    ? file.driveId === record.approvedSharedDriveId
    : file.driveId === undefined && file.ownedByMe === true;
  const exact =
    file.id === record.reservedFileId &&
    file.name === record.driveFilename &&
    file.mimeType === record.mimeType &&
    file.size === String(record.sizeBytes) &&
    file.parents.length === 1 &&
    file.parents[0] === record.folderId &&
    file.trashed === false &&
    file.explicitlyTrashed === false &&
    file.isAppAuthorized === true &&
    boundaryMatches &&
    file.md5Checksum?.toLowerCase() === record.contentMd5 &&
    file.sha256Checksum?.toLowerCase() === record.contentSha256 &&
    file.version === receipt.version &&
    file.headRevisionId === receipt.headRevisionId &&
    file.createdTime === receipt.createdTime &&
    file.capabilities.canTrash === true &&
    file.capabilities.canUntrash === receipt.canUntrash &&
    canonicalJson(file.appProperties) === canonicalJson(payload.appProperties) &&
    payload.providerPayloadHash === receipt.providerPayloadHash &&
    compScreenshotDriveFileMetadataHash(file) === receipt.providerMetadataHash;
  if (!exact) {
    throw new CompScreenshotContractError(
      "The Drive file metadata changed after the screenshot receipt was issued.",
      "provider_mismatch",
    );
  }
}
