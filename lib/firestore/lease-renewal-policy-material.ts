// S131 (F11): app-owned storage for versioned policy material. A version is submitted as pending,
// approved or rejected as one exact version by an existing approver capability, and superseded
// only by a later approval. The stored configuration is engineering scaffolding bound to an S21
// trusted publication by id and content hash; it is never the policy itself, never legal content
// and never a provider record. No version is activated automatically when a file arrives.
//
// GOVERNANCE: server-written through the Admin SDK boundary only; the `firestore.rules` default
// deny covers these collections. The snapshot read never throws: a missing, malformed, ambiguous
// or unreadable state reads as its explicit state, under which the projection yields Unknown or
// Needs review rather than a guessed policy. Nothing here sends, drafts, charges, enrolls, files a
// claim or writes to a provider or the operating Sheet.

import { z } from "zod";
import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { resolveStoredDataMode } from "@/lib/data-mode";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  MISSING_POLICY_MATERIAL,
  POLICY_MATERIAL_STATES,
  POLICY_PRODUCT_KEYS,
  PolicyMaterialConfigSchema,
  type PolicyMaterialSnapshot,
  type PolicyProductKey,
} from "@/lib/lease-renewal/policy-content";
import {
  getPublicationVersion,
  PUBLICATION_COLLECTIONS,
} from "@/lib/publication/service";
import type { PublicationVersionRecord } from "@/lib/publication/types";

export const POLICY_MATERIAL_COLLECTION = "lease_renewal_policy_material";
export const POLICY_MATERIAL_ACTIVITY_COLLECTION =
  "lease_renewal_policy_material_activity";

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const UNREADABLE_POLICY_MATERIAL: PolicyMaterialSnapshot = {
  ...MISSING_POLICY_MATERIAL,
  state: "unreadable",
  active: null,
  activeRevision: null,
};

export const PolicyMaterialVersionRecordSchema = z
  .object({
    id: z.string().min(1),
    product_key: z.enum(POLICY_PRODUCT_KEYS),
    version: z.string().regex(VERSION),
    state: z.enum(POLICY_MATERIAL_STATES),
    revision: z.number().int().positive(),
    config: PolicyMaterialConfigSchema,
    submitted_at: z.string(),
    submitted_by_uid: z.string().min(1),
    decided_at: z.string().optional(),
    decided_by_uid: z.string().min(1).optional(),
    decision_reason: z.string().optional(),
    superseded_by_version: z.string().optional(),
  })
  .strict();
export type PolicyMaterialVersionRecord = z.infer<
  typeof PolicyMaterialVersionRecordSchema
>;

export const IntakePolicyMaterialInputSchema = z
  .object({
    config: PolicyMaterialConfigSchema,
    operationId: z.string().uuid(),
  })
  .strict();
export type IntakePolicyMaterialInput = z.infer<typeof IntakePolicyMaterialInputSchema>;

export const DecidePolicyMaterialInputSchema = z
  .object({
    productKey: z.enum(POLICY_PRODUCT_KEYS),
    version: z.string().regex(VERSION),
    decision: z.enum(["approve", "reject"]),
    reason: z.string().trim().min(1).max(500),
    /** The record revision the approver loaded; a changed record refuses until reloaded. */
    expectedRevision: z.number().int().positive(),
    operationId: z.string().uuid(),
  })
  .strict();
export type DecidePolicyMaterialInput = z.infer<typeof DecidePolicyMaterialInputSchema>;

/** The S21 reads a binding check needs; injectable so tests never touch a live publication. */
export interface PolicyMaterialBindingDeps {
  readPublication: (versionId: string) => Promise<PublicationVersionRecord>;
  readActiveVersionId: (resourceId: string) => Promise<string | null>;
}

function defaultBindingDeps(db: Firestore): PolicyMaterialBindingDeps {
  return {
    readPublication: (id) => getPublicationVersion(id, db),
    readActiveVersionId: async (id) => {
      const doc = await db.collection(PUBLICATION_COLLECTIONS.resources).doc(id).get();
      const value = doc.data()?.activeVersionId;
      return typeof value === "string" ? value : null;
    },
  };
}

export function policyMaterialDocId(productKey: PolicyProductKey, version: string) {
  return `${productKey}:${version}`;
}

/**
 * The material must name exactly one validated, live, currently active S21 publication in the
 * renewals Space whose content hash matches. A URL, a Drive id, browser-supplied bytes or a
 * rolled-back publication can never become policy material through this seam.
 */
export async function assertPolicyMaterialBinding(
  config: z.infer<typeof PolicyMaterialConfigSchema>,
  deps: PolicyMaterialBindingDeps,
) {
  const versionId = config.publicationSource.reference.slice("publication:".length);
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
    version.contentHash !== config.publicationSource.contentHash ||
    version.contentRef?.contentHash !== config.publicationSource.contentHash ||
    (await deps.readActiveVersionId(version.resourceId)) !== versionId
  )
    throw new EditableLayerError(
      "The named publication is not the current validated live publication with this content hash.",
      409,
    );
}

