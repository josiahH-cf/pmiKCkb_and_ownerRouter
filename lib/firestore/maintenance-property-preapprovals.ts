import { stampProductRecordRetention } from "@/lib/operations/product-record-retention";
import { createHash } from "node:crypto";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import {
  MaintenancePropertyPreapprovalSchema,
  ApplyMaintenancePolicyInputSchema,
  type ApplyMaintenancePolicyInput,
} from "@/lib/maintenance/property-preapproval";
export {
  MaintenancePropertyPreapprovalSchema,
  ApplyMaintenancePolicyInputSchema,
  type ApplyMaintenancePolicyInput,
} from "@/lib/maintenance/property-preapproval";
// S108 property maintenance preapproval store. One current record per property key plus an
// append-only history, both server-written through the Admin SDK only.
//
// Only a current Admin may change a preapproval, every change bumps a version and writes its own
// history row, and the record is app-side authorization bookkeeping: it never sets `isOwnerApproved`
// in RentVine and never reaches a provider.

import {
  FieldValue,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";
import { v7 as uuidv7 } from "uuid";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  MAX_PREAPPROVAL_AMOUNT_CENTS,
  type MaintenancePropertyPreapproval,
} from "@/lib/maintenance/property-preapproval";
import {
  PREAPPROVAL_IMPORT_MAX_ROWS,
  preapprovalImportChanges,
  type PreapprovalImportRow,
} from "@/lib/maintenance/rentvine-preapproval-import";

export const MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION =
  "maintenance_property_preapprovals";
export const MAINTENANCE_PROPERTY_PREAPPROVAL_ACTIVITY_COLLECTION =
  "maintenance_property_preapproval_activity";

const PropertyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9:_-]+$/, "A property key is an exact provider identifier.");

export interface MaintenancePropertyPreapprovalActivity {
  readonly id: string;
  readonly property_key: string;
  readonly action: "set" | "cleared";
  readonly amount_cents: number | null;
  readonly previous_amount_cents: number | null;
  readonly version: number;
  readonly actor_uid: string;
  readonly created_at: string;
  readonly note?: string;
}

function requireAdmin(actor: AuthenticatedUser): void {
  if (
    actor.role !== "Admin" ||
    actor.hd !== "pmikcmetro.com" ||
    !actor.email.toLowerCase().endsWith("@pmikcmetro.com") ||
    isVerificationAccount(actor)
  ) {
    throw new EditableLayerError(
      "Changing a property preapproval requires Admin access in Maintenance.",
      403,
    );
  }
}

function requireRead(actor: AuthenticatedUser): void {
  if (
    !["Editor", "Approver", "Admin"].includes(actor.role) ||
    !can(actor.role, "read") ||
    actor.hd !== "pmikcmetro.com" ||
    !actor.email.toLowerCase().endsWith("@pmikcmetro.com")
  ) {
    throw new EditableLayerError("Reading property preapprovals requires read.", 403);
  }
}

export function readMaintenancePropertyPreapprovalRecord(
  data: Record<string, unknown>,
): MaintenancePropertyPreapproval {
  const value = { ...data };
  delete value["created_at"];
  delete value["updated_at"];
  for (const key of ["product_retention_policy", "product_retention_class", "legal_hold"])
    delete value[key];
  return MaintenancePropertyPreapprovalSchema.parse(value);
}

export async function getMaintenancePropertyPreapproval(
  actor: AuthenticatedUser,
  propertyKey: string,
  db: Firestore = getAdminFirestore(),
): Promise<MaintenancePropertyPreapproval | null> {
  requireRead(actor);
  const key = PropertyKeySchema.parse(propertyKey);
  const snapshot = await db
    .collection(MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION)
    .doc(key)
    .get();
  return snapshot.exists
    ? readMaintenancePropertyPreapprovalRecord(snapshot.data() ?? {})
    : null;
}

