import { createHash } from "node:crypto";

import type { CompScreenshotAttachment } from "@/lib/lease-renewal/comp-screenshot-attachment";
import type {
  RenewalDraftAttachmentIdentity,
  ResolvedRenewalDraftAttachment,
} from "@/lib/lease-renewal/execution/renewal-draft-attachment";

export const TEST_RENEWAL_ATTACHMENT_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04,
]);

const EXECUTION_ID = `comp_store_${"1".repeat(48)}`;
const SHA256 = createHash("sha256").update(TEST_RENEWAL_ATTACHMENT_BYTES).digest("hex");
const MD5 = createHash("md5").update(TEST_RENEWAL_ATTACHMENT_BYTES).digest("hex");

export const TEST_RENEWAL_ATTACHMENT_IDENTITY: RenewalDraftAttachmentIdentity = {
  spaceId: "renewals",
  compRecordHash: "2".repeat(64),
  renewalRecordHash: "3".repeat(64),
  executionId: EXECUTION_ID,
  receiptId: EXECUTION_ID,
  resultHash: "4".repeat(64),
  filename: "renewal-comp-fixture.png",
  mimeType: "image/png",
  sizeBytes: TEST_RENEWAL_ATTACHMENT_BYTES.byteLength,
  sha256Checksum: SHA256,
};

export const TEST_RESOLVED_RENEWAL_ATTACHMENT: ResolvedRenewalDraftAttachment = {
  ...TEST_RENEWAL_ATTACHMENT_IDENTITY,
  bytes: TEST_RENEWAL_ATTACHMENT_BYTES,
};

export const TEST_COMP_SCREENSHOT_ATTACHMENT: CompScreenshotAttachment = {
  ...TEST_RENEWAL_ATTACHMENT_IDENTITY,
  fileId: "drive_file_fixture_s79",
  folderId: "drive_folder_fixture_s79",
  md5Checksum: MD5,
  providerPayloadHash: "5".repeat(64),
  providerMetadataHash: "6".repeat(64),
  version: "1",
  headRevisionId: "head_fixture_s79",
  createdTime: "2026-08-30T04:00:00.000Z",
  ref: "drive:drive_file_fixture_s79",
};

export const TEST_OWNER_DRAFT_ATTACHMENT = {
  filename: TEST_RENEWAL_ATTACHMENT_IDENTITY.filename,
  mimeType: TEST_RENEWAL_ATTACHMENT_IDENTITY.mimeType,
  sizeBytes: TEST_RENEWAL_ATTACHMENT_IDENTITY.sizeBytes,
  sha256Checksum: TEST_RENEWAL_ATTACHMENT_IDENTITY.sha256Checksum,
} as const;
