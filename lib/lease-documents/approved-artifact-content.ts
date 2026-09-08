import { createHash } from "node:crypto";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { canAccessSpaceId } from "@/lib/space-scope-resources";
import { resolveStoredDataMode } from "@/lib/data-mode";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  getPublicationVersion,
  PUBLICATION_COLLECTIONS,
} from "@/lib/publication/service";
import { FirestorePublicationContentStore } from "@/lib/publication/content";
import type {
  PublicationContentReference,
  PublicationVersionRecord,
} from "@/lib/publication/types";
import type { LeaseArtifactCatalog } from "@/lib/lease-documents/packet-types";

export interface ApprovedArtifactContentDeps {
  readPublication: (versionId: string) => Promise<PublicationVersionRecord>;
  readActiveVersionId: (resourceId: string) => Promise<string | null>;
  readContent: (reference: PublicationContentReference) => Promise<Uint8Array>;
}
const DEFAULT_DEPS: ApprovedArtifactContentDeps = {
  readPublication: (id) => getPublicationVersion(id),
  readActiveVersionId: async (id) => {
    const doc = await getAdminFirestore()
      .collection(PUBLICATION_COLLECTIONS.resources)
      .doc(id)
      .get();
    const value = doc.data()?.activeVersionId;
    return typeof value === "string" ? value : null;
  },
  readContent: (reference) =>
    new FirestorePublicationContentStore(getAdminFirestore()).read(reference),
};

/** Transport exactly one S21 publication named by the server's approved catalog. Neither an
 * arbitrary URL/Drive id nor browser-supplied bytes can become a legal artifact through this seam. */
export async function resolveApprovedDotloopArtifact(
  actor: AuthenticatedUser,
  input: {
    catalog: LeaseArtifactCatalog;
    documentRef: string;
    expectedContentHash: string;
  },
  deps: ApprovedArtifactContentDeps = DEFAULT_DEPS,
) {
  if (!can(actor.role, "read") || !canAccessSpaceId(actor, "renewals"))
    throw new EditableLayerError("This user cannot read renewal artifacts.", 403);
  const matches = input.catalog.artifacts.filter(
    (artifact) =>
      artifact.status === "active" &&
      artifact.providerBindings?.dotloopDocumentRef === input.documentRef,
  );
  const artifact = matches[0];
  const source = artifact?.publicationSource;
  const versionId =
    source?.system === "s21_publication" && source.reference.startsWith("publication:")
      ? source.reference.slice("publication:".length)
      : "";
  if (
    matches.length !== 1 ||
    !versionId ||
    versionId.includes("/") ||
    !/^[a-f0-9]{64}$/.test(input.expectedContentHash) ||
    artifact.contentHash !== input.expectedContentHash
  )
    throw new EditableLayerError(
      "An exact approved publication mapping is required.",
      409,
    );
  const version = await deps.readPublication(versionId);
  if (
    version.id !== versionId ||
    !version.validated ||
    resolveStoredDataMode(version) !== "live" ||
    version.spaceId !== "renewals" ||
    version.contentHash !== input.expectedContentHash ||
    version.contentRef?.contentHash !== input.expectedContentHash ||
    (await deps.readActiveVersionId(version.resourceId)) !== versionId
  )
    throw new EditableLayerError(
      "The approved artifact publication is unavailable or has changed.",
      409,
    );
  const content = await deps.readContent(version.contentRef);
  if (
    content.byteLength !== version.contentByteSize ||
    createHash("sha256").update(content).digest("hex") !== input.expectedContentHash ||
    (await deps.readActiveVersionId(version.resourceId)) !== versionId
  )
    throw new EditableLayerError(
      "The approved artifact content changed during readback.",
      409,
    );
  return { fileName: version.fileName, contentType: version.detectedMimeType, content };
}