export async function listMaintenancePropertyPreapprovals(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<MaintenancePropertyPreapproval[]> {
  requireRead(actor);
  const snapshot = await db
    .collection(MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION)
    .limit(500)
    .get();
  return snapshot.docs
    .map((doc) => readMaintenancePropertyPreapprovalRecord(doc.data()))
    .sort((left, right) => left.property_key.localeCompare(right.property_key));
}

/**
 * Record the exact amount an Admin read from the owner's records. The write is transactional with
 * its history row, so a stored preapproval always has the audit entry that produced it.
 */
export async function setMaintenancePropertyPreapproval(
  actor: AuthenticatedUser,
  input: {
    propertyKey: string;
    amountCents: number;
    effectiveFromIso: string;
    note?: string;
  },
  db: Firestore = getAdminFirestore(),
): Promise<MaintenancePropertyPreapproval> {
  requireAdmin(actor);
  const key = PropertyKeySchema.parse(input.propertyKey);
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new EditableLayerError("A preapproval amount must be greater than zero.", 400);
  }
  if (input.amountCents > MAX_PREAPPROVAL_AMOUNT_CENTS) {
    throw new EditableLayerError("That preapproval amount is above the app limit.", 400);
  }
  if (!Number.isFinite(Date.parse(input.effectiveFromIso))) {
    throw new EditableLayerError("Provide an exact effective date.", 400);
  }
  const ref = db.collection(MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION).doc(key);
  return db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    return stagePreapprovalSet(db, transaction, actor, current, {
      key,
      amountCents: input.amountCents,
      effectiveFromIso: input.effectiveFromIso,
      note: input.note,
    });
  });
}

/** Stage one versioned record and its history row inside an existing transaction. */
function stagePreapprovalSet(
  db: Firestore,
  transaction: Transaction,
  actor: AuthenticatedUser,
  current: DocumentSnapshot,
  input: { key: string; amountCents: number; effectiveFromIso: string; note?: string },
): MaintenancePropertyPreapproval {
  const previous = current.exists
    ? readMaintenancePropertyPreapprovalRecord(current.data() ?? {})
    : null;
  if (previous?.policy_terms)
    throw new EditableLayerError(
      "Use the current policy editor to change reviewed scope and cost terms. An amount-only import cannot replace them.",
      409,
    );
  const record = MaintenancePropertyPreapprovalSchema.parse({
    property_key: input.key,
    amount_cents: input.amountCents,
    effective_from_iso: input.effectiveFromIso,
    recorded_by_uid: actor.uid,
    version: (previous?.version ?? 0) + 1,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  });
  transaction.set(
    current.ref,
    stampProductRecordRetention("maintenance_property_preapprovals", {
      ...record,
      legal_hold: current.exists ? current.data()?.legal_hold === true : false,
      created_at: current.exists
        ? ((current.data() as Record<string, unknown>)["created_at"] ??
          FieldValue.serverTimestamp())
        : FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }),
  );
  const activityRef = db
    .collection(MAINTENANCE_PROPERTY_PREAPPROVAL_ACTIVITY_COLLECTION)
    .doc(uuidv7());
  transaction.set(
    activityRef,
    stampProductRecordRetention("maintenance_property_preapproval_activity", {
      id: activityRef.id,
      property_key: input.key,
      action: "set",
      amount_cents: record.amount_cents,
      previous_amount_cents: previous?.amount_cents ?? null,
      version: record.version,
      actor_uid: actor.uid,
      created_at: new Date().toISOString(),
      ...(record.note ? { note: record.note } : {}),
    }),
  );
  return record;
}

/**
 * S108 amendment (B-MNT1): record the confirmed RentVine maintenance-limit import in one transaction.
 * Only additions and changed amounts are written. Each written property must still hold exactly the
 * amount and version the preview showed; any difference refuses the whole import, so nothing is
 * recorded from a stale preview. Unchanged rows and properties absent from the plan are untouched.
 */
export async function importMaintenancePropertyPreapprovals(
  actor: AuthenticatedUser,
  input: {
    rows: readonly PreapprovalImportRow[];
    effectiveFromIso: string;
    note: string;
  },
  db: Firestore = getAdminFirestore(),
): Promise<MaintenancePropertyPreapproval[]> {
  requireAdmin(actor);
  const changes = preapprovalImportChanges(input);
  if (changes.length === 0) return [];
  if (changes.length > PREAPPROVAL_IMPORT_MAX_ROWS) {
    throw new EditableLayerError(
      `One import records at most ${PREAPPROVAL_IMPORT_MAX_ROWS} properties.`,
      400,
    );
  }
  if (!Number.isFinite(Date.parse(input.effectiveFromIso))) {
    throw new EditableLayerError("Provide an exact effective date.", 400);
  }
  const keys = changes.map((row) => PropertyKeySchema.parse(row.propertyKey));
  if (new Set(keys).size !== keys.length) {
    throw new EditableLayerError("Each property appears once in an import.", 400);
  }
  for (const row of changes) {
    if (
      !Number.isSafeInteger(row.amountCents) ||
      row.amountCents <= 0 ||
      row.amountCents > MAX_PREAPPROVAL_AMOUNT_CENTS
    ) {
      throw new EditableLayerError(
        "An imported amount is outside the app's limits.",
        400,
      );
    }
  }
  const refs = keys.map((key) =>
    db.collection(MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION).doc(key),
  );
  return db.runTransaction(async (transaction) => {
    const snapshots = await transaction.getAll(...refs);
    snapshots.forEach((snapshot, index) => {
      const previous = snapshot.exists
        ? readMaintenancePropertyPreapprovalRecord(snapshot.data() ?? {})
        : null;
      if (
        (previous?.amount_cents ?? null) !== changes[index].currentAmountCents ||
        (previous?.version ?? null) !== changes[index].currentVersion
      ) {
        throw new EditableLayerError(
          "A property's preapproval changed after the preview. Preview the import again.",
          409,
        );
      }
    });
    return snapshots.map((snapshot, index) =>
      stagePreapprovalSet(db, transaction, actor, snapshot, {
        key: keys[index],
        amountCents: changes[index].amountCents,
        effectiveFromIso: input.effectiveFromIso,
        note: input.note,
      }),
    );
  });
}

