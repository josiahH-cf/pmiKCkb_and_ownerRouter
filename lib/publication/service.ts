import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import type {
  PublicationEnvelope,
  PublicationFailureCode,
  PublicationPolicyRecord,
  PublicationResourceRecord,
  PublicationScanner,
  PublicationVersionRecord,
} from "@/lib/publication/types";
import {
  PublicationValidationError,
  validatePublication,
} from "@/lib/publication/validation";
import { canAccessSpaceId } from "@/lib/space-scope-resources";

export const PUBLICATION_COLLECTIONS = {
  audit: "publication_audit",
  resources: "publication_resources",
  versions: "publication_versions",
} as const;

export interface PublicationCommitContext {
  contentBase64: string;
  transaction: Transaction;
  versionId: string;
  versionNumber: number;
}

export async function publishTrustedContent(
  actor: AuthenticatedUser,
  policy: PublicationPolicyRecord,
  envelope: PublicationEnvelope,
  scanner: PublicationScanner,
  options: {
    db?: Firestore;
    extendCommit?: (context: PublicationCommitContext) => void;
    registeredProcessActionKeys?: ReadonlySet<string>;
  } = {},
): Promise<PublicationVersionRecord> {
  const db = options.db ?? getAdminFirestore();
  let validated: Awaited<ReturnType<typeof validatePublication>>;

  try {
    validated = await validatePublication(actor, policy, envelope, scanner, {
      registeredProcessActionKeys: options.registeredProcessActionKeys,
    });
  } catch (error) {
    if (error instanceof PublicationValidationError) {
      await writeFailureAudit(db, actor, policy.id, envelope.metadata, error.code);
    }
    throw error;
  }

  const { metadata } = envelope;
  const versionId = uuidv7();
  const contentBase64 = Buffer.from(validated.content).toString("base64");
  let versionNumber = 0;

  await db.runTransaction(async (transaction) => {
    const versionsSnapshot = await transaction.get(
      db
        .collection(PUBLICATION_COLLECTIONS.versions)
        .where("resourceId", "==", metadata.resourceId),
    );
    versionNumber =
      versionsSnapshot.docs.reduce(
        (highest, doc) => Math.max(highest, Number(doc.data().versionNumber) || 0),
        0,
      ) + 1;

    const version = versionRecord({
      actorUid: actor.uid,
      contentBase64,
      contentHash: validated.result.contentHash,
      metadata: { ...metadata, detectedMimeType: validated.result.detectedMimeType },
      policyId: policy.id,
      sensitivity: validated.result.sensitivity,
      versionId,
      versionNumber,
    });

    transaction.set(
      db.collection(PUBLICATION_COLLECTIONS.versions).doc(versionId),
      version,
    );
    transaction.set(
      db.collection(PUBLICATION_COLLECTIONS.resources).doc(metadata.resourceId),
      {
        id: metadata.resourceId,
        activeVersionId: versionId,
        policyId: policy.id,
        resourceType: metadata.resourceType,
        spaceId: metadata.spaceId,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: actor.uid,
      },
    );
    transaction.set(db.collection(PUBLICATION_COLLECTIONS.audit).doc(uuidv7()), {
      actorUid: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
      eventType: "published",
      policyId: policy.id,
      resourceId: metadata.resourceId,
      spaceId: metadata.spaceId,
      versionId,
      versionNumber,
    });
    options.extendCommit?.({ contentBase64, transaction, versionId, versionNumber });
  });

  return getPublicationVersion(versionId, db);
}

