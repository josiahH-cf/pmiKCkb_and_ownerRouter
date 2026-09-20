// S130 (F10): app-owned storage for the seven-family lease-artifact intake. Each family carries at
// most one current entry: received through the trusted publication path (bound by publication id
// and content hash, classified from its bytes as data), reviewed with a field and signer map, and
// approved or rejected as that exact version by an existing approver capability. Approval projects
// every approved family into the S66 catalog record (`lease_artifact_catalogs/current`), so the
// packet evaluation, the claim hash and the Dotloop binding consume one reviewed source; any change
// to an approved family rewrites that record and thereby invalidates unexecuted preparations, never
// historical receipts. Nothing here connects a provider, opens an action key or uploads anything.
//
// GOVERNANCE: server-written through the Admin SDK boundary only; the `firestore.rules` default
// deny covers these collections. The manifest read never throws.

import { v7 as uuidv7 } from "uuid";
import type { Firestore, Transaction } from "firebase-admin/firestore";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { resolveStoredDataMode } from "@/lib/data-mode";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  ArtifactIntakeEntrySchema,
  DecideArtifactFamilyInputSchema,
  ReceiveArtifactInputSchema,
  RecordArtifactFieldMapInputSchema,
  emptyArtifactIntakeManifest,
  type ArtifactIntakeEntry,
  type ArtifactIntakeManifest,
} from "@/lib/lease-documents/artifact-intake-contract";
import {
  catalogFromIntake,
  classifyUploadedForm,
  mapHashOf,
  validateFieldMap,
} from "@/lib/lease-documents/artifact-intake";
import { ApprovedLeaseCatalogSchema } from "@/lib/lease-documents/live-source-schema";
import {
  LEASE_ARTIFACT_KINDS,
  type LeaseArtifactKind,
} from "@/lib/lease-documents/packet-types";
import { FirestorePublicationContentStore } from "@/lib/publication/content";
import {
  getPublicationVersion,
  PUBLICATION_COLLECTIONS,
} from "@/lib/publication/service";
import type {
  PublicationContentReference,
  PublicationVersionRecord,
} from "@/lib/publication/types";

export const ARTIFACT_INTAKE_COLLECTION = "lease_artifact_intake";
export const ARTIFACT_INTAKE_ACTIVITY_COLLECTION = "lease_artifact_intake_activity";
/** The S66 catalog record this intake projects into (owned by `lib/lease-documents/live-input.ts`). */
export const ARTIFACT_CATALOG_COLLECTION = "lease_artifact_catalogs";
export const ARTIFACT_CATALOG_DOC_ID = "current";

export interface ArtifactIntakeDeps {
  readPublication: (versionId: string) => Promise<PublicationVersionRecord>;
  readActiveVersionId: (resourceId: string) => Promise<string | null>;
  readContent: (reference: PublicationContentReference) => Promise<Uint8Array>;
}

function defaultDeps(db: Firestore): ArtifactIntakeDeps {
  return {
    readPublication: (id) => getPublicationVersion(id, db),
    readActiveVersionId: async (id) => {
      const doc = await db.collection(PUBLICATION_COLLECTIONS.resources).doc(id).get();
      const value = doc.data()?.activeVersionId;
      return typeof value === "string" ? value : null;
    },
    readContent: (reference) => new FirestorePublicationContentStore(db).read(reference),
  };
}

/** Exactly one validated, live, currently active renewals publication with the named content hash. */
async function requireBoundPublication(
  binding: { reference: string; contentHash: string },
  deps: ArtifactIntakeDeps,
): Promise<PublicationVersionRecord> {
  const versionId = binding.reference.slice("publication:".length);
  let version: PublicationVersionRecord;
  try {
    version = await deps.readPublication(versionId);
  } catch {
    throw new EditableLayerError(
      "The named publication could not be read; an exact approved publication is required.",
      409,
    );
  }
  if (
    version.id !== versionId ||
    !version.validated ||
    resolveStoredDataMode(version) !== "live" ||
    version.spaceId !== "renewals" ||
    version.contentHash !== binding.contentHash ||
    version.contentRef?.contentHash !== binding.contentHash ||
    (await deps.readActiveVersionId(version.resourceId)) !== versionId
  )
    throw new EditableLayerError(
      "The named publication is not the current validated live publication with this content hash.",
      409,
    );
  return version;
}

function parseEntry(id: string, data: unknown): ArtifactIntakeEntry | null {
  const parsed = ArtifactIntakeEntrySchema.safeParse({
    ...(data as Record<string, unknown>),
    id,
  });
  return parsed.success ? parsed.data : null;
}

