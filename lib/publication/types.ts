import type { SourceState } from "@/lib/source-state";
import type { DataMode } from "@/lib/data-mode";

export const MAX_PUBLICATION_CONTENT_BYTES = 25 * 1024 * 1024;

export const PUBLICATION_RESOURCE_TYPES = [
  "file",
  "folder",
  "process_definition",
] as const;

export type PublicationResourceType = (typeof PUBLICATION_RESOURCE_TYPES)[number];
export type PublicationSensitivity = "Low" | "Medium" | "High";

export interface PublicationAllowedType {
  extension: string;
  maxBytes: number;
  mimeTypes: readonly string[];
}

export interface PublicationPolicyRecord {
  id: string;
  /** Legacy absence is Live. Test policies are server-owned exact fixtures only. */
  data_mode?: DataMode;
  test_fixture_key?: string;
  allowedSpaces: readonly string[];
  allowedTypes: readonly PublicationAllowedType[];
  connectorId: string;
  createdAt: string;
  createdByUid: string;
  enabled: boolean;
  rootId: string;
  scannerKey: string;
  sensitivityCeiling: PublicationSensitivity;
  updatedAt: string;
  updatedByUid: string;
}

export interface PublicationMetadata {
  citationLabel?: string;
  connectorId: string;
  declaredByteSize: number;
  declaredMimeType: string;
  detectedMimeType?: string;
  fileName: string;
  path: string;
  processActionKeys?: readonly string[];
  processStepIds?: readonly string[];
  resourceId: string;
  resourceType: PublicationResourceType;
  rootId: string;
  sourceState?: SourceState;
  spaceId: string;
  data_mode?: DataMode;
  test_fixture_key?: string;
}

export interface PublicationEnvelope {
  /**
   * Load at most the supplied number of bytes. HTTP adapters must enforce this
   * limit while streaming; validation still checks the returned buffer as a
   * defense in depth for non-HTTP adapters.
   */
  loadContent: (maxBytes: number) => Promise<Uint8Array>;
  metadata: PublicationMetadata;
}

export interface PublicationContentReference {
  byteSize: number;
  chunkCount: number;
  contentHash: string;
  contentId: string;
  storage: "firestore-chunks-v1";
}

export type PublicationScanCode =
  | "clean"
  | "malware_detected"
  | "sensitivity_violation"
  | "scanner_unavailable";

export interface PublicationScanResult {
  code: PublicationScanCode;
  sensitivity?: PublicationSensitivity;
}

export interface PublicationScanner {
  key: string;
  scanMalware(
    content: Uint8Array,
    metadata: Readonly<PublicationMetadata>,
  ): Promise<PublicationScanResult>;
  scanSensitivity(
    content: Uint8Array,
    metadata: Readonly<PublicationMetadata>,
  ): Promise<PublicationScanResult>;
}

export type PublicationFailureCode =
  | "actor_not_authorized"
  | "authority_field_forbidden"
  | "content_size_mismatch"
  | "data_mode_mismatch"
  | "malware_detected"
  | "mime_mismatch"
  | "path_outside_root"
  | "policy_disabled"
  | "policy_not_found"
  | "process_action_unknown"
  | "process_graph_invalid"
  | "root_mismatch"
  | "scanner_mismatch"
  | "scanner_unavailable"
  | "sensitivity_violation"
  | "source_metadata_invalid"
  | "space_not_allowed"
  | "type_denied"
  | "oversize";

export interface PublicationValidationResult {
  contentHash: string;
  detectedMimeType: string;
  sensitivity: PublicationSensitivity;
}

export interface PublicationVersionRecord {
  id: string;
  data_mode?: DataMode;
  test_fixture_key?: string;
  citationLabel?: string;
  connectorId: string;
  contentByteSize: number;
  contentHash: string;
  contentRef: PublicationContentReference;
  createdAt: string;
  createdByUid: string;
  detectedMimeType: string;
  fileName: string;
  path: string;
  policyId: string;
  resourceId: string;
  resourceType: PublicationResourceType;
  rootId: string;
  rollbackOfVersionId?: string;
  sensitivity: PublicationSensitivity;
  sourceState?: SourceState;
  spaceId: string;
  validated: true;
  versionNumber: number;
}

export interface PublicationResourceRecord {
  id: string;
  data_mode?: DataMode;
  test_fixture_key?: string;
  activeVersionId: string;
  /** Monotonic sequence guarded by the resource-document transaction lock. */
  lastVersionNumber: number;
  policyId: string;
  resourceType: PublicationResourceType;
  spaceId: string;
  updatedAt: string;
  updatedByUid: string;
}
