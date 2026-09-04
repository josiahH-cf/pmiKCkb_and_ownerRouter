// S106: the app-owned Dotloop renewal selection — one current record naming the exact profile and
// renewal template by their stable provider ids.
//
// Display names are stored only as labels for the operator; the selection itself is the id pair, so
// a later rename in Dotloop cannot silently change which template a renewal packet uses. The record
// is Admin-gated, versioned, and append-only audited. It holds no token and no customer value.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";

export const DOTLOOP_RENEWAL_SETTINGS_COLLECTIONS = {
  settings: "dotloop_renewal_settings",
  activity: "dotloop_renewal_settings_activity",
} as const;

/** One current record; the id is fixed so a second selection replaces rather than forks it. */
export const DOTLOOP_RENEWAL_SETTINGS_DOC_ID = "current";

const ProviderId = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "A provider id must be an exact stable token.");

export const SelectDotloopRenewalSettingsInputSchema = z
  .object({
    profile_id: ProviderId,
    profile_label: z.string().trim().min(1).max(200),
    template_id: ProviderId,
    template_label: z.string().trim().min(1).max(200),
  })
  .strict();

export type SelectDotloopRenewalSettingsInput = z.input<
  typeof SelectDotloopRenewalSettingsInputSchema
>;

export interface DotloopRenewalSettings {
  readonly version: number;
  readonly profileId: string;
  readonly profileLabel: string;
  readonly templateId: string;
  readonly templateLabel: string;
  readonly recordedAtIso: string;
  readonly recordedByUid: string;
}

function assertAdmin(actor: AuthenticatedUser): void {
  if (!can(actor.role, "manageAdmin")) {
    throw new EditableLayerError(
      "Admin authority is required to choose the Dotloop renewal profile and template.",
      403,
    );
  }
}

function assertReader(actor: AuthenticatedUser): void {
  if (!can(actor.role, "read")) {
    throw new EditableLayerError(
      "Read access is required to view the Dotloop renewal selection.",
      403,
    );
  }
}

export async function selectDotloopRenewalSettings(
  actor: AuthenticatedUser,
  input: SelectDotloopRenewalSettingsInput,
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<DotloopRenewalSettings> {
  assertAdmin(actor);
  const parsed = SelectDotloopRenewalSettingsInputSchema.parse(input);
  const ref = db
    .collection(DOTLOOP_RENEWAL_SETTINGS_COLLECTIONS.settings)
    .doc(DOTLOOP_RENEWAL_SETTINGS_DOC_ID);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.data() ?? {};
    const version = Number(previous.version ?? 0) + 1;
    const body = {
      id: DOTLOOP_RENEWAL_SETTINGS_DOC_ID,
      version,
      profile_id: parsed.profile_id,
      profile_label: parsed.profile_label,
      template_id: parsed.template_id,
      template_label: parsed.template_label,
      recorded_at: now,
      recorded_by_uid: actor.uid,
    };
    transaction.set(ref, body);

    const activityId = uuidv7();
    transaction.set(
      db.collection(DOTLOOP_RENEWAL_SETTINGS_COLLECTIONS.activity).doc(activityId),
      {
        id: activityId,
        version,
        previous_profile_id: previous.profile_id ?? null,
        previous_template_id: previous.template_id ?? null,
        profile_id: parsed.profile_id,
        template_id: parsed.template_id,
        actor_uid: actor.uid,
        recorded_at: now,
        created_at: FieldValue.serverTimestamp(),
      },
    );
    return fromStored(body);
  });
}

export async function getDotloopRenewalSettings(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<DotloopRenewalSettings | null> {
  assertReader(actor);
  const snapshot = await db
    .collection(DOTLOOP_RENEWAL_SETTINGS_COLLECTIONS.settings)
    .doc(DOTLOOP_RENEWAL_SETTINGS_DOC_ID)
    .get();
  if (!snapshot.exists) return null;
  return fromStored(snapshot.data()!);
}

function fromStored(raw: Record<string, unknown>): DotloopRenewalSettings {
  return {
    version: Number(raw.version),
    profileId: String(raw.profile_id),
    profileLabel: String(raw.profile_label),
    templateId: String(raw.template_id),
    templateLabel: String(raw.template_label),
    recordedAtIso: String(raw.recorded_at),
    recordedByUid: String(raw.recorded_by_uid),
  };
}
