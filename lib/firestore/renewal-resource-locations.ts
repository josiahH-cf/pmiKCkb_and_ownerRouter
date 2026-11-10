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
import { canonicalJson, hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  SaveRenewalResourceSchema,
  RenewalResourceSettingsSchema,
  type RenewalResourceSettings,
} from "@/lib/lease-renewal/resource-locations";
import { createHash } from "node:crypto";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import {
  TENANT_RESOURCE_PURPOSES,
  isTenantResourceId,
  readTenantAccess,
  type StoredTenantAccess,
  type TenantAccessInput,
} from "@/lib/lease-renewal/tenant-resource-evidence";

/**
 * S265 (R-S265-1, ARCH-S265-1): the stored tenant audience check for one save. The server binds it
 * to the entry's own purpose and the exact link saved with it. An unchanged re-save keeps the prior
 * proof; any change (or a new link) is a new proof whose id comes from this save and whose version
 * is the settings version it is recorded at, so a proof identity never repeats.
 */
function storedTenantAccess(
  input: {
    id: string;
    url: string;
    tenantAccess?: TenantAccessInput | null;
  },
  prior: unknown,
  operationId: string,
  settingsVersion: number,
): StoredTenantAccess | undefined {
  if (!input.tenantAccess || !isTenantResourceId(input.id)) return undefined;
  const content = {
    purpose: TENANT_RESOURCE_PURPOSES[input.id],
    destination: input.url,
    ...input.tenantAccess,
  };
  const previous = readTenantAccess(
    prior && typeof prior === "object"
      ? (prior as { id: string; url: string; verified: boolean; tenantAccess?: unknown })
      : null,
  );
  if (previous && previous !== "invalid") {
    const { proof, ...rest } = previous;
    if (canonicalJson(rest) === canonicalJson(content)) return { ...content, proof };
  }
  return {
    ...content,
    proof: {
      id: createHash("sha256")
        .update(`${input.id}:${operationId}`)
        .digest("hex")
        .slice(0, 32),
      version: settingsVersion,
    },
  };
}
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
  if (
    input.resource.tenantAccess &&
    input.resource.tenantAccess.checkedOn > businessDateIso(Date.now())
  )
    throw new EditableLayerError("The check date cannot be later than today.", 400);
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
    const { tenantAccess: _check, ...resource } = input.resource;
    void _check;
    const tenantAccess = storedTenantAccess(
      input.resource,
      current.entries[resource.id],
      input.operationId,
      current.version + 1,
    );
    const entry = {
      ...resource,
      recordedByUid: actor.uid,
      recordedAt: now,
      ...(tenantAccess ? { tenantAccess } : {}),
    };
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