function stored(entry: ArtifactIntakeEntry): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...entry };
  delete copy.id;
  for (const key of Object.keys(copy)) if (copy[key] === undefined) delete copy[key];
  return copy;
}

function entryRef(db: Firestore, kind: LeaseArtifactKind) {
  return db.collection(ARTIFACT_INTAKE_COLLECTION).doc(kind);
}

async function readManifestIn(
  get: (
    ref: ReturnType<typeof entryRef>,
  ) => Promise<{ exists: boolean; id: string; data: () => unknown }>,
  db: Firestore,
): Promise<{ manifest: ArtifactIntakeManifest; invalid: number }> {
  const snapshots = await Promise.all(
    LEASE_ARTIFACT_KINDS.map((kind) => get(entryRef(db, kind))),
  );
  let invalid = 0;
  const entries = Object.fromEntries(
    LEASE_ARTIFACT_KINDS.map((kind, index) => {
      const snapshot = snapshots[index];
      if (!snapshot.exists) return [kind, null];
      const entry = parseEntry(kind, snapshot.data());
      if (!entry) invalid++;
      return [kind, entry];
    }),
  ) as Record<LeaseArtifactKind, ArtifactIntakeEntry | null>;
  return { manifest: { state: "readable", entries }, invalid };
}

/** The never-throwing manifest every surface consumes; unreadable or malformed reads say so. */
export async function readArtifactIntakeManifest(
  db?: Firestore,
): Promise<ArtifactIntakeManifest> {
  let firestore: Firestore;
  try {
    firestore = db ?? getAdminFirestore();
  } catch {
    return emptyArtifactIntakeManifest("unreadable");
  }
  try {
    const { manifest, invalid } = await readManifestIn((ref) => ref.get(), firestore);
    return invalid > 0 ? { ...manifest, state: "unreadable" } : manifest;
  } catch {
    return emptyArtifactIntakeManifest("unreadable");
  }
}

function writeCatalog(
  transaction: Transaction,
  db: Firestore,
  manifest: ArtifactIntakeManifest,
  meta: { approvedByUid: string; approvedAt: string },
) {
  const record = ApprovedLeaseCatalogSchema.parse(catalogFromIntake(manifest, meta));
  transaction.set(
    db.collection(ARTIFACT_CATALOG_COLLECTION).doc(ARTIFACT_CATALOG_DOC_ID),
    record,
  );
  return record;
}

/**
 * Receive one family's file through the trusted publication path: verify the binding, read the
 * bytes and classify them as data, refuse duplicate content across families, and record a received
 * entry (idempotent by operation id). Receiving over an approved family replaces it: the entry
 * returns to Received with the previous publication kept as history and the catalog is rewritten
 * without it, so dependent unexecuted preparations read as stale.
 */
