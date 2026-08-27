import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  OperationalPageDefinitionSchema,
  operationalPageIdentity,
  operationalPagePreviewHash,
  type OperationalPageDefinition,
} from "@/lib/operational-pages/schema";
import { assertSpaceIdAccess } from "@/lib/space-scope-resources";

export const OPERATIONAL_PAGE_COLLECTIONS = {
  heads: "operational_page_heads",
  versions: "operational_page_versions",
  approvals: "operational_page_approvals",
  audit: "operational_page_audit",
  receipts: "operational_page_receipts",
} as const;

export interface OperationalPageVersion {
  id: string;
  pageId: string;
  versionNumber: number;
  definition: OperationalPageDefinition;
  previewHash: string;
  state: "draft";
  createdByUid: string;
  createdAt: string;
}

export interface OperationalPageHead {
  id: string;
  spaceId: string;
  slug: string;
  title: string;
  latestVersionId: string;
  latestVersionNumber: number;
  publishedVersionId: string | null;
  previousPublishedVersionId: string | null;
  publicationSequence: number;
  lastReceiptId: string | null;
  updatedAt: string;
}

export interface OperationalPageApproval {
  versionId: string;
  pageId: string;
  previewHash: string;
  approvedByUid: string;
  approvedAt: string;
}

export interface OperationalPageReceipt {
  id: string;
  operation: "publish" | "rollback";
  pageId: string;
  fromVersionId: string | null;
  toVersionId: string;
  previewHash: string;
  actorUid: string;
  sequence: number;
  createdAt: string;
  duplicate: boolean;
}

function assertAdmin(actor: AuthenticatedUser): void {
  if (!can(actor.role, "manageAdmin")) {
    throw new EditableLayerError(
      "Only Admins can build or publish operational pages.",
      403,
    );
  }
}

