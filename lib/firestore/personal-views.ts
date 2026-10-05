import { createHash } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getRenewalDeskPreference } from "@/lib/firestore/renewal-desk-preferences";
import { withReadDeadline } from "@/lib/observability/read-lifetime";
import {
  DEFAULT_PERSONAL_VIEW,
  PERSONAL_VIEW_VERSION,
  PersonalViewSaveSchema,
  PersonalViewValueSchema,
  canonicalPersonalView,
  type PersonalView,
  type PersonalViewSave,
  type PersonalViewSurface,
} from "@/lib/ui/personal-views";

export const PERSONAL_VIEW_COLLECTION = "personal_views";
// Ninety days after a deliberate save. Reads never extend private-search retention.
// Firestore TTL expires this field; deletion is asynchronous, so reads also enforce the deadline.
export const PERSONAL_VIEW_RETENTION_MS = 90 * 86_400_000;
const stored = z
  .object({
    schemaVersion: z.literal(PERSONAL_VIEW_VERSION),
    uid: z.string().min(1),
    surface: PersonalViewSaveSchema.shape.surface,
    revision: z.number().int().positive(),
    value: PersonalViewValueSchema,
    updatedAt: z.string().datetime(),
    expiresAt: z.instanceof(Timestamp).optional(),
  })
  .strict();
export function personalViewDocId(uid: string, surface: PersonalViewSurface) {
  return createHash("sha256").update(`personal-view:${uid}:${surface}`).digest("hex");
}
function assertReader(actor: AuthenticatedUser, surface: PersonalViewSurface) {
  if (
    !actor.uid ||
    !can(actor.role, "read") ||
    ((surface.startsWith("admin-") ||
      surface === "vendor-lifecycle" ||
      surface === "work-team" ||
      surface === "access-requests") &&
      !can(actor.role, "manageAdmin"))
  )
    throw new EditableLayerError(
      "This personal view is unavailable to this account.",
      403,
    );
}
export async function getPersonalView(
  actor: AuthenticatedUser,
  surface: PersonalViewSurface,
  db: Firestore = getAdminFirestore(),
): Promise<PersonalView> {
  assertReader(actor, surface);
  const snapshot = await withReadDeadline(() =>
    db
      .collection(PERSONAL_VIEW_COLLECTION)
      .doc(personalViewDocId(actor.uid, surface))
      .get(),
  );
  const parsed = stored.safeParse(snapshot.exists ? snapshot.data() : null);
  if (
    parsed.success &&
    parsed.data.uid === actor.uid &&
    parsed.data.surface === surface
  ) {
    const expiresAt =
      parsed.data.expiresAt?.toMillis() ??
      Date.parse(parsed.data.updatedAt) + PERSONAL_VIEW_RETENTION_MS;
    if (expiresAt <= Date.now())
      return {
        surface,
        revision: parsed.data.revision,
        value: structuredClone(DEFAULT_PERSONAL_VIEW),
        updatedAt: null,
      };
    const value = canonicalPersonalView(surface, parsed.data.value);
    if (value)
      return {
        surface,
        revision: parsed.data.revision,
        value,
        updatedAt: parsed.data.updatedAt,
      };
  }
  // Read-only migration of the existing S166 record. Deliberate saving creates v2; reading does not.
  const previous =
    surface === "renewals"
      ? await withReadDeadline(() => getRenewalDeskPreference(actor, db))
      : null;
  const freshPrevious =
    previous && Date.parse(previous.updatedAt) + PERSONAL_VIEW_RETENTION_MS > Date.now()
      ? previous
      : null;
  return {
    surface,
    revision: 0,
    value: freshPrevious
      ? { query: freshPrevious.view, layout: { columns: {} } }
      : structuredClone(DEFAULT_PERSONAL_VIEW),
    updatedAt: freshPrevious?.updatedAt ?? null,
  };
}
export async function savePersonalView(
  actor: AuthenticatedUser,
  input: PersonalViewSave,
  db: Firestore = getAdminFirestore(),
  now = () => new Date(),
): Promise<PersonalView> {
  const parsed = PersonalViewSaveSchema.safeParse(input);
  if (!parsed.success)
    throw new EditableLayerError("The personal view is not valid.", 400);
  const { surface, expectedRevision } = parsed.data;
  assertReader(actor, surface);
  if (isVerificationAccount(actor))
    throw new EditableLayerError(
      "Personal views are not saved for verification accounts.",
      403,
    );
  const value = canonicalPersonalView(surface, parsed.data.value);
  if (!value)
    throw new EditableLayerError("Choose a supported view. Nothing was saved.", 400);
  const ref = db
    .collection(PERSONAL_VIEW_COLLECTION)
    .doc(personalViewDocId(actor.uid, surface));
  const updatedAt = now().toISOString();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = stored.safeParse(snapshot.exists ? snapshot.data() : null);
    if (
      snapshot.exists &&
      (!current.success ||
        current.data.uid !== actor.uid ||
        current.data.surface !== surface)
    )
      throw new EditableLayerError("The stored view cannot be safely replaced.", 409);
    const revision = current.success ? current.data.revision : 0;
    if (revision !== expectedRevision)
      throw new EditableLayerError(
        "This view changed in another session. Your local view is still available; review the latest saved view before saving again.",
        409,
      );
    transaction.set(ref, {
      schemaVersion: PERSONAL_VIEW_VERSION,
      uid: actor.uid,
      surface,
      revision: revision + 1,
      value,
      updatedAt,
      expiresAt: Timestamp.fromMillis(Date.parse(updatedAt) + PERSONAL_VIEW_RETENTION_MS),
    });
    return { surface, revision: revision + 1, value, updatedAt };
  });
}