/** The stored shape: the document id is the key, never a field. */
function withoutId(record: PolicyMaterialVersionRecord): Record<string, unknown> {
  const stored: Record<string, unknown> = { ...record };
  delete stored.id;
  return stored;
}

function parseRecord(id: string, data: unknown): PolicyMaterialVersionRecord | null {
  const parsed = PolicyMaterialVersionRecordSchema.safeParse({
    ...(data as Record<string, unknown>),
    id,
  });
  return parsed.success ? parsed.data : null;
}

async function readProductRecords(
  db: Firestore,
  productKey: PolicyProductKey,
): Promise<{ records: PolicyMaterialVersionRecord[]; invalid: number }> {
  const snapshot = await db
    .collection(POLICY_MATERIAL_COLLECTION)
    .where("product_key", "==", productKey)
    .get();
  let invalid = 0;
  const records: PolicyMaterialVersionRecord[] = [];
  for (const doc of snapshot.docs) {
    const record = parseRecord(doc.id, doc.data());
    if (record) records.push(record);
    else invalid++;
  }
  records.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  return { records, invalid };
}

/** The never-throwing snapshot every desk and workspace read consumes. */
export async function readPolicyMaterialSnapshot(
  productKey: PolicyProductKey,
  db?: Firestore,
): Promise<PolicyMaterialSnapshot> {
  let firestore: Firestore;
  try {
    firestore = db ?? getAdminFirestore();
  } catch {
    return UNREADABLE_POLICY_MATERIAL;
  }
  try {
    const { records, invalid } = await readProductRecords(firestore, productKey);
    const pendingVersions = records
      .filter((record) => record.state === "pending")
      .map((record) => record.version);
    if (invalid > 0)
      return { state: "unreadable", active: null, activeRevision: null, pendingVersions };
    const approved = records.filter((record) => record.state === "approved");
    if (approved.length > 1)
      return { state: "ambiguous", active: null, activeRevision: null, pendingVersions };
    if (approved.length === 1)
      return {
        state: "approved",
        active: approved[0].config,
        activeRevision: approved[0].revision,
        pendingVersions,
      };
    return {
      state: pendingVersions.length > 0 ? "pending_only" : "none",
      active: null,
      activeRevision: null,
      pendingVersions,
    };
  } catch {
    return UNREADABLE_POLICY_MATERIAL;
  }
}

/** Every version of one product for the Admin surface; Admins and approvers only. */
export async function listPolicyMaterial(
  actor: AuthenticatedUser,
  productKey: PolicyProductKey,
  db: Firestore = getAdminFirestore(),
): Promise<PolicyMaterialVersionRecord[]> {
  if (!can(actor.role, "manageAdmin") && !can(actor.role, "approve"))
    throw new EditableLayerError("An Admin or Approver reviews policy material.", 403);
  return (await readProductRecords(db, productKey)).records;
}

/**
 * Submit one exact version as pending. Idempotent by operation id (a lost response is reconciled
 * by resubmitting the identical request), refuses a changed resubmission and a duplicate version,
 * and never touches the approved version.
 */
export async function intakePolicyMaterial(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
  deps: PolicyMaterialBindingDeps = defaultBindingDeps(db),
  now: string = new Date().toISOString(),
): Promise<{ record: PolicyMaterialVersionRecord; duplicate: boolean }> {
  if (!can(actor.role, "manageAdmin"))
    throw new EditableLayerError("An Admin submits policy material for approval.", 403);
  const input = IntakePolicyMaterialInputSchema.parse(raw);
  await assertPolicyMaterialBinding(input.config, deps);
  const requestHash = hashExecutionPreview({
    actorUid: actor.uid,
    action: "policy_material_submitted",
    config: input.config,
  });
  const id = policyMaterialDocId(input.config.productKey, input.config.version);
  const ref = db.collection(POLICY_MATERIAL_COLLECTION).doc(id);
  const audit = db.collection(POLICY_MATERIAL_ACTIVITY_COLLECTION).doc(input.operationId);
  return db.runTransaction(async (transaction) => {
    const [existing, previous] = await Promise.all([
      transaction.get(ref),
      transaction.get(audit),
    ]);
    if (previous.exists) {
      if (previous.data()?.request_hash !== requestHash)
        throw new EditableLayerError(
          "This submission changed since it was first sent. Reload and submit it again.",
          409,
        );
      const record = existing.exists ? parseRecord(existing.id, existing.data()) : null;
      if (!record)
        throw new EditableLayerError(
          "The earlier submission is not readable. Reload before submitting again.",
          409,
        );
      return { record, duplicate: true };
    }
    if (existing.exists)
      throw new EditableLayerError(
        `Version ${input.config.version} already exists for ${input.config.productKey}. Submit a new version instead of replacing one.`,
        409,
      );
    const record: PolicyMaterialVersionRecord = {
      id,
      product_key: input.config.productKey,
      version: input.config.version,
      state: "pending",
      revision: 1,
      config: input.config,
      submitted_at: now,
      submitted_by_uid: actor.uid,
    };
    transaction.create(ref, withoutId(record));
    transaction.create(audit, {
      action: "policy_material_submitted",
      actor_uid: actor.uid,
      created_at: now,
      material_id: id,
      product_key: record.product_key,
      version: record.version,
      request_hash: requestHash,
      revision: 1,
    });
    return { record, duplicate: false };
  });
}

