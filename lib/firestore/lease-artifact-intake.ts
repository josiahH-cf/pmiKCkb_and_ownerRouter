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

import { createHash } from "node:crypto";
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
  type StaticPdfGeometry,
} from "@/lib/lease-documents/artifact-intake-contract";
import {
  catalogFromIntake,
  classifyUploadedForm,
  mapHashOf,
  validateFieldMap,
} from "@/lib/lease-documents/artifact-intake";
import { ApprovedLeaseCatalogSchema } from "@/lib/lease-documents/live-source-schema";
import {
  FamilyUseRecordSchema,
  resolveFamilyUse,
  type FamilyUseRecord,
} from "@/lib/lease-documents/family-use";
import { inspectAcroformPdf } from "@/lib/lease-documents/acroform-pdf";
import {
  inspectStaticPdf,
  validateStaticGeometry,
  type StaticInspection,
} from "@/lib/lease-documents/static-pdf";
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
/** S66: the Admin family-use record the catalog projection carries. */
export const FAMILY_USE_COLLECTION = "lease_artifact_family_use";
export const FAMILY_USE_DOC_ID = "current";

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

/** The manifest read inside a caller's transaction (S66 family-use writer). */
export function readManifestInTransaction(transaction: Transaction, db: Firestore) {
  return readManifestIn((docRef) => transaction.get(docRef), db);
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

/** S66: the current family-use record, read inside the caller's transaction. */
export async function readFamilyUseIn(
  transaction: Transaction,
  db: Firestore,
): Promise<FamilyUseRecord | null> {
  const snapshot = await transaction.get(
    db.collection(FAMILY_USE_COLLECTION).doc(FAMILY_USE_DOC_ID),
  );
  if (!snapshot.exists) return null;
  const parsed = FamilyUseRecordSchema.safeParse(snapshot.data());
  if (!parsed.success)
    throw new EditableLayerError(
      "The family-use record is unreadable; nothing was changed.",
      409,
    );
  return parsed.data;
}

export function writeCatalog(
  transaction: Transaction,
  db: Firestore,
  manifest: ArtifactIntakeManifest,
  meta: { approvedByUid: string; approvedAt: string },
  familyUse: FamilyUseRecord | null,
) {
  const record = ApprovedLeaseCatalogSchema.parse(
    catalogFromIntake(manifest, meta, resolveFamilyUse(familyUse, meta.approvedAt)),
  );
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
  let classification = classifyUploadedForm({
    content,
    detectedMimeType: version.detectedMimeType,
    byteSize: version.contentByteSize,
    providerTemplateRef: input.providerBindings?.dotloopTemplateRef ?? null,
  });
  // Token scanning is preliminary only. Actual parsed inventory is the filling authority.
  try {
    if (
      version.detectedMimeType !== "application/pdf" ||
      version.contentByteSize !== content.length
    )
      throw new Error("PDF content required");
    const pdfFields = await inspectAcroformPdf(content);
    classification = {
      ...classification,
      pdfFields,
      hasAcroForm: pdfFields.length > 0,
      format: pdfFields.length
        ? "fillable_pdf"
        : input.providerBindings?.dotloopTemplateRef
          ? "provider_native"
          : "static_pdf",
      reasons: [
        pdfFields.length
          ? "Parsed form fields are available for reviewed AcroForm filling."
          : "No form fields: reviewed regions are required for filling. Until then a person completes it in Dotloop.",
      ],
    };
  } catch {
    classification = {
      ...classification,
      format: "unsupported",
      reasons: [
        "The actual PDF structure is invalid or outside the bounded safe filling/manual-handoff format.",
      ],
    };
  }
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
    const [{ manifest }, previous, familyUse] = await Promise.all([
      readManifestIn((docRef) => transaction.get(docRef), db),
      transaction.get(audit),
      readFamilyUseIn(transaction, db),
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
        familyUse,
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
  deps: ArtifactIntakeDeps = defaultDeps(db),
): Promise<ArtifactIntakeEntry> {
  if (!can(actor.role, "manageAdmin"))
    throw new EditableLayerError("An Admin records lease-artifact mappings.", 403);
  const input = RecordArtifactFieldMapInputSchema.parse(raw);
  const ref = entryRef(db, input.kind);
  // S130: region geometry is checked against the family's exact original bytes before anything is
  // saved; the transaction then refuses if that original changed in between.
  const checkedStaticHash = input.fieldMap.static
    ? await checkStaticGeometry(input.kind, input.fieldMap.static, db, deps)
    : null;
  return db.runTransaction(async (transaction) => {
    const [{ manifest }, familyUse] = await Promise.all([
      readManifestIn((docRef) => transaction.get(docRef), db),
      readFamilyUseIn(transaction, db),
    ]);
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
    const format = existing.classification?.format;
    if (input.fieldMap.static && format !== "static_pdf")
      throw new EditableLayerError(
        "Region geometry applies only to a static PDF. Map a fillable PDF by its exact field names.",
        400,
      );
    if (input.fieldMap.unchangedAttachment && format !== "static_pdf")
      throw new EditableLayerError(
        "Only a static PDF with no variable values can be recorded as an unchanged approved attachment.",
        400,
      );
    if (
      checkedStaticHash !== null &&
      existing.publication?.contentHash !== checkedStaticHash
    )
      throw new EditableLayerError(
        "This family's file changed while its regions were checked. Reload and record the mapping again.",
        409,
      );
    const validation = validateFieldMap(
      input.fieldMap,
      existing,
      format === "fillable_pdf"
        ? (existing
            .classification!.pdfFields?.filter(
              (field) => field.type !== "signature" && field.type !== "unsupported",
            )
            .map((field) => field.name) ?? [])
        : input.fieldMap.static
          ? null
          : (input.detectedFieldIds ?? null),
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
        familyUse,
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

/** S130: the exact received original of a family, read back and checked against its hash. */
async function readReceivedOriginal(
  kind: ArtifactIntakeEntry["kind"],
  db: Firestore,
  deps: ArtifactIntakeDeps,
): Promise<{ entry: ArtifactIntakeEntry; content: Uint8Array; contentHash: string }> {
  const { manifest } = await readManifestIn((docRef) => docRef.get(), db);
  const entry = manifest.entries[kind];
  const binding = entry?.publication;
  if (!entry || !binding)
    throw new EditableLayerError("Receive the family's file before reviewing it.", 409);
  let content: Uint8Array;
  try {
    const version = await deps.readPublication(
      binding.reference.slice("publication:".length),
    );
    content = await deps.readContent(version.contentRef);
  } catch {
    throw new EditableLayerError("The family's original could not be read.", 409);
  }
  if (createHash("sha256").update(content).digest("hex") !== binding.contentHash)
    throw new EditableLayerError(
      "The family's original no longer matches its received hash.",
      409,
    );
  return { entry, content, contentHash: binding.contentHash };
}

/** S130: validate reviewed regions against the exact received original; returns its hash. */
async function checkStaticGeometry(
  kind: ArtifactIntakeEntry["kind"],
  geometry: StaticPdfGeometry,
  db: Firestore,
  deps: ArtifactIntakeDeps,
): Promise<string> {
  const { content, contentHash } = await readReceivedOriginal(kind, db, deps);
  const issues = await validateStaticGeometry(content, geometry).catch(
    (error: unknown) => [
      error instanceof Error
        ? error.message
        : "The original could not be read for region review.",
    ],
  );
  if (issues.length)
    throw new EditableLayerError(`The regions were refused: ${issues.join(" ")}`, 400);
  return contentHash;
}

/**
 * S130: an Admin reads a received static original's page geometry and text positions to review its
 * regions. Read-only; the approved form's own text is shown to the Admin and nothing is saved.
 */
export async function inspectStaticArtifact(
  actor: AuthenticatedUser,
  kind: ArtifactIntakeEntry["kind"],
  db: Firestore = getAdminFirestore(),
  deps: ArtifactIntakeDeps = defaultDeps(db),
): Promise<StaticInspection> {
  if (!can(actor.role, "manageAdmin"))
    throw new EditableLayerError("An Admin reviews lease-artifact regions.", 403);
  const { entry, content } = await readReceivedOriginal(kind, db, deps);
  if (entry.classification?.format !== "static_pdf")
    throw new EditableLayerError(
      "Only a received static PDF has page regions to review.",
      409,
    );
  return inspectStaticPdf(content);
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
    const [{ manifest }, previous, familyUse] = await Promise.all([
      readManifestIn((docRef) => transaction.get(docRef), db),
      transaction.get(audit),
      readFamilyUseIn(transaction, db),
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
        familyUse,
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
