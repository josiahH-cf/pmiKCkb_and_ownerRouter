// S236 R-S236-1 / R-S236-5: the current packet's included documents as returned-state inputs, each
// at the version that went out, and the separate "Dotloop shows" line. The version is the latest
// upload recorded for this snapshot in the lease's current loop, else the approved filled copy, else
// the approved original. Only the approved reviewed map for that exact original supplies signers.
// Pure: it reads nothing and writes nothing, and the Dotloop line never sets a signed state.

import type { ArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";
import type { LoopAssociation } from "@/lib/lease-documents/dotloop-loop-association";
import type {
  LeaseArtifactKind,
  RenewalPacketSnapshot,
} from "@/lib/lease-documents/packet-types";
import type { ReturnedDocumentInput } from "@/lib/lease-documents/returned-state";

export interface ReturnedDocumentVersion {
  readonly kind: LeaseArtifactKind;
  readonly label: string;
  readonly contentHash: string;
  readonly versionLabel: string;
}

const CENTRAL = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatCentralTime(iso: string): string | null {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? `${CENTRAL.format(new Date(time))} Central` : null;
}

export function currentReturnedDocuments(input: {
  readonly snapshot: RenewalPacketSnapshot;
  readonly manifest: ArtifactIntakeManifest;
  readonly association: LoopAssociation | null;
  /** The approved filled output hash per artifact id for this snapshot. */
  readonly approvedOutputs: ReadonlyMap<string, string>;
}): { documents: ReturnedDocumentInput[]; versions: ReturnedDocumentVersion[] } {
  const documents: ReturnedDocumentInput[] = [];
  const versions: ReturnedDocumentVersion[] = [];
  for (const included of input.snapshot.manifest?.includedArtifacts ?? []) {
    if (!included.artifactId || !included.contentHash) continue;
    const entry = input.manifest.entries[included.kind];
    const map =
      entry?.state === "approved" &&
      entry.publication?.contentHash === included.contentHash &&
      entry.fieldMap
        ? entry.fieldMap
        : null;
    const uploads =
      input.association?.state === "current"
        ? input.association.documents.filter(
            (document) =>
              document.snapshotId === input.snapshot.snapshotId &&
              document.artifactId === included.artifactId,
          )
        : [];
    const latest = uploads.reduce<(typeof uploads)[number] | null>(
      (newest, document) =>
        !newest || Date.parse(document.uploadedAt) > Date.parse(newest.uploadedAt)
          ? document
          : newest,
      null,
    );
    const approved = input.approvedOutputs.get(included.artifactId) ?? null;
    const contentHash = latest?.contentHash ?? approved ?? included.contentHash;
    documents.push({
      kind: included.kind,
      label: `the ${/^[A-Z][a-z]/.test(included.label) ? included.label.charAt(0).toLowerCase() + included.label.slice(1) : included.label}`,
      contentHash,
      prepared: Boolean(latest || approved || map?.unchangedAttachment),
      uploaded: Boolean(latest),
      signers: map?.signers.length ? map.signers : null,
    });
    versions.push({
      kind: included.kind,
      label: included.label,
      contentHash,
      versionLabel: latest
        ? `Uploaded to Dotloop as ${latest.documentName}`
        : approved
          ? "Approved filled copy"
          : map?.unchangedAttachment
            ? "Approved original, used unchanged"
            : "Approved original; no filled copy approved yet",
    });
  }
  return { documents, versions };
}

/**
 * R-S236-5: the latest "Refresh from Dotloop" result for this packet, shown beside the staff
 * records. Null when no refresh has been recorded.
 */
export function dotloopShowsLine(snapshot: RenewalPacketSnapshot | null): string | null {
  const link = snapshot?.execution?.loopLink;
  const at = link?.readBackAtIso ? formatCentralTime(link.readBackAtIso) : null;
  if (!link || !at) return null;
  const status = link.loopStatus ? `loop status ${link.loopStatus}` : "no loop status";
  const documents =
    link.documentCount === null
      ? "documents present not read"
      : `${link.documentCount} ${link.documentCount === 1 ? "document" : "documents"} present`;
  return `Dotloop shows ${status}, ${documents} as of ${at}`;
}