/** Remove a preapproval. The history row survives; every later ticket needs the owner again. */
export async function clearMaintenancePropertyPreapproval(
  actor: AuthenticatedUser,
  propertyKey: string,
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  requireAdmin(actor);
  const key = PropertyKeySchema.parse(propertyKey);
  const ref = db.collection(MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION).doc(key);
  const activityRef = db
    .collection(MAINTENANCE_PROPERTY_PREAPPROVAL_ACTIVITY_COLLECTION)
    .doc(uuidv7());
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists) {
      throw new EditableLayerError("That property has no recorded preapproval.", 404);
    }
    const previous = readMaintenancePropertyPreapprovalRecord(current.data() ?? {});
    if (previous.policy_terms)
      throw new EditableLayerError(
        "Revoke this reviewed policy with its current version; its terms and history are retained.",
        409,
      );
    transaction.delete(ref);
    transaction.set(
      activityRef,
      stampProductRecordRetention("maintenance_property_preapproval_activity", {
        id: activityRef.id,
        property_key: key,
        action: "cleared",
        amount_cents: null,
        previous_amount_cents: previous.amount_cents,
        version: previous.version + 1,
        actor_uid: actor.uid,
        created_at: new Date().toISOString(),
      }),
    );
  });
}

export async function listMaintenancePropertyPreapprovalActivity(
  actor: AuthenticatedUser,
  propertyKey: string,
  db: Firestore = getAdminFirestore(),
): Promise<MaintenancePropertyPreapprovalActivity[]> {
  requireRead(actor);
  const key = PropertyKeySchema.parse(propertyKey);
  const snapshot = await db
    .collection(MAINTENANCE_PROPERTY_PREAPPROVAL_ACTIVITY_COLLECTION)
    .where("property_key", "==", key)
    .limit(200)
    .get();
  return snapshot.docs
    .map((doc) => doc.data() as MaintenancePropertyPreapprovalActivity)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function policyOperationKey(actor: AuthenticatedUser, id: string) {
  return createHash("sha256")
    .update(JSON.stringify(["maintenance-policy/v1", actor.uid, id]))
    .digest("hex");
}
export async function readMaintenancePolicyOperation(
  actor: AuthenticatedUser,
  operationId: string,
  db: Firestore = getAdminFirestore(),
) {
  requireRead(actor);
  z.string().uuid().parse(operationId);
  const receipt = await db
    .collection(MAINTENANCE_PROPERTY_PREAPPROVAL_ACTIVITY_COLLECTION)
    .doc(policyOperationKey(actor, operationId))
    .get();
  if (!receipt.exists) return { state: "not_recorded" as const, preapproval: null };
  const prior = receipt.data()!;
  if (prior.actor_uid !== actor.uid || prior.operation_id !== operationId)
    throw new EditableLayerError("The original policy receipt is unavailable.", 409);
  if (prior.state === "cancelled")
    return { state: "cancelled" as const, preapproval: null };
  const current = await db
    .collection(MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION)
    .doc(prior.property_key)
    .get();
  if (!current.exists)
    throw new EditableLayerError(
      "The recorded policy is unavailable; keep its original operation identity.",
      409,
    );
  return {
    state: "committed" as const,
    committed_version: prior.version,
    preapproval: readMaintenancePropertyPreapprovalRecord(current.data()!),
  };
}
/** One Admin Save writes reviewed terms and its original receipt atomically. No provider effect. */
export async function applyMaintenancePolicy(
  actor: AuthenticatedUser,
  input: ApplyMaintenancePolicyInput,
  db: Firestore = getAdminFirestore(),
) {
  requireAdmin(actor);
  const command = ApplyMaintenancePolicyInputSchema.parse(input),
    fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex"),
    ref = db
      .collection(MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION)
      .doc(command.property_key),
    receipt = db
      .collection(MAINTENANCE_PROPERTY_PREAPPROVAL_ACTIVITY_COLLECTION)
      .doc(policyOperationKey(actor, command.operation_id));
  return db.runTransaction(async (tx) => {
    const [prior, snapshot] = await tx.getAll(receipt, ref),
      previous = snapshot.exists
        ? readMaintenancePropertyPreapprovalRecord(snapshot.data()!)
        : null;
    if (prior.exists) {
      if (prior.data()!.state === "cancelled")
        throw new EditableLayerError(
          "This original policy save was stopped before admission. Read current policy before a new save.",
          409,
        );
      if (
        prior.data()!.fingerprint !== fingerprint ||
        prior.data()!.actor_uid !== actor.uid
      )
        throw new EditableLayerError(
          "This policy operation records different terms. Recover its original receipt.",
          409,
        );
      if (!previous)
        throw new EditableLayerError("The recorded policy is unavailable.", 409);
      return previous;
    }
    if ((previous?.version ?? 0) !== command.expected_version)
      throw new EditableLayerError(
        "The policy changed. Your terms are kept; read its current version before saving another change.",
        409,
      );
    const at = new Date().toISOString();
    let record: MaintenancePropertyPreapproval;
    if (command.operation === "set_policy") {
      if (
        !command.policy_terms.property_keys.includes(command.property_key) ||
        command.policy_terms.revoked_at !== null
      )
        throw new EditableLayerError(
          "Select the real property in an active policy; use Revoke to end existing authority.",
          400,
        );
      if (
        command.policy_terms.expires_at &&
        Date.parse(command.policy_terms.expires_at) <=
          Date.parse(command.effective_from_iso)
      )
        throw new EditableLayerError(
          "Policy expiry must follow its effective date.",
          400,
        );
      record = MaintenancePropertyPreapprovalSchema.parse({
        property_key: command.property_key,
        amount_cents: command.amount_cents,
        effective_from_iso: command.effective_from_iso,
        recorded_by_uid: actor.uid,
        version: command.expected_version + 1,
        note: command.note,
        policy_terms: command.policy_terms,
      });
    } else {
      if (!previous?.policy_terms || previous.policy_terms.revoked_at)
        throw new EditableLayerError(
          "There is no active reviewed policy to revoke.",
          409,
        );
      record = {
        ...previous,
        version: previous.version + 1,
        recorded_by_uid: actor.uid,
        note: command.reason,
        policy_terms: { ...previous.policy_terms, revoked_at: at },
      };
    }
    tx.set(
      ref,
      stampProductRecordRetention(
        "maintenance_property_preapprovals",
        { ...record, created_at: snapshot.data()?.created_at ?? at, updated_at: at },
        snapshot.data(),
      ),
    );
    tx.set(
      receipt,
      stampProductRecordRetention("maintenance_property_preapproval_activity", {
        id: receipt.id,
        property_key: command.property_key,
        action: command.operation,
        amount_cents: record.amount_cents,
        previous_amount_cents: previous?.amount_cents ?? null,
        version: record.version,
        actor_uid: actor.uid,
        created_at: at,
        operation_id: command.operation_id,
        fingerprint,
        policy_snapshot: record,
        previous_policy_snapshot: previous,
      }),
    );
    return record;
  });
}

/** Atomically prevent a late request from admitting this actor's original identity. */
export async function stopMaintenancePolicyOperation(
  actor: AuthenticatedUser,
  operationId: string,
  db: Firestore = getAdminFirestore(),
) {
  requireAdmin(actor);
  z.string().uuid().parse(operationId);
  const ref = db
    .collection(MAINTENANCE_PROPERTY_PREAPPROVAL_ACTIVITY_COLLECTION)
    .doc(policyOperationKey(actor, operationId));
  const result = await db.runTransaction(async (tx) => {
    const prior = await tx.get(ref);
    if (prior.exists)
      return prior.data()!.state === "cancelled" ? "cancelled" : "committed";
    tx.create(
      ref,
      stampProductRecordRetention("maintenance_property_preapproval_activity", {
        id: ref.id,
        operation_id: operationId,
        actor_uid: actor.uid,
        state: "cancelled",
        action: "stop_before_admission",
        created_at: new Date().toISOString(),
      }),
    );
    return "cancelled";
  });
  return result === "committed"
    ? readMaintenancePolicyOperation(actor, operationId, db)
    : { state: "cancelled" as const, preapproval: null };
}