export async function rollbackTrustedPublication(
  actor: AuthenticatedUser,
  resourceId: string,
  targetVersionId: string,
  reason: string,
  db: Firestore = getAdminFirestore(),
): Promise<PublicationVersionRecord> {
  if (!can(actor.role, "edit") || reason.trim().length < 8) {
    throw new EditableLayerError(
      can(actor.role, "edit")
        ? "Rollback requires a plain-English reason."
        : "This user cannot roll back publication content.",
      can(actor.role, "edit") ? 400 : 403,
    );
  }

  const versionId = uuidv7();
  let versionNumber = 0;

  await db.runTransaction(async (transaction) => {
    const resourceSnapshot = await transaction.get(
      db.collection(PUBLICATION_COLLECTIONS.resources).doc(resourceId),
    );
    const resource = readRequired<PublicationResourceRecord>(
      resourceSnapshot.id,
      resourceSnapshot.data(),
      "Publication resource was not found.",
    );
    if (!canAccessSpaceId(actor, resource.spaceId)) {
      throw new EditableLayerError("This user cannot roll back this Space.", 403);
    }

    const targetSnapshot = await transaction.get(
      db.collection(PUBLICATION_COLLECTIONS.versions).doc(targetVersionId),
    );
    const target = readRequired<PublicationVersionRecord>(
      targetSnapshot.id,
      targetSnapshot.data(),
      "Publication version was not found.",
    );
    if (target.resourceId !== resourceId || !target.validated) {
      throw new EditableLayerError(
        "Rollback target is not a validated resource version.",
        409,
      );
    }

    const versionsSnapshot = await transaction.get(
      db
        .collection(PUBLICATION_COLLECTIONS.versions)
        .where("resourceId", "==", resourceId),
    );
    versionNumber =
      versionsSnapshot.docs.reduce(
        (highest, doc) => Math.max(highest, Number(doc.data().versionNumber) || 0),
        0,
      ) + 1;

    transaction.set(db.collection(PUBLICATION_COLLECTIONS.versions).doc(versionId), {
      ...withoutIdAndCreatedAt(target),
      id: versionId,
      createdAt: FieldValue.serverTimestamp(),
      createdByUid: actor.uid,
      rollbackOfVersionId: targetVersionId,
      versionNumber,
    });
    transaction.update(db.collection(PUBLICATION_COLLECTIONS.resources).doc(resourceId), {
      activeVersionId: versionId,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: actor.uid,
    });
    transaction.set(db.collection(PUBLICATION_COLLECTIONS.audit).doc(uuidv7()), {
      actorUid: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
      eventType: "rolled_back",
      policyId: resource.policyId,
      reason,
      resourceId,
      spaceId: resource.spaceId,
      targetVersionId,
      versionId,
      versionNumber,
    });
  });

  return getPublicationVersion(versionId, db);
}

export async function listActiveTrustedPublications(
  actor: AuthenticatedUser,
  spaceId: string,
  db: Firestore = getAdminFirestore(),
): Promise<PublicationVersionRecord[]> {
  if (!can(actor.role, "read") || !canAccessSpaceId(actor, spaceId)) {
    throw new EditableLayerError("This user cannot read this Space.", 403);
  }
  const resourcesSnapshot = await db
    .collection(PUBLICATION_COLLECTIONS.resources)
    .where("spaceId", "==", spaceId)
    .get();
  const versions = await Promise.all(
    resourcesSnapshot.docs.map(async (doc) => {
      const resource = readRequired<PublicationResourceRecord>(
        doc.id,
        doc.data(),
        "Publication resource was not found.",
      );
      return getPublicationVersion(resource.activeVersionId, db);
    }),
  );
  return versions.filter((version) => version.validated);
}

export async function getPublicationVersion(
  versionId: string,
  db: Firestore = getAdminFirestore(),
): Promise<PublicationVersionRecord> {
  const snapshot = await db
    .collection(PUBLICATION_COLLECTIONS.versions)
    .doc(versionId)
    .get();
  return readRequired<PublicationVersionRecord>(
    snapshot.id,
    snapshot.data(),
    "Publication version was not found.",
  );
}

async function writeFailureAudit(
  db: Firestore,
  actor: AuthenticatedUser,
  policyId: string,
  metadata: PublicationEnvelope["metadata"],
  code: PublicationFailureCode,
) {
  await db.collection(PUBLICATION_COLLECTIONS.audit).doc(uuidv7()).set({
    actorUid: actor.uid,
    code,
    createdAt: FieldValue.serverTimestamp(),
    eventType: "rejected",
    policyId,
    resourceId: metadata.resourceId,
    spaceId: metadata.spaceId,
  });
}

function versionRecord(input: {
  actorUid: string;
  contentBase64: string;
  contentHash: string;
  metadata: PublicationEnvelope["metadata"];
  policyId: string;
  sensitivity: PublicationVersionRecord["sensitivity"];
  versionId: string;
  versionNumber: number;
}) {
  const { metadata } = input;
  return stripUndefined({
    id: input.versionId,
    citationLabel: metadata.citationLabel,
    contentBase64: input.contentBase64,
    contentHash: input.contentHash,
    createdAt: FieldValue.serverTimestamp(),
    createdByUid: input.actorUid,
    detectedMimeType: metadata.detectedMimeType,
    fileName: metadata.fileName,
    path: metadata.path,
    policyId: input.policyId,
    resourceId: metadata.resourceId,
    resourceType: metadata.resourceType,
    sensitivity: input.sensitivity,
    sourceState: metadata.sourceState,
    spaceId: metadata.spaceId,
    validated: true,
    versionNumber: input.versionNumber,
  });
}

function withoutIdAndCreatedAt(record: PublicationVersionRecord) {
  const copy: Partial<PublicationVersionRecord> = { ...record };
  delete copy.createdAt;
  delete copy.id;
  delete copy.rollbackOfVersionId;
  return copy;
}

function readRequired<T>(
  id: string,
  data: Record<string, unknown> | undefined,
  message: string,
): T {
  if (!data) throw new EditableLayerError(message, 404);
  return normalizeFirestoreValue({ id, ...data }) as T;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") return toDate.call(value).toISOString();
  }
  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeFirestoreValue(child)]),
    );
  }
  return value;
}

function stripUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
