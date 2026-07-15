import { createHash } from "node:crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import type {
  PublicationContentReference,
  PublicationEnvelope,
  PublicationFailureCode,
  PublicationPolicyRecord,
  PublicationResourceRecord,
  PublicationScanner,
  PublicationSensitivity,
  PublicationVersionRecord,
} from "@/lib/publication/types";
import { MAX_PUBLICATION_CONTENT_BYTES } from "@/lib/publication/types";
import {
  assertPublicationContentReference,
  FirestorePublicationContentStore,
  PUBLICATION_CONTENT_CHUNK_COLLECTION,
  type PublicationContentStore,
} from "@/lib/publication/content";
import {
  PublicationValidationError,
  validatePublication,
} from "@/lib/publication/validation";
import { PUBLICATION_POLICY_COLLECTION } from "@/lib/publication/policy";
import { canAccessSpaceId } from "@/lib/space-scope-resources";

export const PUBLICATION_COLLECTIONS = {
  audit: "publication_audit",
  contentChunks: PUBLICATION_CONTENT_CHUNK_COLLECTION,
  resources: "publication_resources",
  versions: "publication_versions",
} as const;

export interface PublicationCommitContext {
  contentRef: PublicationContentReference;
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
    contentStore?: PublicationContentStore;
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
  const contentStore = options.contentStore ?? new FirestorePublicationContentStore(db);
  const contentRef = await contentStore.put({
    content: validated.content,
    contentHash: validated.result.contentHash,
    contentId: versionId,
  });
  let versionNumber = 0;