export async function receiveArtifactFamily(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
  deps: ArtifactIntakeDeps = defaultDeps(db),
  now: string = new Date().toISOString(),
): Promise<{ entry: ArtifactIntakeEntry; duplicate: boolean }> {
  if (!can(actor.role, "manageAdmin"))
    throw new EditableLayerError("An Admin receives lease-artifact material.", 403);
  const input = ReceiveArtifactInputSchema.parse(raw);
  const version = await requireBoundPublication(input.publicationSource, deps);
  const content = await deps.readContent(version.contentRef);
  const classification = classifyUploadedForm({
    content,
    detectedMimeType: version.detectedMimeType,
    byteSize: version.contentByteSize,
    providerTemplateRef: input.providerBindings?.dotloopTemplateRef ?? null,
  });
  if (classification.contentHash !== input.publicationSource.contentHash)
    throw new EditableLayerError("The publication content changed during readback.", 409);
  const requestHash = hashExecutionPreview({
    actorUid: actor.uid,
    action: "artifact_received",
    kind: input.kind,
    publicationSource: input.publicationSource,
    providerBindings: input.providerBindings ?? null,
  });
  const ref = entryRef(db, input.kind);
  const audit = db.collection(ARTIFACT_INTAKE_ACTIVITY_COLLECTION).doc(input.operationId);
  return db.runTransaction(async (transaction) => {
    const [{ manifest }, previous] = await Promise.all([
      readManifestIn((docRef) => transaction.get(docRef), db),
      transaction.get(audit),
    ]);
    const existing = manifest.entries[input.kind];
    if (previous.exists) {
      if (previous.data()?.request_hash !== requestHash)
        throw new EditableLayerError(
          "This receipt changed since it was first sent. Reload and submit it again.",
          409,
        );
      if (!existing)
        throw new EditableLayerError(
          "The earlier receipt is not readable. Reload before submitting again.",
          409,
        );
      return { entry: existing, duplicate: true };
    }
    for (const [kind, entry] of Object.entries(manifest.entries))
      if (
        kind !== input.kind &&
        entry?.publication?.contentHash === input.publicationSource.contentHash
      )
        throw new EditableLayerError(
          `This content is already received as ${kind}; one file cannot cover two families without a reviewed copy per family.`,
          409,
        );
    const entry: ArtifactIntakeEntry = {
      id: input.kind,
      kind: input.kind,
      state: "received",
      revision: (existing?.revision ?? 0) + 1,
      publication: input.publicationSource,
      file: {
        fileName: version.fileName.slice(0, 200),
        detectedMimeType: version.detectedMimeType.slice(0, 120),
        byteSize: version.contentByteSize,
      },
      classification,
      ...(input.providerBindings ? { providerBindings: input.providerBindings } : {}),
      received_at: now,
      received_by_uid: actor.uid,
      ...(existing?.state === "approved" && existing.publication
        ? { supersedes: existing.publication.reference }
        : existing?.supersedes
          ? { supersedes: existing.supersedes }
          : {}),
      updated_at: now,
    };
    transaction.set(ref, stored(entry));
    if (existing?.state === "approved")
      writeCatalog(
        transaction,
        db,
        { ...manifest, entries: { ...manifest.entries, [input.kind]: entry } },
        { approvedByUid: actor.uid, approvedAt: now },
      );
    transaction.create(audit, {
      action: "artifact_received",
      actor_uid: actor.uid,
      created_at: now,
      kind: input.kind,
      publication: input.publicationSource.reference,
      content_hash: input.publicationSource.contentHash,
      format: classification.format,
      request_hash: requestHash,
      revision: entry.revision,
      ...(entry.supersedes ? { supersedes: entry.supersedes } : {}),
    });
    return { entry, duplicate: false };
  });
}

/**
 * Record the reviewed field and signer map for a received family under a revision check. The map
 * must bind this entry's exact publication; a renamed required field (when the reviewer confirmed
 * the form's fields), a wrong signer role or a family mismatch refuses before anything is saved.
 * Recording over an approved family returns it to Reviewed and rewrites the catalog without it.
 */
