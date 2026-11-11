// S264 (R-S264-1, AC-S264-1): the Admin-kept offer charge mappings.
//
// Server-only data behind the existing Admin route guard: Admin (manageAdmin) saves, renewal
// staff read. Each save is a compare-and-save against the version the page reviewed: a stale
// version is refused, an operation id makes a retry return the first result, and every saved set
// is a new immutable version with its approval evidence, read back from the store. Saving changes
// no lease's saved selection, message, RentVine charge or packet policy; the tenant offers that
// read a changed mapping ask for review again.

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
import {
  OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
  OfferChargeMappingRecordSchema,
  SaveOfferChargeMappingsSchema,
  type OfferChargeMappingRecord,
  type OfferChargeMappingsRead,
} from "@/lib/lease-renewal/offer-charge-mapping";

export const OFFER_CHARGE_MAPPING_COLLECTIONS = {
  current: "renewal_offer_charge_mappings",
  versions: "renewal_offer_charge_mapping_versions",
  activity: "renewal_offer_charge_mapping_activity",
} as const;
export const OFFER_CHARGE_MAPPING_DOC_ID = "current";

export function offerChargeMappingsRef(db: Firestore) {
  return db
    .collection(OFFER_CHARGE_MAPPING_COLLECTIONS.current)
    .doc(OFFER_CHARGE_MAPPING_DOC_ID);
}

function parse(raw: unknown): OfferChargeMappingRecord {
  const parsed = OfferChargeMappingRecordSchema.safeParse(raw);
  if (!parsed.success)
    throw new EditableLayerError(
      "The saved offer charge mappings are unreadable; nothing was changed.",
      409,
    );
  return parsed.data;
}

/** The current mappings inside a caller's transaction; null when none are saved. */
export async function readOfferChargeMappingsIn(
  transaction: Transaction,
  db: Firestore,
): Promise<OfferChargeMappingRecord | null> {
  const snapshot = await transaction.get(offerChargeMappingsRef(db));
  return snapshot.exists ? parse(snapshot.data()) : null;
}

/** The current version inside a caller's transaction: 0 when none, null when unreadable. */
export async function offerChargeMappingVersionIn(
  transaction: Transaction,
  db: Firestore,
): Promise<number | null> {
  try {
    return (await readOfferChargeMappingsIn(transaction, db))?.version ?? 0;
  } catch {
    return null;
  }
}

/** Never throws: an unreadable store reads as unreadable and maps nothing. */
export async function readOfferChargeMappings(
  db: Firestore = getAdminFirestore(),
): Promise<OfferChargeMappingsRead> {
  try {
    const snapshot = await offerChargeMappingsRef(db).get();
    return { readable: true, record: snapshot.exists ? parse(snapshot.data()) : null };
  } catch {
    return { readable: false, record: null };
  }
}

/** One immutable saved version, for readback and for an earlier offer's review. */
export async function readOfferChargeMappingVersion(
  version: number,
  db: Firestore = getAdminFirestore(),
): Promise<OfferChargeMappingRecord | null> {
  const snapshot = await db
    .collection(OFFER_CHARGE_MAPPING_COLLECTIONS.versions)
    .doc(`v${version}`)
    .get();
  return snapshot.exists ? parse(snapshot.data()) : null;
}

export async function saveOfferChargeMappings(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<{ record: OfferChargeMappingRecord; duplicate: boolean }> {
  assertMutationAllowed(requireEnvironmentDescriptor());
  if (!can(actor.role, "manageAdmin") || isVerificationAccount(actor))
    throw new EditableLayerError("An Admin saves the offer charge mappings.", 403);
  const parsed = SaveOfferChargeMappingsSchema.safeParse(raw);
  if (!parsed.success)
    throw new EditableLayerError(
      parsed.error.issues[0]?.message ?? "The offer charge mappings are not valid.",
      400,
    );
  const input = parsed.data;
  const requestHash = hashExecutionPreview({
    actorUid: actor.uid,
    action: "offer_charge_mappings_save",
    entries: input.entries,
    note: input.note ?? null,
    expectedVersion: input.expectedVersion,
  });
  const audit = db
    .collection(OFFER_CHARGE_MAPPING_COLLECTIONS.activity)
    .doc(input.operationId);
  const result = await db.runTransaction(async (transaction) => {
    const [current, previous] = await Promise.all([
      readOfferChargeMappingsIn(transaction, db),
      transaction.get(audit),
    ]);
    if (previous.exists) {
      if (previous.get("request_hash") !== requestHash)
        throw new EditableLayerError(
          "This save differs from the one first sent. Reload and review the mappings again.",
          409,
        );
      if (!current)
        throw new EditableLayerError("The offer charge mappings are missing.", 409);
      return { record: current, duplicate: true };
    }
    if ((current?.version ?? 0) !== input.expectedVersion)
      throw new EditableLayerError(
        "The offer charge mappings changed since you reviewed them. Reload, review the current version and save again.",
        409,
      );
    const record = OfferChargeMappingRecordSchema.parse({
      schemaVersion: OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
      version: (current?.version ?? 0) + 1,
      entries: input.entries,
      ...(input.note ? { note: input.note } : {}),
      updatedAt: now,
      updatedByUid: actor.uid,
    });
    transaction.create(
      db.collection(OFFER_CHARGE_MAPPING_COLLECTIONS.versions).doc(`v${record.version}`),
      record,
    );
    transaction.set(offerChargeMappingsRef(db), record);
    // The activity keeps who saved which version and when, with counts only.
    transaction.create(audit, {
      action: "offer_charge_mappings_saved",
      actor_uid: actor.uid,
      created_at: now,
      request_hash: requestHash,
      version: record.version,
      entries: record.entries.length,
    });
    return { record, duplicate: false };
  });
  // Readback: the immutable version this save wrote, read again from the store.
  const readback = await readOfferChargeMappingVersion(result.record.version, db).catch(
    () => null,
  );
  if (
    !readback ||
    hashExecutionPreview({ entries: readback.entries }) !==
      hashExecutionPreview({ entries: result.record.entries })
  )
    throw new EditableLayerError(
      "The offer charge mappings were saved but did not read back as saved. Reload to see the current version.",
      409,
    );
  return { record: readback, duplicate: result.duplicate };
}