export async function createOperationalPageDraft(
  actor: AuthenticatedUser,
  input: { definition: OperationalPageDefinition; reason: string },
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<OperationalPageVersion> {
  assertAdmin(actor);
  const definition = OperationalPageDefinitionSchema.parse(input.definition);
  const reason = input.reason.trim();
  if (!reason) throw new EditableLayerError("A draft reason is required.", 400);
  const pageId = operationalPageIdentity(definition);
  const versionId = uuidv7();
  const headRef = db.collection(OPERATIONAL_PAGE_COLLECTIONS.heads).doc(pageId);
  const versionRef = db.collection(OPERATIONAL_PAGE_COLLECTIONS.versions).doc(versionId);

  const version = await db.runTransaction(async (transaction) => {
    const headSnapshot = await transaction.get(headRef);
    const current = headSnapshot.exists ? headSnapshot.data() : undefined;
    const versionNumber = Number(current?.latest_version_number ?? 0) + 1;
    const stored = {
      id: versionId,
      page_id: pageId,
      version_number: versionNumber,
      definition,
      preview_hash: operationalPagePreviewHash(definition),
      state: "draft",
      created_by_uid: actor.uid,
      created_at: now,
    };
    transaction.create(versionRef, stored);
    transaction.set(headRef, {
      id: pageId,
      space_id: definition.spaceId,
      slug: definition.slug,
      title: definition.title,
      latest_version_id: versionId,
      latest_version_number: versionNumber,
      published_version_id:
        typeof current?.published_version_id === "string"
          ? current.published_version_id
          : null,
      previous_published_version_id:
        typeof current?.previous_published_version_id === "string"
          ? current.previous_published_version_id
          : null,
      publication_sequence: Number(current?.publication_sequence ?? 0),
      last_receipt_id:
        typeof current?.last_receipt_id === "string" ? current.last_receipt_id : null,
      updated_at: now,
    });
    transaction.create(db.collection(OPERATIONAL_PAGE_COLLECTIONS.audit).doc(uuidv7()), {
      action: "draft_created",
      page_id: pageId,
      version_id: versionId,
      version_number: versionNumber,
      preview_hash: stored.preview_hash,
      reason_hash: createHash("sha256").update(reason, "utf8").digest("hex"),
      actor_uid: actor.uid,
      created_at: now,
    });
    return stored;
  });
  return toVersion(version);
}

export async function approveOperationalPageVersion(
  actor: AuthenticatedUser,
  input: { versionId: string; previewHash: string },
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<OperationalPageApproval & { duplicate: boolean }> {
  assertAdmin(actor);
  const versionRef = db
    .collection(OPERATIONAL_PAGE_COLLECTIONS.versions)
    .doc(input.versionId);
  const approvalRef = db
    .collection(OPERATIONAL_PAGE_COLLECTIONS.approvals)
    .doc(input.versionId);

  return db.runTransaction(async (transaction) => {
    const [versionSnapshot, approvalSnapshot] = await Promise.all([
      transaction.get(versionRef),
      transaction.get(approvalRef),
    ]);
    if (!versionSnapshot.exists) {
      throw new EditableLayerError("Operational page version was not found.", 404);
    }
    const version = toVersion(versionSnapshot.data());
    assertExactPreview(version, input.previewHash);
    if (approvalSnapshot.exists) {
      const approval = toApproval(approvalSnapshot.data());
      if (approval.previewHash !== input.previewHash) {
        throw new EditableLayerError(
          "The prior approval does not match this preview.",
          409,
        );
      }
      return { ...approval, duplicate: true };
    }
    const stored = {
      version_id: version.id,
      page_id: version.pageId,
      preview_hash: version.previewHash,
      approved_by_uid: actor.uid,
      approved_at: now,
    };
    transaction.create(approvalRef, stored);
    transaction.create(db.collection(OPERATIONAL_PAGE_COLLECTIONS.audit).doc(uuidv7()), {
      action: "version_approved",
      page_id: version.pageId,
      version_id: version.id,
      preview_hash: version.previewHash,
      actor_uid: actor.uid,
      created_at: now,
    });
    return { ...toApproval(stored), duplicate: false };
  });
}

export async function publishOperationalPageVersion(
  actor: AuthenticatedUser,
  input: { versionId: string; previewHash: string },
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<OperationalPageReceipt> {
  assertAdmin(actor);
  const versionRef = db
    .collection(OPERATIONAL_PAGE_COLLECTIONS.versions)
    .doc(input.versionId);
  const approvalRef = db
    .collection(OPERATIONAL_PAGE_COLLECTIONS.approvals)
    .doc(input.versionId);
  const versionSnapshot = await versionRef.get();
  if (!versionSnapshot.exists) {
    throw new EditableLayerError("Operational page version was not found.", 404);
  }
  const version = toVersion(versionSnapshot.data());
  assertExactPreview(version, input.previewHash);
  const headRef = db.collection(OPERATIONAL_PAGE_COLLECTIONS.heads).doc(version.pageId);

  const receipt = await db.runTransaction(async (transaction) => {
    const [headSnapshot, currentVersionSnapshot, currentApprovalSnapshot] =
      await Promise.all([
        transaction.get(headRef),
        transaction.get(versionRef),
        transaction.get(approvalRef),
      ]);
    if (!headSnapshot.exists || !currentVersionSnapshot.exists) {
      throw new EditableLayerError("Operational page draft is incomplete.", 409);
    }
    const currentVersion = toVersion(currentVersionSnapshot.data());
    assertExactPreview(currentVersion, input.previewHash);
    assertApproval(currentApprovalSnapshot.data(), currentVersion);
    const head = toHead(headSnapshot.data());
    if (head.publishedVersionId === currentVersion.id && head.lastReceiptId) {
      return duplicateReceipt(transaction, db, head.lastReceiptId);
    }
    const sequence = head.publicationSequence + 1;
    const receiptId = effectReceiptId(head.id, sequence, currentVersion.id);
    const stored = receiptRecord({
      id: receiptId,
      operation: "publish",
      pageId: head.id,
      fromVersionId: head.publishedVersionId,
      toVersionId: currentVersion.id,
      previewHash: currentVersion.previewHash,
      actorUid: actor.uid,
      sequence,
      createdAt: now,
    });
    transaction.set(headRef, {
      ...headRecord(head),
      title: currentVersion.definition.title,
      previous_published_version_id: head.publishedVersionId,
      published_version_id: currentVersion.id,
      publication_sequence: sequence,
      last_receipt_id: receiptId,
      updated_at: now,
    });
    transaction.create(
      db.collection(OPERATIONAL_PAGE_COLLECTIONS.receipts).doc(receiptId),
      stored,
    );
    transaction.create(db.collection(OPERATIONAL_PAGE_COLLECTIONS.audit).doc(uuidv7()), {
      action: "version_published",
      page_id: head.id,
      version_id: currentVersion.id,
      previous_version_id: head.publishedVersionId,
      receipt_id: receiptId,
      actor_uid: actor.uid,
      created_at: now,
    });
    return { ...toReceipt(stored), duplicate: false };
  });
  await assertPublishedReadback(db, receipt);
  return receipt;
}

export async function rollbackOperationalPage(
  actor: AuthenticatedUser,
  input: { pageId: string; targetVersionId: string; previewHash: string },
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<OperationalPageReceipt> {
  assertAdmin(actor);
  const headRef = db.collection(OPERATIONAL_PAGE_COLLECTIONS.heads).doc(input.pageId);
  const versionRef = db
    .collection(OPERATIONAL_PAGE_COLLECTIONS.versions)
    .doc(input.targetVersionId);
  const approvalRef = db
    .collection(OPERATIONAL_PAGE_COLLECTIONS.approvals)
    .doc(input.targetVersionId);

  const receipt = await db.runTransaction(async (transaction) => {
    const [headSnapshot, versionSnapshot, approvalSnapshot] = await Promise.all([
      transaction.get(headRef),
      transaction.get(versionRef),
      transaction.get(approvalRef),
    ]);
    if (!headSnapshot.exists || !versionSnapshot.exists) {
      throw new EditableLayerError("Rollback target was not found.", 404);
    }
    const head = toHead(headSnapshot.data());
    const target = toVersion(versionSnapshot.data());
    if (target.pageId !== head.id) {
      throw new EditableLayerError("Rollback target belongs to another page.", 409);
    }
    assertExactPreview(target, input.previewHash);
    assertApproval(approvalSnapshot.data(), target);
    if (!head.publishedVersionId) {
      throw new EditableLayerError(
        "The page has no published version to roll back.",
        409,
      );
    }
    if (head.publishedVersionId === target.id && head.lastReceiptId) {
      return duplicateReceipt(transaction, db, head.lastReceiptId);
    }
    const sequence = head.publicationSequence + 1;
    const receiptId = effectReceiptId(head.id, sequence, target.id);
    const stored = receiptRecord({
      id: receiptId,
      operation: "rollback",
      pageId: head.id,
      fromVersionId: head.publishedVersionId,
      toVersionId: target.id,
      previewHash: target.previewHash,
      actorUid: actor.uid,
      sequence,
      createdAt: now,
    });
    transaction.set(headRef, {
      ...headRecord(head),
      title: target.definition.title,
      previous_published_version_id: head.publishedVersionId,
      published_version_id: target.id,
      publication_sequence: sequence,
      last_receipt_id: receiptId,
      updated_at: now,
    });
    transaction.create(
      db.collection(OPERATIONAL_PAGE_COLLECTIONS.receipts).doc(receiptId),
      stored,
    );
    transaction.create(db.collection(OPERATIONAL_PAGE_COLLECTIONS.audit).doc(uuidv7()), {
      action: "publication_rolled_back",
      page_id: head.id,
      version_id: target.id,
      previous_version_id: head.publishedVersionId,
      receipt_id: receiptId,
      actor_uid: actor.uid,
      created_at: now,
    });
    return { ...toReceipt(stored), duplicate: false };
  });
  await assertPublishedReadback(db, receipt);
  return receipt;
}

export async function readPublishedOperationalPage(
  actor: AuthenticatedUser,
  spaceId: string,
  slug: string,
  db: Firestore = getAdminFirestore(),
): Promise<OperationalPageVersion | null> {
  assertSpaceIdAccess(actor, spaceId);
  const pageId = operationalPageIdentity({
    spaceId,
    slug,
  });
  const headSnapshot = await db
    .collection(OPERATIONAL_PAGE_COLLECTIONS.heads)
    .doc(pageId)
    .get();
  if (!headSnapshot.exists) return null;
  const head = toHead(headSnapshot.data());
  if (!head.publishedVersionId || head.spaceId !== spaceId || head.slug !== slug) {
    return null;
  }
  const versionSnapshot = await db
    .collection(OPERATIONAL_PAGE_COLLECTIONS.versions)
    .doc(head.publishedVersionId)
    .get();
  return versionSnapshot.exists ? toVersion(versionSnapshot.data()) : null;
}

export async function listPublishedOperationalPages(
  actor: AuthenticatedUser,
  spaceId: string,
  db: Firestore = getAdminFirestore(),
): Promise<OperationalPageHead[]> {
  assertSpaceIdAccess(actor, spaceId);
  const snapshot = await db.collection(OPERATIONAL_PAGE_COLLECTIONS.heads).get();
  return snapshot.docs
    .map((doc) => toHead(doc.data()))
    .filter((head) => head.spaceId === spaceId && Boolean(head.publishedVersionId))
    .sort((left, right) => left.title.localeCompare(right.title));
}

export async function listOperationalPageAdminState(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<{ heads: OperationalPageHead[]; versions: OperationalPageVersion[] }> {
  assertAdmin(actor);
  const [headSnapshot, versionSnapshot] = await Promise.all([
    db.collection(OPERATIONAL_PAGE_COLLECTIONS.heads).get(),
    db.collection(OPERATIONAL_PAGE_COLLECTIONS.versions).get(),
  ]);
  return {
    heads: headSnapshot.docs.map((doc) => toHead(doc.data())),
    versions: versionSnapshot.docs
      .map((doc) => toVersion(doc.data()))
      .sort((left, right) => right.versionNumber - left.versionNumber),
  };
}

function assertExactPreview(version: OperationalPageVersion, previewHash: string): void {
  if (
    version.previewHash !== previewHash ||
    operationalPagePreviewHash(version.definition) !== previewHash
  ) {
    throw new EditableLayerError(
      "Operational page changed after preview. Review the exact version again.",
      409,
    );
  }
}

function assertApproval(
  data: Record<string, unknown> | undefined,
  version: OperationalPageVersion,
): void {
  if (!data) throw new EditableLayerError("The exact page version is not approved.", 409);
  const approval = toApproval(data);
  if (
    approval.versionId !== version.id ||
    approval.pageId !== version.pageId ||
    approval.previewHash !== version.previewHash
  ) {
    throw new EditableLayerError("The exact page approval does not match.", 409);
  }
}

async function duplicateReceipt(
  transaction: Transaction,
  db: Firestore,
  receiptId: string,
): Promise<OperationalPageReceipt> {
  const snapshot = await transaction.get(
    db.collection(OPERATIONAL_PAGE_COLLECTIONS.receipts).doc(receiptId),
  );
  if (!snapshot.exists) {
    throw new EditableLayerError("Publication receipt readback is missing.", 409);
  }
  return { ...toReceipt(snapshot.data()), duplicate: true };
}

async function assertPublishedReadback(
  db: Firestore,
  receipt: OperationalPageReceipt,
): Promise<void> {
  const head = await db
    .collection(OPERATIONAL_PAGE_COLLECTIONS.heads)
    .doc(receipt.pageId)
    .get();
  if (
    !head.exists ||
    head.data()?.published_version_id !== receipt.toVersionId ||
    head.data()?.last_receipt_id !== receipt.id
  ) {
    throw new EditableLayerError("Operational page publication readback failed.", 409);
  }
}

function effectReceiptId(pageId: string, sequence: number, versionId: string): string {
  return createHash("sha256")
    .update(`${pageId}:${sequence}:${versionId}`, "utf8")
    .digest("hex");
}

function receiptRecord(
  receipt: Omit<OperationalPageReceipt, "duplicate">,
): Record<string, unknown> {
  return {
    id: receipt.id,
    operation: receipt.operation,
    page_id: receipt.pageId,
    from_version_id: receipt.fromVersionId,
    to_version_id: receipt.toVersionId,
    preview_hash: receipt.previewHash,
    actor_uid: receipt.actorUid,
    sequence: receipt.sequence,
    created_at: receipt.createdAt,
  };
}

function headRecord(head: OperationalPageHead): Record<string, unknown> {
  return {
    id: head.id,
    space_id: head.spaceId,
    slug: head.slug,
    title: head.title,
    latest_version_id: head.latestVersionId,
    latest_version_number: head.latestVersionNumber,
    published_version_id: head.publishedVersionId,
    previous_published_version_id: head.previousPublishedVersionId,
    publication_sequence: head.publicationSequence,
    last_receipt_id: head.lastReceiptId,
    updated_at: head.updatedAt,
  };
}

function toVersion(data: Record<string, unknown> | undefined): OperationalPageVersion {
  if (!data) throw new EditableLayerError("Operational page version is invalid.", 409);
  return {
    id: String(data.id ?? ""),
    pageId: String(data.page_id ?? ""),
    versionNumber: Number(data.version_number ?? 0),
    definition: OperationalPageDefinitionSchema.parse(data.definition),
    previewHash: String(data.preview_hash ?? ""),
    state: "draft",
    createdByUid: String(data.created_by_uid ?? ""),
    createdAt: String(data.created_at ?? ""),
  };
}

function toHead(data: Record<string, unknown> | undefined): OperationalPageHead {
  if (!data) throw new EditableLayerError("Operational page head is invalid.", 409);
  return {
    id: String(data.id ?? ""),
    spaceId: String(data.space_id ?? ""),
    slug: String(data.slug ?? ""),
    title: String(data.title ?? ""),
    latestVersionId: String(data.latest_version_id ?? ""),
    latestVersionNumber: Number(data.latest_version_number ?? 0),
    publishedVersionId:
      typeof data.published_version_id === "string" ? data.published_version_id : null,
    previousPublishedVersionId:
      typeof data.previous_published_version_id === "string"
        ? data.previous_published_version_id
        : null,
    publicationSequence: Number(data.publication_sequence ?? 0),
    lastReceiptId: typeof data.last_receipt_id === "string" ? data.last_receipt_id : null,
    updatedAt: String(data.updated_at ?? ""),
  };
}

function toApproval(data: Record<string, unknown> | undefined): OperationalPageApproval {
  if (!data) throw new EditableLayerError("Operational page approval is invalid.", 409);
  return {
    versionId: String(data.version_id ?? ""),
    pageId: String(data.page_id ?? ""),
    previewHash: String(data.preview_hash ?? ""),
    approvedByUid: String(data.approved_by_uid ?? ""),
    approvedAt: String(data.approved_at ?? ""),
  };
}

function toReceipt(
  data: Record<string, unknown> | undefined,
): Omit<OperationalPageReceipt, "duplicate"> {
  if (!data) throw new EditableLayerError("Operational page receipt is invalid.", 409);
  return {
    id: String(data.id ?? ""),
    operation: data.operation === "rollback" ? "rollback" : "publish",
    pageId: String(data.page_id ?? ""),
    fromVersionId: typeof data.from_version_id === "string" ? data.from_version_id : null,
    toVersionId: String(data.to_version_id ?? ""),
    previewHash: String(data.preview_hash ?? ""),
    actorUid: String(data.actor_uid ?? ""),
    sequence: Number(data.sequence ?? 0),
    createdAt: String(data.created_at ?? ""),
  };
}