/**
 * Approve or reject one exact pending version under a revision check. Approval re-verifies the
 * publication binding, makes this version the only approved one and marks any earlier approved
 * version superseded by it, so a later version invalidates preparations bound to the old one.
 * Rejection keeps the last approved version untouched. Idempotent by operation id.
 */
export async function decidePolicyMaterial(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
  deps: PolicyMaterialBindingDeps = defaultBindingDeps(db),
  now: string = new Date().toISOString(),
): Promise<{ record: PolicyMaterialVersionRecord; duplicate: boolean }> {
  if (!can(actor.role, "approve"))
    throw new EditableLayerError("An Approver or Admin decides policy material.", 403);
  const input = DecidePolicyMaterialInputSchema.parse(raw);
  const id = policyMaterialDocId(input.productKey, input.version);
  const ref = db.collection(POLICY_MATERIAL_COLLECTION).doc(id);
  const audit = db.collection(POLICY_MATERIAL_ACTIVITY_COLLECTION).doc(input.operationId);
  const requestHash = hashExecutionPreview({
    actorUid: actor.uid,
    action: `policy_material_${input.decision}`,
    materialId: id,
    expectedRevision: input.expectedRevision,
    reason: input.reason,
  });
  const preflight = await ref.get();
  const current = preflight.exists ? parseRecord(preflight.id, preflight.data()) : null;
  if (!current)
    throw new EditableLayerError("This policy material version was not found.", 404);
  if (input.decision === "approve" && current.state === "pending")
    await assertPolicyMaterialBinding(current.config, deps);
  const approvedBefore = (await readProductRecords(db, input.productKey)).records.filter(
    (record) => record.state === "approved" && record.id !== id,
  );
  return db.runTransaction(async (transaction) => {
    const [snapshot, previous, ...others] = await Promise.all([
      transaction.get(ref),
      transaction.get(audit),
      ...approvedBefore.map((record) =>
        transaction.get(db.collection(POLICY_MATERIAL_COLLECTION).doc(record.id)),
      ),
    ]);
    const record = snapshot.exists ? parseRecord(snapshot.id, snapshot.data()) : null;
    if (!record)
      throw new EditableLayerError("This policy material version was not found.", 404);
    if (previous.exists) {
      if (previous.data()?.request_hash !== requestHash)
        throw new EditableLayerError(
          "This decision changed since it was first sent. Reload and decide again.",
          409,
        );
      return { record, duplicate: true };
    }
    if (record.revision !== input.expectedRevision)
      throw new EditableLayerError(
        "This version changed since the page was loaded. Reload to see its current state before deciding.",
        409,
      );
    if (record.state !== "pending")
      throw new EditableLayerError(
        `Only a pending version can be ${input.decision === "approve" ? "approved" : "rejected"}; this one is ${record.state}.`,
        409,
      );
    const next: PolicyMaterialVersionRecord = {
      ...record,
      state: input.decision === "approve" ? "approved" : "rejected",
      revision: record.revision + 1,
      decided_at: now,
      decided_by_uid: actor.uid,
      decision_reason: input.reason,
    };
    transaction.set(ref, withoutId(next));
    if (input.decision === "approve")
      for (const [index, other] of others.entries()) {
        const older = other.exists ? parseRecord(other.id, other.data()) : null;
        if (!older || older.state !== "approved") continue;
        const olderStored = withoutId({
          ...older,
          state: "superseded" as const,
          revision: older.revision + 1,
          superseded_by_version: next.version,
        });
        transaction.set(
          db.collection(POLICY_MATERIAL_COLLECTION).doc(approvedBefore[index].id),
          olderStored,
        );
      }
    transaction.create(audit, {
      action: `policy_material_${input.decision === "approve" ? "approved" : "rejected"}`,
      actor_uid: actor.uid,
      created_at: now,
      material_id: id,
      product_key: next.product_key,
      version: next.version,
      reason: input.reason,
      request_hash: requestHash,
      revision: next.revision,
      superseded: approvedBefore.map((record) => record.version),
    });
    return { record: next, duplicate: false };
  });
}

/** Activity id helper for callers that need a fresh operation id server-side. */
export function newPolicyMaterialOperationId() {
  return uuidv7();
}
