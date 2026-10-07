// S34 (ARCH-S34-2): the lease's one Dotloop loop target, separate from packet snapshots.
//
// A lease holds at most one current loop association. It is either created by the app from the
// verified company template (its own create receipt) or explicitly linked by staff to an existing
// loop they reviewed through the company connection. Packet snapshots and document versions come
// and go underneath it: a changed packet never creates a replacement loop, and each approved
// document version is uploaded into the associated loop as a successor with its own receipt.
//
// Everything here is pure. A matching loop name or address is a hint for staff, never proof that
// the app created a loop or that a loop belongs to a lease. Upload presence never proves content
// equality or a signature.

import { createHash } from "node:crypto";

export const LOOP_ASSOCIATION_SCHEMA_VERSION = "lease-document-loop-association/v1";

export type LoopAssociationOrigin = "app_created" | "linked_existing";
export type LoopAssociationState = "creating" | "current" | "unlinked";

/** One approved document version the app uploaded into the associated loop. */
export interface LoopAssociationDocument {
  readonly artifactId: string;
  /** The catalog's Dotloop document reference the version was uploaded for. */
  readonly documentRef: string;
  readonly label: string;
  /** SHA-256 of the exact bytes the app submitted; never a provider-returned hash. */
  readonly contentHash: string;
  readonly snapshotId: string;
  readonly derivedArtifactId: string | null;
  /** The S20 execution whose receipt owns this upload. */
  readonly receiptId: string;
  readonly dotloopDocumentId: string;
  readonly dotloopFolderId: string;
  readonly documentName: string;
  readonly uploadedAt: string;
  readonly uploadedByUid: string;
  /** The earlier uploaded version of the same document this one supersedes, if any. */
  readonly supersedesContentHash: string | null;
}

export interface LoopAssociationReadback {
  readonly readBackAt: string;
  readonly loopStatus: string | null;
  readonly participantCount: number | null;
}

export interface LoopAssociation {
  readonly schemaVersion: typeof LOOP_ASSOCIATION_SCHEMA_VERSION;
  readonly leaseId: string;
  /** The renewal cycle the association currently serves. */
  readonly cycleId: string;
  readonly state: LoopAssociationState;
  /** Increments whenever the target changes (link, creation, unlink); uploads leave it alone. */
  readonly linkRevision: number;
  readonly revision: number;
  readonly profileId: string;
  /** Null only while an app creation is in flight. */
  readonly loopId: string | null;
  readonly loopName: string | null;
  readonly loopUrl: string | null;
  readonly origin: LoopAssociationOrigin;
  /** The S20 execution that created the loop (app_created only). */
  readonly createExecutionId: string | null;
  readonly linkedByUid: string;
  readonly linkedAt: string;
  readonly reason: string;
  /** Earlier cycles of this same lease the loop was explicitly reused from. */
  readonly priorCycleIds: readonly string[];
  /** The durable destination folder, recorded once and reused by every later upload. */
  readonly folder: {
    readonly dotloopFolderId: string;
    readonly createdByExecutionId: string;
    readonly recordedAt: string;
  } | null;
  /** The one upload attempt allowed to create the folder while none is recorded. */
  readonly folderReservation: {
    readonly executionId: string;
    readonly reservedAt: string;
  } | null;
  readonly documents: readonly LoopAssociationDocument[];
  readonly readback: LoopAssociationReadback | null;
  readonly updatedAt: string;
  readonly updatedByUid: string;
}

/** What the handoff and the loop panel show about the lease's association. */
export interface LoopAssociationView {
  readonly state: LoopAssociationState;
  readonly origin: LoopAssociationOrigin;
  readonly loopId: string | null;
  readonly loopName: string | null;
  readonly loopUrl: string | null;
  readonly profileId: string;
  readonly cycleId: string;
  readonly currentCycle: boolean;
  readonly linkRevision: number;
  readonly linkedAt: string;
  readonly reason: string;
  readonly folderRecorded: boolean;
  readonly readback: LoopAssociationReadback | null;
  readonly documents: readonly LoopAssociationDocument[];
}

/** Stable document id for one lease's association. */
export function loopAssociationDocId(leaseId: string): string {
  return createHash("sha256").update(leaseId.trim()).digest("hex");
}

/** Stable owner-index id for one provider loop. */
export function loopOwnerDocId(profileId: string, loopId: string): string {
  return createHash("sha256")
    .update(`${profileId.trim()}\u0000${loopId.trim()}`)
    .digest("hex");
}

/** Whether the association can receive uploads for this cycle right now. */
export function usableLoopTarget(
  association: LoopAssociation | null,
  cycleId: string | null,
): association is LoopAssociation & { loopId: string } {
  return Boolean(
    association &&
    association.state === "current" &&
    association.loopId &&
    cycleId &&
    association.cycleId === cycleId,
  );
}

export type DocumentUploadStatus =
  | "uploaded_current"
  | "successor_needed"
  | "not_uploaded";

export interface DocumentUploadPlanEntry {
  readonly artifactId: string;
  readonly documentRef: string;
  readonly label: string;
  /** The app's current approved version (original or filled output). */
  readonly contentHash: string;
  readonly status: DocumentUploadStatus;
  /** The most recent uploaded version of this document, if any. */
  readonly latestUpload: LoopAssociationDocument | null;
  /** Every uploaded version, oldest first; none is rewritten. */
  readonly history: readonly LoopAssociationDocument[];
}

/**
 * Which approved documents still need an upload into the associated loop. A document whose exact
 * current bytes were already uploaded reuses that receipt; a changed version needs a successor
 * upload; nothing earlier is removed or rewritten.
 */
export function documentUploadPlan(
  association: Pick<LoopAssociation, "documents"> | null,
  current: ReadonlyArray<{
    artifactId: string;
    documentRef: string;
    label: string;
    contentHash: string;
  }>,
): DocumentUploadPlanEntry[] {
  return current.map((document) => {
    const history = (association?.documents ?? [])
      .filter((uploaded) => uploaded.documentRef === document.documentRef)
      .slice()
      .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
    const latestUpload = history.length ? history[history.length - 1] : null;
    const status: DocumentUploadStatus = history.some(
      (uploaded) => uploaded.contentHash === document.contentHash,
    )
      ? "uploaded_current"
      : history.length
        ? "successor_needed"
        : "not_uploaded";
    return { ...document, status, latestUpload, history };
  });
}

/** Plain-language status for one planned document. */
export const DOCUMENT_UPLOAD_STATUS_LABELS: Readonly<
  Record<DocumentUploadStatus, string>
> = {
  uploaded_current: "This exact version is in the loop; its upload receipt is reused.",
  successor_needed:
    "Changed since its last upload. Upload the reviewed successor; the earlier file stays in Dotloop for a person to retire.",
  not_uploaded: "Not uploaded to the loop yet.",
};

/** The structured property address a new loop is created with, or null when none is verified. */
export interface LoopPropertyAddress {
  readonly streetName: string;
  readonly city: string;
  readonly state: string;
  readonly zip: string;
}

/** The frozen action value for a new loop's address; "none" when the packet has none verified. */
export function propertyAddressValue(address: LoopPropertyAddress | null): string {
  return address
    ? `${address.streetName} | ${address.city} | ${address.state} | ${address.zip}`
    : "none";
}
