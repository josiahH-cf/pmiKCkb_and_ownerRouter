import { createHash } from "node:crypto";

import type { ExternalActionInput } from "@/lib/external-execution/types";
import { COMP_SCREENSHOT_MAX_BYTES } from "@/lib/lease-renewal/comp-screenshot-contract";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  sniffImageMime,
  type AllowedImageMimeType,
} from "@/lib/maintenance/image-mime";

export const RENEWAL_DRAFT_ATTACHMENT_SPACE_ID = "renewals" as const;

export const RENEWAL_DRAFT_ATTACHMENT_FIELDS = [
  "attachment_space_id",
  "attachment_comp_record_hash",
  "attachment_renewal_record_hash",
  "attachment_execution_id",
  "attachment_receipt_id",
  "attachment_result_hash",
  "attachment_filename",
  "attachment_mime_type",
  "attachment_size_bytes",
  "attachment_sha256",
] as const;

const HASH = /^[a-f0-9]{64}$/;
const EXECUTION_ID = /^comp_store_[a-f0-9]{48}$/;
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ALLOWED_MIME = new Set<string>(ALLOWED_IMAGE_MIME_TYPES);
const MIME_EXTENSIONS: Record<AllowedImageMimeType, readonly string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
};

/** Immutable, byte-free identity shown in and bound by the S20 preview. */
export interface RenewalDraftAttachmentIdentity {
  spaceId: typeof RENEWAL_DRAFT_ATTACHMENT_SPACE_ID;
  compRecordHash: string;
  renewalRecordHash: string;
  executionId: string;
  receiptId: string;
  resultHash: string;
  filename: string;
  mimeType: AllowedImageMimeType;
  sizeBytes: number;
  sha256Checksum: string;
}

/** Exact verified bytes exist only in memory immediately before MIME/provider construction. */
export interface ResolvedRenewalDraftAttachment extends RenewalDraftAttachmentIdentity {
  bytes: Uint8Array;
}

export function validateRenewalDraftAttachmentIdentity(
  identity: RenewalDraftAttachmentIdentity,
): RenewalDraftAttachmentIdentity {
  if (identity.spaceId !== RENEWAL_DRAFT_ATTACHMENT_SPACE_ID) {
    throw new Error("The renewal attachment must belong to the Renewals Space.");
  }
  if (
    !HASH.test(identity.compRecordHash) ||
    !HASH.test(identity.renewalRecordHash) ||
    !HASH.test(identity.resultHash) ||
    !HASH.test(identity.sha256Checksum)
  ) {
    throw new Error("The renewal attachment requires exact receipt and content hashes.");
  }
  if (
    !EXECUTION_ID.test(identity.executionId) ||
    identity.receiptId !== identity.executionId
  ) {
    throw new Error(
      "The renewal attachment requires its exact screenshot execution receipt.",
    );
  }
  if (
    !SAFE_FILENAME.test(identity.filename) ||
    identity.filename.includes("..") ||
    identity.filename.includes("/") ||
    identity.filename.includes("\\")
  ) {
    throw new Error("The renewal attachment filename is unsafe.");
  }
  if (!ALLOWED_MIME.has(identity.mimeType)) {
    throw new Error("The renewal attachment MIME type is not allowed.");
  }
  if (
    !MIME_EXTENSIONS[identity.mimeType].some((extension) =>
      identity.filename.toLowerCase().endsWith(extension),
    )
  ) {
    throw new Error("The renewal attachment filename does not match its image type.");
  }
  if (
    !Number.isSafeInteger(identity.sizeBytes) ||
    identity.sizeBytes <= 0 ||
    identity.sizeBytes > COMP_SCREENSHOT_MAX_BYTES
  ) {
    throw new Error("The renewal attachment size is outside the 5 MiB boundary.");
  }
  return { ...identity };
}