export async function recordArtifactFieldMap(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<ArtifactIntakeEntry> {
  if (!can(actor.role, "manageAdmin"))
    throw new EditableLayerError("An Admin records lease-artifact mappings.", 403);
  const input = RecordArtifactFieldMapInputSchema.parse(raw);
  const ref = entryRef(db, input.kind);
  return db.runTransaction(async (transaction) => {
    const { manifest } = await readManifestIn((docRef) => transaction.get(docRef), db);
    const existing = manifest.entries[input.kind];
    if (!existing)
      throw new EditableLayerError("Receive the family's file before mapping it.", 409);
    if (existing.revision !== input.expectedRevision)
      throw new EditableLayerError(
        "This family changed since the page was loaded. Reload before recording the mapping.",
        409,
      );
    if (existing.state === "rejected")
      throw new EditableLayerError(
        "A rejected file cannot be mapped; receive a replacement.",
        409,
      );
    if (existing.classification?.format === "unsupported")
      throw new EditableLayerError(
        "An unsupported file cannot be mapped; receive a replacement.",
        409,
      );
    const validation = validateFieldMap(
      input.fieldMap,
      existing,
      input.detectedFieldIds ?? null,
    );
    if (!validation.ok)
      throw new EditableLayerError(
        `The mapping was refused: ${validation.issues.map((issue) => issue.message).join(" ")}`,
        400,
      );
    const entry: ArtifactIntakeEntry = {
      ...existing,
      state: "reviewed",
      revision: existing.revision + 1,
      fieldMap: input.fieldMap,
      mapHash: mapHashOf(input.fieldMap),
      reviewed_at: now,
      reviewed_by_uid: actor.uid,
      updated_at: now,
    };
    delete (entry as { decided_at?: string }).decided_at;
    delete (entry as { decided_by_uid?: string }).decided_by_uid;
    delete (entry as { decision_reason?: string }).decision_reason;
    transaction.set(ref, stored(entry));
    if (existing.state === "approved")
      writeCatalog(
        transaction,
        db,
        { ...manifest, entries: { ...manifest.entries, [input.kind]: entry } },
        { approvedByUid: actor.uid, approvedAt: now },
      );
    transaction.create(db.collection(ARTIFACT_INTAKE_ACTIVITY_COLLECTION).doc(uuidv7()), {
      action: "artifact_mapping_recorded",
      actor_uid: actor.uid,
      created_at: now,
      kind: input.kind,
      map_version: input.fieldMap.mapVersion,
      map_hash: entry.mapHash,
      revision: entry.revision,
    });
    return entry;
  });
}

/**
 * Approve or reject one reviewed family under a revision check (idempotent by operation id).
 * Approval re-verifies the publication binding, refuses an unsupported file or a missing map, marks
 * the family approved and rewrites the catalog from every approved family. Rejection never touches
 * the catalog.
 */
export async function decideArtifactFamily(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
  deps: ArtifactIntakeDeps = defaultDeps(db),
  now: string = new Date().toISOString(),
): Promise<{ entry: ArtifactIntakeEntry; duplicate: boolean }> {
  if (!can(actor.role, "approve"))
    throw new EditableLayerError(
      "An Approver or Admin decides lease-artifact material.",
      403,
    );
  const input = DecideArtifactFamilyInputSchema.parse(raw);
  const ref = entryRef(db, input.kind);
  const audit = db.collection(ARTIFACT_INTAKE_ACTIVITY_COLLECTION).doc(input.operationId);
  const requestHash = hashExecutionPreview({
    actorUid: actor.uid,
    action: `artifact_${input.decision}`,
    kind: input.kind,
    expectedRevision: input.expectedRevision,
    reason: input.reason,
  });
  const preflight = await ref.get();
  const current = preflight.exists ? parseEntry(input.kind, preflight.data()) : null;
  if (!current)
    throw new EditableLayerError("This family has no received material.", 404);
  if (input.decision === "approve" && current.publication && current.state === "reviewed")
    await requireBoundPublication(current.publication, deps);
  return db.runTransaction(async (transaction) => {
    const [{ manifest }, previous] = await Promise.all([
      readManifestIn((docRef) => transaction.get(docRef), db),
      transaction.get(audit),
    ]);
    const existing = manifest.entries[input.kind];
    if (!existing)
      throw new EditableLayerError("This family has no received material.", 404);
    if (previous.exists) {
      if (previous.data()?.request_hash !== requestHash)
        throw new EditableLayerError(
          "This decision changed since it was first sent. Reload and decide again.",
          409,
        );
      return { entry: existing, duplicate: true };
    }
    if (existing.revision !== input.expectedRevision)
      throw new EditableLayerError(
        "This family changed since the page was loaded. Reload to see its current state before deciding.",
        409,
      );
    if (input.decision === "approve") {
      if (existing.state !== "reviewed")
        throw new EditableLayerError(
          existing.state === "approved"
            ? "This family is already approved."
            : "Record the reviewed mapping before approving this family.",
          409,
        );
      if (!existing.fieldMap || !existing.publication)
        throw new EditableLayerError(
          "A reviewed mapping and a bound publication are required.",
          409,
        );
      if (existing.classification?.format === "unsupported")
        throw new EditableLayerError("An unsupported file cannot be approved.", 409);
    } else if (existing.state !== "received" && existing.state !== "reviewed")
      throw new EditableLayerError(
        `Only a received or reviewed family can be rejected; this one is ${existing.state}.`,
        409,
      );
    const entry: ArtifactIntakeEntry = {
      ...existing,
      state: input.decision === "approve" ? "approved" : "rejected",
      revision: existing.revision + 1,
      decided_at: now,
      decided_by_uid: actor.uid,
      decision_reason: input.reason,
      updated_at: now,
    };
    transaction.set(ref, stored(entry));
    let catalogVersion: string | null = null;
    if (input.decision === "approve")
      catalogVersion = writeCatalog(
        transaction,
        db,
        { ...manifest, entries: { ...manifest.entries, [input.kind]: entry } },
        { approvedByUid: actor.uid, approvedAt: now },
      ).catalog.catalogVersion;
    transaction.create(audit, {
      action: input.decision === "approve" ? "artifact_approved" : "artifact_rejected",
      actor_uid: actor.uid,
      created_at: now,
      kind: input.kind,
      reason: input.reason,
      request_hash: requestHash,
      revision: entry.revision,
      ...(catalogVersion ? { catalog_version: catalogVersion } : {}),
    });
    return { entry, duplicate: false };
  });
}
