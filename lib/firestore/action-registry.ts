import { FieldValue } from "firebase-admin/firestore";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  CreateActionRegistryInputSchema,
  type CreateActionRegistryInput,
} from "@/lib/firestore/schemas";
import type { ActionRegistryRecord } from "@/lib/firestore/types";

export const ACTION_REGISTRY_COLLECTION = "action_registry";

type FirestoreValue = Record<string, unknown>;

/**
 * Read every Action Registry entry, sorted by key. Read-only: this module never executes
 * an external action and never marks an entry production-eligible at runtime.
 */
export async function listActionRegistry(
  actor: AuthenticatedUser,
  db = getAdminFirestore(),
): Promise<ActionRegistryRecord[]> {
  assertCan(actor, "read");
  const snapshot = await db.collection(ACTION_REGISTRY_COLLECTION).get();

  return snapshot.docs
    .map((doc) => readRecord<ActionRegistryRecord>(doc.id, doc.data()))
    .sort((left, right) => left.key.localeCompare(right.key));
}

/**
 * Read a single Action Registry entry by its stable key. Throws 404 when missing.
 */
export async function getActionRegistryEntry(
  actor: AuthenticatedUser,
  key: string,
  db = getAdminFirestore(),
): Promise<ActionRegistryRecord> {
  assertCan(actor, "read");
  const snapshot = await db.collection(ACTION_REGISTRY_COLLECTION).doc(key).get();
  const data = snapshot.data();

  if (!data) {
    throw new EditableLayerError("Action Registry entry was not found.", 404);
  }

  return readRecord<ActionRegistryRecord>(snapshot.id, data);
}

/**
 * Build a persistable Action Registry record from validated input. Used by the seed
 * script. The key is the Firestore document id, so the catalog stays addressable by slug.
 */
export function buildActionRegistryRecord(input: CreateActionRegistryInput) {
  const parsed = CreateActionRegistryInputSchema.parse(input);

  return {
    id: parsed.key,
    key: parsed.key,
    label: parsed.label,
    target_system: parsed.target_system,
    expected_action: parsed.expected_action,
    product_lane: parsed.product_lane,
    readiness: parsed.readiness,
    evidence_status: parsed.evidence_status,
    documented_evidence: parsed.documented_evidence,
    required_permissions: parsed.required_permissions,
    required_plan: parsed.required_plan,
    event_ingestion_mode: parsed.event_ingestion_mode,
    preview_schema_note: parsed.preview_schema_note,
    preview_payload_schema: parsed.preview_payload_schema,
    test_notes: parsed.test_notes,
    rollback_note: parsed.rollback_note,
    connection_health_check_ref: parsed.connection_health_check_ref,
    production_allowed: parsed.production_allowed,
  } satisfies Omit<ActionRegistryRecord, "created_at" | "updated_at">;
}

/**
 * Write a single Action Registry entry through the Admin SDK. Server-side only; the
 * Firestore rules deny all client writes to this collection. Idempotent by key.
 */
export async function upsertActionRegistryEntry(
  input: CreateActionRegistryInput,
  db = getAdminFirestore(),
) {
  const record = buildActionRegistryRecord(input);

  await db
    .collection(ACTION_REGISTRY_COLLECTION)
    .doc(record.key)
    .set(
      stripUndefined({
        ...record,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      }),
      { merge: true },
    );

  return record.key;
}

function readRecord<T>(id: string, data: FirestoreValue) {
  return normalizeFirestoreValue({ id, ...data }) as T;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;

    if (typeof toDate === "function") {
      return toDate.call(value).toISOString();
    }
  }

  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [
        key,
        normalizeFirestoreValue(childValue),
      ]),
    );
  }

  return value;
}

function stripUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for the requested Action Registry read.",
      403,
    );
  }
}