export function renewalDraftAttachmentActionValues(
  identity: RenewalDraftAttachmentIdentity,
): Readonly<Record<string, string | number>> {
  const value = validateRenewalDraftAttachmentIdentity(identity);
  return {
    attachment_space_id: value.spaceId,
    attachment_comp_record_hash: value.compRecordHash,
    attachment_renewal_record_hash: value.renewalRecordHash,
    attachment_execution_id: value.executionId,
    attachment_receipt_id: value.receiptId,
    attachment_result_hash: value.resultHash,
    attachment_filename: value.filename,
    attachment_mime_type: value.mimeType,
    attachment_size_bytes: value.sizeBytes,
    attachment_sha256: value.sha256Checksum,
  };
}

/**
 * Decode the complete attachment identity from a server-built action. Partial presence is always an
 * error: silently dropping one field would let confirmation target a different logical payload.
 */
export function renewalDraftAttachmentFromAction(
  input: Pick<ExternalActionInput, "values">,
): RenewalDraftAttachmentIdentity | null {
  const present = RENEWAL_DRAFT_ATTACHMENT_FIELDS.filter(
    (field) => input.values[field] !== undefined,
  );
  if (present.length === 0) return null;
  if (present.length !== RENEWAL_DRAFT_ATTACHMENT_FIELDS.length) {
    throw new Error("The renewal attachment action identity is incomplete.");
  }
  const stringField = (key: (typeof RENEWAL_DRAFT_ATTACHMENT_FIELDS)[number]) => {
    const value = input.values[key];
    if (typeof value !== "string" || value.trim() !== value || value === "") {
      throw new Error(`The renewal attachment ${key} is invalid.`);
    }
    return value;
  };
  const mimeType = stringField("attachment_mime_type");
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error("The renewal attachment MIME type is not allowed.");
  }
  const sizeBytes = input.values.attachment_size_bytes;
  if (typeof sizeBytes !== "number") {
    throw new Error("The renewal attachment size is invalid.");
  }
  return validateRenewalDraftAttachmentIdentity({
    spaceId: stringField(
      "attachment_space_id",
    ) as typeof RENEWAL_DRAFT_ATTACHMENT_SPACE_ID,
    compRecordHash: stringField("attachment_comp_record_hash"),
    renewalRecordHash: stringField("attachment_renewal_record_hash"),
    executionId: stringField("attachment_execution_id"),
    receiptId: stringField("attachment_receipt_id"),
    resultHash: stringField("attachment_result_hash"),
    filename: stringField("attachment_filename"),
    mimeType: mimeType as AllowedImageMimeType,
    sizeBytes,
    sha256Checksum: stringField("attachment_sha256"),
  });
}

export function sameRenewalDraftAttachmentIdentity(
  left: RenewalDraftAttachmentIdentity,
  right: RenewalDraftAttachmentIdentity,
): boolean {
  const leftValues = renewalDraftAttachmentActionValues(left);
  const rightValues = renewalDraftAttachmentActionValues(right);
  return RENEWAL_DRAFT_ATTACHMENT_FIELDS.every(
    (field) => leftValues[field] === rightValues[field],
  );
}

export function validateResolvedRenewalDraftAttachment(
  attachment: ResolvedRenewalDraftAttachment,
): ResolvedRenewalDraftAttachment {
  const identity = validateRenewalDraftAttachmentIdentity(attachment);
  if (!(attachment.bytes instanceof Uint8Array)) {
    throw new Error("The renewal attachment resolver returned no decoded bytes.");
  }
  const bytes = new Uint8Array(attachment.bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const detectedMime = sniffImageMime(Buffer.from(bytes).toString("base64"));
  if (
    bytes.byteLength !== identity.sizeBytes ||
    sha256 !== identity.sha256Checksum ||
    detectedMime !== identity.mimeType
  ) {
    throw new Error(
      "The renewal attachment resolver returned bytes that do not match the reviewed identity.",
    );
  }
  return { ...identity, bytes };
}

export function renewalDraftAttachmentLabel(
  identity: RenewalDraftAttachmentIdentity,
): string {
  validateRenewalDraftAttachmentIdentity(identity);
  return `Comp screenshot attachment: ${identity.filename}`;
}
