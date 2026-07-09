// Self-scoped per-user notification preferences (console overhaul Slice 3b). One document per user
// (doc id = uid) in `user_notification_preferences`, holding which AVAILABLE families the user has
// muted. Email is hard-off: `email_enabled` is the literal-false type, never settable true, and there
// is no email channel anywhere in this framework.
//
// GOVERNANCE: app-plane bookkeeping. A user reads and writes ONLY their own record (the writer always
// targets doc id = actor.uid), and `firestore.rules` denies every client write, so preferences are
// server-written through the Admin SDK boundary. Timestamps are ISO strings (no serverTimestamp) so
// the writer is deterministic and unit-testable.

import type { Firestore } from "firebase-admin/firestore";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { UpdateNotificationPreferencesInputSchema } from "@/lib/firestore/schemas";
import type { UpdateNotificationPreferencesInput } from "@/lib/firestore/schemas";
import {
  isAvailableNotificationFamily,
  type NotificationFamilyKey,
} from "@/lib/notifications/families";

const COLLECTION = "user_notification_preferences";

export interface NotificationPreferencesRecord {
  uid: string;
  muted_families: NotificationFamilyKey[];
  /** Literal false: in-app-only framework, email stays hard-off and is never settable true. */
  email_enabled: false;
  created_at?: string;
  updated_at?: string;
}

export async function getNotificationPreferences(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<NotificationPreferencesRecord> {
  assertCan(actor, "read");
  const snapshot = await db.collection(COLLECTION).doc(actor.uid).get();

  if (!snapshot.exists) {
    return { uid: actor.uid, muted_families: [], email_enabled: false };
  }

  const record = readRecord<NotificationPreferencesRecord>(snapshot.id, snapshot.data()!);
  return {
    ...record,
    uid: actor.uid,
    email_enabled: false,
    muted_families: onlyAvailable(record.muted_families),
  };
}

export async function updateNotificationPreferences(
  actor: AuthenticatedUser,
  input: UpdateNotificationPreferencesInput,
  db: Firestore = getAdminFirestore(),
): Promise<NotificationPreferencesRecord> {
  assertCan(actor, "read");
  const parsed = UpdateNotificationPreferencesInputSchema.parse(input);
  const ref = db.collection(COLLECTION).doc(actor.uid);
  const existingSnapshot = await ref.get();
  const now = nowIso();
  const existing = existingSnapshot.exists
    ? readRecord<NotificationPreferencesRecord>(
        existingSnapshot.id,
        existingSnapshot.data()!,
      )
    : null;

  const record: NotificationPreferencesRecord = {
    uid: actor.uid,
    muted_families: onlyAvailable(parsed.muted_families),
    email_enabled: false,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  await ref.set(record);
  return record;
}

// Keep only available (mutable) family keys, deduped. A mute request for a stubbed Gmail-dependent
// family is dropped: those families carry no notifications, so muting them is meaningless.
function onlyAvailable(
  families: readonly NotificationFamilyKey[] | undefined,
): NotificationFamilyKey[] {
  return [...new Set(families ?? [])].filter(isAvailableNotificationFamily);
}

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for notification preferences.",
      403,
    );
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function readRecord<T>(id: string, data: Record<string, unknown>): T {
  return normalizeFirestoreValue({ ...data, id }) as T;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      return (toDate.call(value) as Date).toISOString();
    }
  }
  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeFirestoreValue(child)]),
    );
  }
  return value;
}
