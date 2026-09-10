import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import type { Firestore } from "firebase-admin/firestore";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  SaveRenewalResourceSchema,
  RenewalResourceSettingsSchema,
  type RenewalResourceSettings,
} from "@/lib/lease-renewal/resource-locations";
export const RENEWAL_RESOURCE_COLLECTIONS = {
  settings: "renewal_resource_locations",
  activity: "renewal_resource_location_activity",
} as const;
export async function getRenewalResourceLocations(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalResourceSettings> {
  if (!can(actor.role, "read"))
    throw new EditableLayerError("Renewal read access is required.", 403);
  const snapshot = await db
    .collection(RENEWAL_RESOURCE_COLLECTIONS.settings)
    .doc("current")
    .get();
  return snapshot.exists
    ? RenewalResourceSettingsSchema.parse(snapshot.data())
    : { version: 0, entries: {} };
}
/** Admin setting, exact version, idempotent request and immutable private history; no network fetch. */
export async function saveRenewalResourceLocation(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
) {
  if (isVerificationAccount(actor) || !can(actor.role, "manageAdmin"))
    throw new EditableLayerError(
      "An Admin maintains shared renewal resource links.",
      403,
    );
  assertMutationAllowed(requireEnvironmentDescriptor());
  const input = SaveRenewalResourceSchema.parse(raw),
    requestHash = hashExecutionPreview({ actorUid: actor.uid, ...input });
  const ref = db.collection(RENEWAL_RESOURCE_COLLECTIONS.settings).doc("current");
  const audit = db
    .collection(RENEWAL_RESOURCE_COLLECTIONS.activity)
    .doc(input.operationId);
  const duplicate = await db.runTransaction(async (transaction) => {
    const [snapshot, previousRequest] = await Promise.all([
      transaction.get(ref),
      transaction.get(audit),
    ]);
    if (previousRequest.exists) {
      if (previousRequest.get("request_hash") !== requestHash)
        throw new EditableLayerError(
          "This saved-link request changed. Reload the current settings.",
          409,
        );
      return true;
    }
    const current = snapshot.exists
      ? RenewalResourceSettingsSchema.parse(snapshot.data())
      : { version: 0, entries: {} };
    if (current.version !== input.expectedVersion)
      throw new EditableLayerError(
        "Another operator changed the links. Reload before saving.",
        409,
      );
    const now = new Date().toISOString();
    const entry = { ...input.resource, recordedByUid: actor.uid, recordedAt: now };
    transaction.set(ref, {
      version: current.version + 1,
      entries: { ...current.entries, [entry.id]: entry },
    });
    transaction.create(audit, {
      actor_uid: actor.uid,
      recorded_at: now,
      request_hash: requestHash,
      resource_id: entry.id,
      prior: current.entries[entry.id] ?? null,
      next: entry,
      version: current.version + 1,
    });
    return false;
  });
  return { settings: await getRenewalResourceLocations(actor, db), duplicate };
}
