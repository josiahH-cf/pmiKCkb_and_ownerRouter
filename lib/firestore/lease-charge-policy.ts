// S66 (AC-S66-7): the Admin-published renewal charge policy. Each publication is a new immutable
// version; the current document names the one packets calculate from. A stale version is refused,
// an operation id makes a retry return the first result, and malformed tiers never publish.
// Publishing changes no lease's packet inputs, frozen attempt, RentVine charge or Sheet value;
// packets evaluated afterwards show the change as a successor that needs review.

import type { Firestore, Transaction } from "firebase-admin/firestore";

import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import {
  CHARGE_POLICY_SCHEMA_VERSION,
  ChargePolicyRecordSchema,
  PublishChargePolicyInputSchema,
  type ChargePolicyRecord,
} from "@/lib/lease-documents/charge-policy";

export const CHARGE_POLICY_COLLECTIONS = {
  current: "lease_charge_policies",
  versions: "lease_charge_policy_versions",
  activity: "lease_charge_policy_activity",
} as const;
export const CHARGE_POLICY_DOC_ID = "current";

export function chargePolicyRef(db: Firestore) {
  return db.collection(CHARGE_POLICY_COLLECTIONS.current).doc(CHARGE_POLICY_DOC_ID);
}

function parse(raw: unknown): ChargePolicyRecord {
  const parsed = ChargePolicyRecordSchema.safeParse(raw);
  if (!parsed.success)
    throw new EditableLayerError(
      "The published charge policy is unreadable; nothing was changed.",
      409,
    );
  return parsed.data;
}

/** The current policy inside a caller's transaction; null when none is published. */
export async function readChargePolicyIn(
  transaction: Transaction,
  db: Firestore,
): Promise<ChargePolicyRecord | null> {
  const snapshot = await transaction.get(chargePolicyRef(db));
  return snapshot.exists ? parse(snapshot.data()) : null;
}

/** Never throws: an unreadable policy is reported as such and calculates nothing. */
export async function readChargePolicy(
  db: Firestore = getAdminFirestore(),
): Promise<{ readable: boolean; record: ChargePolicyRecord | null }> {
  try {
    const snapshot = await chargePolicyRef(db).get();
    return { readable: true, record: snapshot.exists ? parse(snapshot.data()) : null };
  } catch {
    return { readable: false, record: null };
  }
}

export async function publishChargePolicy(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<{ record: ChargePolicyRecord; duplicate: boolean }> {
  assertMutationAllowed(requireEnvironmentDescriptor());
  if (!can(actor.role, "manageAdmin") || isVerificationAccount(actor))
    throw new EditableLayerError("An Admin publishes the renewal charge policy.", 403);
  const parsed = PublishChargePolicyInputSchema.safeParse(raw);
  if (!parsed.success)
    throw new EditableLayerError(
      parsed.error.issues[0]?.message ?? "The charge policy is not valid.",
      400,
    );
  const input = parsed.data;
  // The current policy prices every packet from the moment it is published, so it never names a
  // later day: a version dated in the future would apply early.
  if (input.effectiveFrom > businessDateIso(now))
    throw new EditableLayerError(
      "Choose an effective date on or before today. A charge policy is used from the day it is published.",
      400,
    );
  const requestHash = hashExecutionPreview({
    actorUid: actor.uid,
    action: "charge_policy_publish",
    content: input.content,
    effectiveFrom: input.effectiveFrom,
    note: input.note ?? null,
    expectedVersion: input.expectedVersion,
  });
  const audit = db.collection(CHARGE_POLICY_COLLECTIONS.activity).doc(input.operationId);
  return db.runTransaction(async (transaction) => {
    const [current, previous] = await Promise.all([
      readChargePolicyIn(transaction, db),
      transaction.get(audit),
    ]);
    if (previous.exists) {
      if (previous.get("request_hash") !== requestHash)
        throw new EditableLayerError(
          "This publication differs from the one first sent. Reload and publish again.",
          409,
        );
      if (!current) throw new EditableLayerError("The charge policy is missing.", 409);
      return { record: current, duplicate: true };
    }
    if ((current?.version ?? 0) !== input.expectedVersion)
      throw new EditableLayerError(
        "The charge policy changed since the page was loaded. Reload before publishing.",
        409,
      );
    const record = ChargePolicyRecordSchema.parse({
      schemaVersion: CHARGE_POLICY_SCHEMA_VERSION,
      version: (current?.version ?? 0) + 1,
      effectiveFrom: input.effectiveFrom,
      content: input.content,
      ...(input.note ? { note: input.note } : {}),
      publishedAt: now,
      publishedByUid: actor.uid,
    });
    transaction.create(
      db.collection(CHARGE_POLICY_COLLECTIONS.versions).doc(`v${record.version}`),
      record,
    );
    transaction.set(chargePolicyRef(db), record);
    transaction.create(audit, {
      action: "charge_policy_published",
      actor_uid: actor.uid,
      created_at: now,
      request_hash: requestHash,
      version: record.version,
    });
    return { record, duplicate: false };
  });
}
