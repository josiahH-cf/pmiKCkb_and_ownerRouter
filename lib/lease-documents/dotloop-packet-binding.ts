import { EditableLayerError } from "@/lib/firestore/errors";
import type {
  LeaseArtifactCatalog,
  PacketHead,
  RenewalPacketSnapshot,
} from "@/lib/lease-documents/packet-types";

export interface DotloopPacketBinding {
  packetSnapshotId: string;
  packetSnapshotHash: string;
  packetContext: "renewal_extension" | "full_lease_packet" | "owner_acknowledgment";
  catalogVersion: string;
  templateRef: string;
  participantRefs: string[];
  chargeIds: string[];
  animalIds: string[];
  documents: Array<{
    artifactId: string;
    artifactVersion: string;
    documentRef: string;
    contentHash: string;
    audience: "tenant" | "owner";
    fieldBindings: Array<{
      fieldId: string;
      factKey: string;
      sourceReference: string;
    }>;
    signatureLocations: string[];
  }>;
}

/**
 * S34's sole S66 consumer boundary. It maps an exact, current, complete packet snapshot to inert
 * transport metadata; it imports no Dotloop provider and performs no construction or network I/O.
 */
export function bindCurrentPacketForDotloop(input: {
  snapshot: RenewalPacketSnapshot;
  currentHead: PacketHead;
  catalog: LeaseArtifactCatalog;
  confirmedPayloadHash: string;
}): DotloopPacketBinding {
  const { snapshot, currentHead, catalog, confirmedPayloadHash } = input;
  if (
    snapshot.visibleState !== "Ready for preview" ||
    snapshot.state !== "Ready for preview" ||
    snapshot.current !== true ||
    snapshot.manifest === null ||
    snapshot.blockers.length > 0
  ) {
    throw new EditableLayerError(
      "Only a complete current packet snapshot can enter Dotloop preview.",
      409,
    );
  }
  if (
    currentHead.snapshotId !== snapshot.snapshotId ||
    currentHead.payloadHash !== snapshot.payloadHash ||
    currentHead.snapshotVersion !== snapshot.snapshotVersion ||
    confirmedPayloadHash !== snapshot.payloadHash ||
    catalog.catalogVersion !== snapshot.catalogVersion
  ) {
    throw new EditableLayerError(
      "The packet snapshot or confirmation hash is stale.",
      409,
    );
  }

  const manifest = snapshot.manifest;
  const artifactById = new Map(
    catalog.artifacts.map((artifact) => [artifact.artifactId, artifact]),
  );
  const artifacts = manifest.includedArtifacts.map((included) => {
    const artifact = included.artifactId
      ? artifactById.get(included.artifactId)
      : undefined;
    if (
      !artifact ||
      artifact.status !== "active" ||
      artifact.version !== included.version ||
      artifact.contentHash !== included.contentHash ||
      artifact.audience !== manifest.audience ||
      !artifact.providerBindings?.dotloopDocumentRef
    ) {
      throw new EditableLayerError(
        "An exact active artifact-to-Dotloop mapping is unavailable.",
        409,
      );
    }
    return artifact;
  });
  const templateRefs = [
    ...new Set(
      artifacts.flatMap((artifact) =>
        artifact.providerBindings?.dotloopTemplateRef
          ? [artifact.providerBindings.dotloopTemplateRef]
          : [],
      ),
    ),
  ];
  if (templateRefs.length !== 1) {
    throw new EditableLayerError(
      "The packet must map to exactly one approved Dotloop template.",
      409,
    );
  }

  const participantRefs = manifest.participants.map((participant) => {
    const ref = participant.providerBindings?.dotloopParticipantRef?.trim();
    if (!ref) {
      throw new EditableLayerError(
        "Every packet participant needs an exact Dotloop participant mapping.",
        409,
      );
    }
    return ref;
  });

  return {
    packetSnapshotId: snapshot.snapshotId,
    packetSnapshotHash: snapshot.payloadHash,
    packetContext: manifest.packetContext,
    catalogVersion: snapshot.catalogVersion,
    templateRef: templateRefs[0],
    participantRefs,
    chargeIds: manifest.charges.map((charge) => charge.chargeId),
    animalIds: manifest.animals.map((animal) => animal.animalId),
    documents: artifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      artifactVersion: artifact.version,
      documentRef: artifact.providerBindings!.dotloopDocumentRef,
      contentHash: artifact.contentHash,
      audience: artifact.audience,
      fieldBindings: manifest.fields
        .filter((field) => field.artifactId === artifact.artifactId)
        .map((field) => ({
          fieldId: field.fieldId,
          factKey: field.factKey,
          sourceReference: field.source.reference,
        })),
      signatureLocations: [...artifact.signatureLocations],
    })),
  };
}