  try {
    assertPublicationContentReference(contentRef, {
      byteSize: validated.content.byteLength,
      contentHash: validated.result.contentHash,
      contentId: versionId,
    });
    await db.runTransaction(async (transaction) => {
      const policySnapshot = await transaction.get(
        db.collection(PUBLICATION_POLICY_COLLECTION).doc(policy.id),
      );
      assertPublicationPolicyUnchanged(policy, policySnapshot.data());

      const resourceRef = db
        .collection(PUBLICATION_COLLECTIONS.resources)
        .doc(metadata.resourceId);
      const resourceSnapshot = await transaction.get(resourceRef);
      const resource = resourceSnapshot.data()
        ? readRequired<PublicationResourceRecord>(
            resourceSnapshot.id,
            resourceSnapshot.data(),
            "Publication resource was not found.",
          )
        : undefined;
      if (resource) assertResourceIdentity(resource, metadata, policy.id);
      versionNumber =
        (resource ? await readLastVersionNumber(transaction, db, resource) : 0) + 1;

      const version = versionRecord({
        actorUid: actor.uid,
        contentHash: validated.result.contentHash,
        contentRef,
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
      transaction.set(resourceRef, {
        id: metadata.resourceId,
        activeVersionId: versionId,
        lastVersionNumber: versionNumber,
        policyId: policy.id,
        resourceType: metadata.resourceType,
        spaceId: metadata.spaceId,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: actor.uid,
      });
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
      options.extendCommit?.({ contentRef, transaction, versionId, versionNumber });
    });
  } catch (error) {
    // Chunks are written before the metadata transaction because the validated
    // payload may exceed Firestore's transaction request limit. Never leave a
    // failed transaction's content reachable; cleanup is best effort so the
    // original failure remains the surfaced error.
    await contentStore.delete(contentRef).catch(() => undefined);
    throw error;
  }

  return getPublicationVersion(versionId, db);
}

export async function rollbackTrustedPublication(
  actor: AuthenticatedUser,
  resourceId: string,
  targetVersionId: string,
  reason: string,
  db: Firestore = getAdminFirestore(),
  options: { contentStore?: PublicationContentStore } = {},
): Promise<PublicationVersionRecord> {
  if (!can(actor.role, "edit") || reason.trim().length < 8) {
    throw new EditableLayerError(
      can(actor.role, "edit")
        ? "Rollback requires a plain-English reason."
        : "This user cannot roll back publication content.",
      can(actor.role, "edit") ? 400 : 403,
    );
  }

  const contentStore = options.contentStore ?? new FirestorePublicationContentStore(db);
  const resourceRef = db.collection(PUBLICATION_COLLECTIONS.resources).doc(resourceId);
  const targetRef = db.collection(PUBLICATION_COLLECTIONS.versions).doc(targetVersionId);
  const preflightResourceSnapshot = await resourceRef.get();
  const preflightResource = readRequired<PublicationResourceRecord>(
    preflightResourceSnapshot.id,
    preflightResourceSnapshot.data(),
    "Publication resource was not found.",
  );
  if (!canAccessSpaceId(actor, preflightResource.spaceId)) {
    throw new EditableLayerError("This user cannot roll back this Space.", 403);
  }
  const preflightTargetSnapshot = await targetRef.get();
  const preflightTarget = readRequired<PublicationVersionRecord>(
    preflightTargetSnapshot.id,
    preflightTargetSnapshot.data(),
    "Publication version was not found.",
  );
  assertRollbackTarget(preflightTarget, resourceId);
  await assertRollbackContentAvailable(preflightTarget, contentStore);

  const versionId = uuidv7();
  let versionNumber = 0;

  await db.runTransaction(async (transaction) => {
    const resourceSnapshot = await transaction.get(resourceRef);
    const resource = readRequired<PublicationResourceRecord>(
      resourceSnapshot.id,
      resourceSnapshot.data(),
      "Publication resource was not found.",
    );
    if (!canAccessSpaceId(actor, resource.spaceId)) {
      throw new EditableLayerError("This user cannot roll back this Space.", 403);
    }

    const targetSnapshot = await transaction.get(targetRef);
    const target = readRequired<PublicationVersionRecord>(
      targetSnapshot.id,
      targetSnapshot.data(),
      "Publication version was not found.",
    );
    assertRollbackTarget(target, resourceId);
    if (!samePublicationContent(target, preflightTarget)) {
      throw new EditableLayerError("Rollback target changed during verification.", 409);
    }
    const policySnapshot = await transaction.get(
      db.collection(PUBLICATION_POLICY_COLLECTION).doc(resource.policyId),
    );
    const currentPolicy = readRequired<PublicationPolicyRecord>(
      policySnapshot.id,
      policySnapshot.data(),
      "Publication policy was not found.",
    );
    assertRollbackAllowedByCurrentPolicy(actor, currentPolicy, resource, target);
    versionNumber = (await readLastVersionNumber(transaction, db, resource)) + 1;

    transaction.set(db.collection(PUBLICATION_COLLECTIONS.versions).doc(versionId), {
      ...withoutIdAndCreatedAt(target),
      id: versionId,
      createdAt: FieldValue.serverTimestamp(),
      createdByUid: actor.uid,
      rollbackOfVersionId: targetVersionId,
      versionNumber,
    });
    transaction.update(resourceRef, {
      activeVersionId: versionId,
      lastVersionNumber: versionNumber,
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
  contentHash: string;
  contentRef: PublicationContentReference;
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
    connectorId: metadata.connectorId,
    contentByteSize: input.contentRef.byteSize,
    contentHash: input.contentHash,
    contentRef: input.contentRef,
    createdAt: FieldValue.serverTimestamp(),
    createdByUid: input.actorUid,
    detectedMimeType: metadata.detectedMimeType,
    fileName: metadata.fileName,
    path: metadata.path,
    policyId: input.policyId,
    resourceId: metadata.resourceId,
    resourceType: metadata.resourceType,
    rootId: metadata.rootId,
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

async function readLastVersionNumber(
  transaction: Transaction,
  db: Firestore,
  resource: PublicationResourceRecord,
) {
  if (
    Number.isSafeInteger(resource.lastVersionNumber) &&
    resource.lastVersionNumber >= 1
  ) {
    return resource.lastVersionNumber;
  }

  // Backward-compatible fallback for resources written before the guarded sequence field.
  const activeSnapshot = await transaction.get(
    db.collection(PUBLICATION_COLLECTIONS.versions).doc(resource.activeVersionId),
  );
  const active = readRequired<PublicationVersionRecord>(
    activeSnapshot.id,
    activeSnapshot.data(),
    "Active publication version was not found.",
  );
  if (!Number.isSafeInteger(active.versionNumber) || active.versionNumber < 1) {
    throw new EditableLayerError("Publication version sequence is invalid.", 409);
  }
  return active.versionNumber;
}

function assertPublicationPolicyUnchanged(
  expected: PublicationPolicyRecord,
  rawCurrent: Record<string, unknown> | undefined,
) {
  const current = readRequired<PublicationPolicyRecord>(
    expected.id,
    rawCurrent,
    "Publication policy was not found.",
  );
  if (stableJson(current) !== stableJson(expected)) {
    throw new EditableLayerError(
      "Publication policy changed during validation; retry with the current policy.",
      409,
    );
  }
}

function assertResourceIdentity(
  resource: PublicationResourceRecord,
  metadata: PublicationEnvelope["metadata"],
  policyId: string,
) {
  if (
    resource.policyId !== policyId ||
    resource.resourceType !== metadata.resourceType ||
    resource.spaceId !== metadata.spaceId
  ) {
    throw new EditableLayerError(
      "Publication resource identity conflicts with the existing Active resource.",
      409,
    );
  }
}

function assertRollbackTarget(target: PublicationVersionRecord, resourceId: string) {
  if (target.resourceId !== resourceId || !target.validated) {
    throw new EditableLayerError(
      "Rollback target is not a validated resource version.",
      409,
    );
  }
  try {
    assertPublicationContentReference(target.contentRef, {
      byteSize: target.contentByteSize,
      contentHash: target.contentHash,
    });
  } catch {
    throw new EditableLayerError("Rollback target content is unavailable.", 409);
  }
}

function assertRollbackAllowedByCurrentPolicy(
  actor: AuthenticatedUser,
  policy: PublicationPolicyRecord,
  resource: PublicationResourceRecord,
  target: PublicationVersionRecord,
) {
  const typeRule = policy.allowedTypes.find(
    (item) => item.extension === extensionOf(target.fileName),
  );
  const processDefinitionAllowed =
    target.resourceType === "process_definition" &&
    target.detectedMimeType === "application/json" &&
    target.contentByteSize <= 2 * 1024 * 1024;
  const fileTypeAllowed =
    target.resourceType !== "process_definition" &&
    typeRule !== undefined &&
    typeRule.mimeTypes.includes(target.detectedMimeType) &&
    target.contentByteSize <= typeRule.maxBytes;

  if (
    !can(actor.role, "edit") ||
    !canAccessSpaceId(actor, target.spaceId) ||
    !policy.enabled ||
    policy.id !== resource.policyId ||
    target.policyId !== policy.id ||
    target.spaceId !== resource.spaceId ||
    target.resourceType !== resource.resourceType ||
    !policy.allowedSpaces.includes(target.spaceId) ||
    policy.connectorId !== target.connectorId ||
    policy.rootId !== target.rootId ||
    !isSafeRelativePath(target.path) ||
    !target.sourceState ||
    !target.citationLabel?.trim() ||
    !Number.isSafeInteger(target.contentByteSize) ||
    target.contentByteSize < 0 ||
    target.contentByteSize > MAX_PUBLICATION_CONTENT_BYTES ||
    sensitivityRank(target.sensitivity) > sensitivityRank(policy.sensitivityCeiling) ||
    (!processDefinitionAllowed && !fileTypeAllowed)
  ) {
    throw new EditableLayerError(
      "Rollback target is no longer allowed by the current publication policy.",
      409,
    );
  }
}

async function assertRollbackContentAvailable(
  target: PublicationVersionRecord,
  contentStore: PublicationContentStore,
) {
  try {
    const content = await contentStore.read(target.contentRef);
    const contentHash = createHash("sha256").update(content).digest("hex");
    if (
      content.byteLength !== target.contentByteSize ||
      contentHash !== target.contentHash
    ) {
      throw new Error("Publication content integrity mismatch.");
    }
  } catch {
    throw new EditableLayerError("Rollback target content is unavailable.", 409);
  }
}

function samePublicationContent(
  left: PublicationVersionRecord,
  right: PublicationVersionRecord,
) {
  return (
    left.contentByteSize === right.contentByteSize &&
    left.contentHash === right.contentHash &&
    stableJson(left.contentRef) === stableJson(right.contentRef)
  );
}

function extensionOf(fileName: string) {
  return /(?:^|\/)([^/]+?)(\.[^.\/]+)$/.exec(fileName.toLowerCase())?.[2] ?? "";
}

function isSafeRelativePath(value: string) {
  const normalized = value.trim().replace(/\\/g, "/");
  return (
    normalized.length > 0 &&
    !normalized.startsWith("/") &&
    !/^[a-z]:/i.test(normalized) &&
    !normalized.includes("\0") &&
    normalized.split("/").every((segment) => segment !== ".." && segment !== "")
  );
}

function sensitivityRank(value: PublicationSensitivity) {
  return { High: 3, Low: 1, Medium: 2 }[value];
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
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
