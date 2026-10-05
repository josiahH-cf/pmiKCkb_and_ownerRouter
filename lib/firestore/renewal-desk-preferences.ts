// S166: the signed-in account's remembered Renewals worklist view. One document per account in
// `renewal_desk_preferences`, holding only the canonical desk query string the desk already puts in
// its own URLs ("" for the default view), with the typed search keys removed first, so no name,
// address or label is stored.
//
// GOVERNANCE: app-plane bookkeeping. The reader and the writer always target the calling account's
// own document (the key is derived from the session uid, never from a request), a document that
// names another account is never returned, and `firestore.rules` denies every client read and
// write through its catch-all, so the value is reachable only through the Admin SDK boundary. A
// verification account stays effect-free: its write is refused. Nothing here gates a lease.

import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  allowsMutation,
  resolveEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  RENEWAL_DESK_PREFERENCE_SCHEMA_VERSION,
  canonicalDeskPreferenceView,
  revalidateStoredDeskView,
  type DeskPreferenceMode,
} from "@/lib/lease-renewal/desk-preferences";
import { DESK_VIEW_MAX_CODE_UNITS } from "@/lib/lease-renewal/desk-view-continuation";

export const RENEWAL_DESK_PREFERENCE_COLLECTION = "renewal_desk_preferences";

export type { DeskPreferenceMode };

export const DESK_PREFERENCE_VERIFICATION_MESSAGE =
  "The worklist view is not saved for verification accounts.";

export const SaveRenewalDeskPreferenceSchema = z
  .object({
    query: z.string().max(DESK_VIEW_MAX_CODE_UNITS),
    expectedRevision: z.number().int().min(0),
  })
  .strict();
export type SaveRenewalDeskPreferenceInput = z.input<
  typeof SaveRenewalDeskPreferenceSchema
>;

const StoredPreferenceSchema = z
  .object({
    schemaVersion: z.literal(RENEWAL_DESK_PREFERENCE_SCHEMA_VERSION),
    uid: z.string().min(1),
    view: z.string().max(DESK_VIEW_MAX_CODE_UNITS),
    updatedAt: z.string().datetime(),
    revision: z.number().int().min(0).optional(),
  })
  .strict();

export interface RenewalDeskPreference {
  /** Canonical desk query; "" is the default view chosen deliberately. */
  readonly view: string;
  readonly updatedAt: string;
  readonly revision: number;
}

/** The account's own document key. A uid is never used as a path segment directly. */
export function renewalDeskPreferenceDocId(uid: string): string {
  return createHash("sha256").update(`renewal-desk-preference:${uid}`).digest("hex");
}

function assertReader(actor: AuthenticatedUser) {
  if (!actor.uid || !can(actor.role, "read"))
    throw new EditableLayerError("Renewal workspace read access is required.", 403);
}

/**
 * The calling account's remembered view, or null when there is none or the stored value no longer
 * validates. A damaged or retired value is never an error and is never rewritten by a read.
 */
export async function getRenewalDeskPreference(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalDeskPreference | null> {
  assertReader(actor);
  const snapshot = await db
    .collection(RENEWAL_DESK_PREFERENCE_COLLECTION)
    .doc(renewalDeskPreferenceDocId(actor.uid))
    .get();
  if (!snapshot.exists) return null;
  const parsed = StoredPreferenceSchema.safeParse(snapshot.data());
  if (!parsed.success || parsed.data.uid !== actor.uid) return null;
  const view = revalidateStoredDeskView(parsed.data.view);
  return view === null
    ? null
    : { view, updatedAt: parsed.data.updatedAt, revision: parsed.data.revision ?? 0 };
}

/**
 * Remember one deliberate worklist view for the calling account, replacing its previous one.
 * `query` is a version 2 desk query; `v=2` alone remembers the default view (the reset).
 */
export async function saveRenewalDeskPreference(
  actor: AuthenticatedUser,
  input: SaveRenewalDeskPreferenceInput,
  db: Firestore = getAdminFirestore(),
  now: () => Date = () => new Date(),
): Promise<RenewalDeskPreference> {
  assertReader(actor);
  if (isVerificationAccount(actor))
    throw new EditableLayerError(DESK_PREFERENCE_VERIFICATION_MESSAGE, 403);
  const parsed = SaveRenewalDeskPreferenceSchema.safeParse(input);
  const view = parsed.success ? canonicalDeskPreferenceView(parsed.data.query) : null;
  if (view === null)
    throw new EditableLayerError(
      "Choose a worklist view to remember. Nothing was changed.",
      400,
    );
  const updatedAt = now().toISOString();
  const ref = db
    .collection(RENEWAL_DESK_PREFERENCE_COLLECTION)
    .doc(renewalDeskPreferenceDocId(actor.uid));
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = StoredPreferenceSchema.safeParse(
      snapshot.exists ? snapshot.data() : null,
    );
    if (snapshot.exists && (!current.success || current.data.uid !== actor.uid))
      throw new EditableLayerError("The stored view cannot be safely replaced.", 409);
    const revision = current.success ? (current.data.revision ?? 0) : 0;
    if (!parsed.success || parsed.data.expectedRevision !== revision)
      throw new EditableLayerError(
        "This saved view changed in another session. Read it before saving the current view again.",
        409,
      );
    transaction.set(ref, {
      schemaVersion: RENEWAL_DESK_PREFERENCE_SCHEMA_VERSION,
      uid: actor.uid,
      view,
      updatedAt,
      revision: revision + 1,
    });
    return { view, updatedAt, revision: revision + 1 };
  });
}

/**
 * Where this account's worklist view can be remembered. Verification accounts are never saved.
 * The local Live read-only rehearsal refuses the write unless Firestore is a local emulator, so
 * the desk offers no saving there and never attempts a request that would be refused.
 */
export function deskPreferenceModeFor(
  user: Pick<AuthenticatedUser, "email">,
  env: Record<string, string | undefined> = process.env,
): DeskPreferenceMode {
  if (isVerificationAccount(user)) return "verification";
  const environment = resolveEnvironmentDescriptor(env);
  if (!environment.ok) return "unavailable";
  if (!allowsMutation(environment.descriptor) && !env.FIRESTORE_EMULATOR_HOST?.trim())
    return "unavailable";
  return "saved";
}
