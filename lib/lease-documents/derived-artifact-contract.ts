import { z } from "zod";
import type { PublicationContentReference } from "@/lib/publication/types";
import type { PdfFieldValue } from "./acroform-pdf";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";

export const DERIVED_ARTIFACT_COLLECTIONS = {
  records: "lease_document_derived_artifacts",
  heads: "lease_document_derived_heads",
  freezes: "lease_document_derived_attempt_freezes",
} as const;
export const derivedHeadId = (snapshotId: string, artifactId: string) =>
  hashExecutionPreview({ snapshotId, artifactId });
export function derivedArtifactProvenance(
  record: Omit<DerivedArtifactRecord, "provenanceHash"> | DerivedArtifactRecord,
) {
  const {
    schemaVersion,
    id,
    leaseId,
    snapshotId,
    packetHash,
    artifactId,
    originalPublication,
    originalHash,
    mapVersion,
    mapHash,
    inputSnapshotHash,
    adapter,
    outputHash,
    fileName,
    contentRef,
    comparison,
    preparedBy,
    preparedAt,
    requestHash,
  } = record;
  return hashExecutionPreview({
    schemaVersion,
    id,
    leaseId,
    snapshotId,
    packetHash,
    artifactId,
    originalPublication,
    originalHash,
    mapVersion,
    mapHash,
    inputSnapshotHash,
    adapter,
    outputHash,
    fileName,
    contentRef,
    comparison,
    preparedBy,
    preparedAt,
    requestHash,
  });
}

export const DerivedArtifactRequestSchema = z
  .object({
    leaseId: z.string().regex(/^[1-9]\d*$/),
    artifactId: z.string().trim().min(1).max(250),
    snapshotId: z.string().trim().min(1).max(160),
  })
  .strict();
export const PrepareDerivedArtifactSchema = DerivedArtifactRequestSchema.extend({
  action: z.literal("prepare"),
  operationId: z.string().uuid(),
  expectedCurrentId: z.string().max(100).nullable(),
}).strict();
export const ApproveDerivedArtifactSchema = DerivedArtifactRequestSchema.extend({
  action: z.literal("approve"),
  operationId: z.string().uuid(),
  derivedId: z.string().max(100),
  outputHash: z.string().regex(/^[a-f0-9]{64}$/),
  inspected: z.literal(true),
}).strict();
export type DerivedArtifactRequest = z.infer<typeof DerivedArtifactRequestSchema>;
export interface DerivedArtifactRecord {
  schemaVersion: "approved-derived-pdf/v1";
  id: string;
  leaseId: string;
  snapshotId: string;
  packetHash: string;
  artifactId: string;
  originalPublication: string;
  originalHash: string;
  mapVersion: string;
  mapHash: string;
  inputSnapshotHash: string;
  adapter: string;
  outputHash: string;
  fileName: string;
  contentRef: PublicationContentReference;
  comparison: {
    allFields: Record<string, PdfFieldValue | null>;
    changedFieldNames: string[];
    unchangedObjects: number;
    verified: true;
    /** S130 static route: region ids in geometry order, removed earlier runs and pages. */
    regionOrder?: string[];
    removedRuns?: number;
    pages?: number;
    fixedContentVerified?: true;
  };
  preparedBy: string;
  preparedAt: string;
  requestHash: string;
  provenanceHash: string;
  approval?: {
    actorUid: string;
    approvedAt: string;
    operationId: string;
    outputHash: string;
    provenanceHash: string;
  };
}
