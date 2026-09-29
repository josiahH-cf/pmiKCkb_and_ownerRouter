import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  derivedArtifactDeps,
  readDerivedArtifactContent,
  readCurrentDerivedArtifact,
  readHistoricalDerivedArtifactContent,
  type DerivedArtifactDeps,
} from "@/lib/firestore/lease-derived-artifacts";
import type {
  DotloopPacketBinding,
  bindCurrentPacketForDotloop,
} from "./dotloop-packet-binding";

/** Add exact reviewed output identities; legacy/static documents keep their original byte contract. */
export async function bindApprovedDerivedPacket(
  actor: AuthenticatedUser,
  binding: DotloopPacketBinding,
  packet: Parameters<typeof bindCurrentPacketForDotloop>[0],
  injected?: { db: Firestore; deps: DerivedArtifactDeps },
): Promise<DotloopPacketBinding> {
  const required = packet.catalog.artifacts.filter(
    (artifact) =>
      artifact.fillMapping &&
      binding.documents.some((document) => document.artifactId === artifact.artifactId),
  );
  if (!required.length) return binding;
  const db = injected?.db ?? getAdminFirestore(),
    deps = injected?.deps ?? derivedArtifactDeps(db);
  const documents = [...binding.documents];
  for (const artifact of required) {
    const request = {
      leaseId: packet.snapshot.leaseId,
      snapshotId: packet.snapshot.snapshotId,
      artifactId: artifact.artifactId,
    };
    const record = await readCurrentDerivedArtifact(actor, request, db, deps);
    if (!record)
      throw new EditableLayerError(
        "Prepare, inspect and approve the actual filled PDF before packet execution.",
        409,
      );
    await readDerivedArtifactContent(
      actor,
      { ...request, derivedId: record.id, requireApproval: true },
      db,
      deps,
    );
    const index = documents.findIndex(
      (document) => document.artifactId === artifact.artifactId,
    );
    documents[index] = {
      ...documents[index],
      contentHash: record.outputHash,
      derivedArtifactId: record.id,
      derivedProvenanceHash: record.provenanceHash,
    };
  }
  return { ...binding, documents };
}

/** Read-only own-receipt recovery uses the exact derived identities in the immutable S34 preparation. */
export async function bindRetainedDerivedPacket(
  actor: AuthenticatedUser,
  binding: DotloopPacketBinding,
  packet: Parameters<typeof bindCurrentPacketForDotloop>[0],
  retained: DotloopPacketBinding["documents"] | undefined,
  injected?: { db: Firestore; deps: DerivedArtifactDeps },
): Promise<DotloopPacketBinding> {
  const required = packet.catalog.artifacts.filter(
    (artifact) =>
      artifact.fillMapping &&
      binding.documents.some((document) => document.artifactId === artifact.artifactId),
  );
  if (!required.length && !retained?.length) return binding;
  if (
    !retained ||
    retained.length !== required.length ||
    new Set(retained.map((item) => item.artifactId)).size !== retained.length
  )
    throw new EditableLayerError(
      "The retained packet lacks exact filled output identities.",
      409,
    );
  const db = injected?.db ?? getAdminFirestore(),
    deps = injected?.deps ?? derivedArtifactDeps(db);
  const documents = [...binding.documents];
  for (const artifact of required) {
    const saved = retained.find((item) => item.artifactId === artifact.artifactId);
    if (!saved?.derivedArtifactId)
      throw new EditableLayerError("A retained filled output identity is missing.", 409);
    const { record } = await readHistoricalDerivedArtifactContent(
      actor,
      {
        leaseId: packet.snapshot.leaseId,
        snapshotId: packet.snapshot.snapshotId,
        artifactId: artifact.artifactId,
        derivedId: saved.derivedArtifactId,
        requireApproval: true,
      },
      db,
      deps,
    );
    if (
      record.packetHash !== packet.snapshot.payloadHash ||
      record.originalHash !== artifact.contentHash ||
      record.mapHash !== artifact.fillMapping!.mapHash ||
      record.outputHash !== saved.contentHash ||
      record.provenanceHash !== saved.derivedProvenanceHash
    )
      throw new EditableLayerError(
        "The retained output does not match this exact approved packet attempt.",
        409,
      );
    const index = documents.findIndex((item) => item.artifactId === artifact.artifactId);
    if (saved.documentRef !== documents[index].documentRef)
      throw new EditableLayerError("The retained document destination changed.", 409);
    documents[index] = {
      ...documents[index],
      contentHash: record.outputHash,
      derivedArtifactId: record.id,
      derivedProvenanceHash: record.provenanceHash,
    };
  }
  return { ...binding, documents };
}
