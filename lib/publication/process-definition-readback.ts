import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { resolveStoredDataMode } from "@/lib/data-mode";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { CreateProcessDefinitionInputSchema } from "@/lib/firestore/schemas";
import type { ProcessDefinitionRecord } from "@/lib/firestore/types";
import { canonicalJson } from "@/lib/execution/preview-hash";
import {
  isRetiredMaintenanceWorkflow,
  MAINTENANCE_RETIREMENT_MESSAGE,
} from "@/lib/maintenance/retirement";
import {
  assertProcessDefinitionRecordAccess,
  spaceIdForProcessDefinition,
} from "@/lib/space-scope-resources";
import {
  assertPublicationContentReference,
  FirestorePublicationContentStore,
} from "./content";
import { processDefinitionPublicationContent } from "./process-definition-content";
import { processDefinitionRevision } from "./process-definition-revision";

export type ProcessDefinitionPublicationRead =
  | { state: "not_published"; priorVersionId?: string }
  | { state: "unavailable"; message: string }
  | {
      state: "verified";
      definitionId: string;
      definitionRevision: string;
      versionId: string;
      versionNumber: number;
      contentHash: string;
      contentIdentityHash: string;
      byteSize: number;
    };

function unavailable(detail: string): ProcessDefinitionPublicationRead {
  return {
    state: "unavailable",
    message: `The immutable published version ${detail}. No current definition was substituted.`,
  };
}
function sha256(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex");
}
/** Preserve exact editable content; publication timestamps/pointers are separate metadata. */
function contentIdentity(value: Record<string, unknown>) {
  return sha256(
    canonicalJson({
      id: value.id,
      ...Object.fromEntries(
        Object.keys(CreateProcessDefinitionInputSchema.shape).map((key) => [
          key,
          value[key],
        ]),
      ),
    }),
  );
}

/** Genuine bounded reads of the existing immutable owners; no scanning, policy write or publication. */
export async function readProcessDefinitionPublication(
  actor: AuthenticatedUser,
  definition: ProcessDefinitionRecord,
  suppliedDb?: Firestore,
): Promise<ProcessDefinitionPublicationRead> {
  if (!can(actor.role, "read"))
    throw new EditableLayerError("Process read access is required.", 403);
  assertProcessDefinitionRecordAccess(actor, definition);
  if (isRetiredMaintenanceWorkflow(definition.space_id, definition.id))
    throw new EditableLayerError(MAINTENANCE_RETIREMENT_MESSAGE, 410);
  if (definition.status !== "Active")
    return {
      state: "not_published",
      ...(definition.active_version_id
        ? { priorVersionId: definition.active_version_id }
        : {}),
    };
  const versionId = definition.active_version_id;
  if (typeof versionId !== "string" || !/^[A-Za-z0-9:_-]{1,200}$/.test(versionId))
    return unavailable("has no valid saved version reference");
  try {
    const db = suppliedDb ?? getAdminFirestore();
    const spaceId = spaceIdForProcessDefinition(definition);
    const versionSnapshot = await db
      .collection("process_definition_versions")
      .doc(versionId)
      .get();
    const version = versionSnapshot.data();
    if (!versionSnapshot.exists) return unavailable("is missing");
    if (
      version?.id !== versionId ||
      version.definition_id !== definition.id ||
      !Number.isSafeInteger(version.version_number) ||
      version.version_number < 1 ||
      typeof version.snapshot_json !== "string"
    )
      return unavailable("has inconsistent version identity");
    let parsed: unknown;
    try {
      parsed = JSON.parse(version.snapshot_json);
    } catch {
      return unavailable("contains corrupt content");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return unavailable("contains invalid content");
    const snapshot = parsed as ProcessDefinitionRecord;
    if (
      snapshot.id !== definition.id ||
      snapshot.active_version_id !== versionId ||
      snapshot.status !== "Active" ||
      spaceIdForProcessDefinition(snapshot) !== spaceId ||
      !CreateProcessDefinitionInputSchema.safeParse(snapshot).success ||
      snapshot.steps.some((step) => typeof step.id !== "string" || !step.id.trim()) ||
      new Set(snapshot.steps.map((step) => step.id)).size !== snapshot.steps.length
    )
      return unavailable("has inconsistent definition, Space or content identity");
    const [publicationSnapshot, resourceSnapshot] = await Promise.all([
      db.collection("publication_versions").doc(versionId).get(),
      db
        .collection("publication_resources")
        .doc(`process-definition:${definition.id}`)
        .get(),
    ]);
    const publication = publicationSnapshot.data();
    const resource = resourceSnapshot.data();
    if (
      !publicationSnapshot.exists ||
      !resourceSnapshot.exists ||
      publication?.id !== versionId ||
      publication.validated !== true ||
      publication.resourceId !== `process-definition:${definition.id}` ||
      publication.resourceType !== "process_definition" ||
      publication.spaceId !== spaceId ||
      publication.detectedMimeType !== "application/json" ||
      publication.versionNumber !== version.version_number ||
      resolveStoredDataMode(publication) !== "live" ||
      resource?.id !== `process-definition:${definition.id}` ||
      resource?.activeVersionId !== versionId ||
      resource.resourceType !== "process_definition" ||
      resource.spaceId !== spaceId ||
      resource.policyId !== publication.policyId ||
      resolveStoredDataMode(resource) !== "live"
    )
      return unavailable("does not match its validated publication record");
    assertPublicationContentReference(publication.contentRef, {
      contentId: versionId,
      contentHash: publication.contentHash,
      byteSize: publication.contentByteSize,
    });
    const bytes = await new FirestorePublicationContentStore(db).read(
      publication.contentRef,
    );
    if (
      bytes.byteLength !== publication.contentByteSize ||
      sha256(bytes) !== publication.contentHash ||
      processDefinitionPublicationContent(snapshot).contentHash !==
        publication.contentHash
    )
      return unavailable("does not match its stored immutable bytes/hash");
    const identity = contentIdentity(snapshot as unknown as Record<string, unknown>);
    if (
      !CreateProcessDefinitionInputSchema.safeParse(definition).success ||
      contentIdentity(definition as unknown as Record<string, unknown>) !== identity
    )
      return unavailable("does not match the current saved process content");
    return {
      state: "verified",
      definitionId: definition.id,
      definitionRevision: definition.revision ?? processDefinitionRevision(definition),
      versionId,
      versionNumber: version.version_number,
      contentHash: publication.contentHash,
      contentIdentityHash: identity,
      byteSize: bytes.byteLength,
    };
  } catch {
    return unavailable("could not be read or its content is corrupt");
  }
}
