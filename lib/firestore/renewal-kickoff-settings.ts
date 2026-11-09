// Historical S249 automatic preparation setting and audit. The November 9 click-only
// contract retains the saved configuration and its history for readback. The active
// route reports preparation disabled and refuses setting changes.

import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";

export const KICKOFF_SETTINGS_COLLECTION = "app_settings";
export const KICKOFF_AUTOMATIC_START_DOC = "renewal_kickoff_automatic_start";
/** One row per saved change of the automatic-start setting (G). */
export const KICKOFF_SETTING_AUDIT_COLLECTION = "renewal_kickoff_setting_audit";

export interface KickoffSettingAuditRow {
  readonly setting: typeof KICKOFF_AUTOMATIC_START_DOC;
  readonly action: "changed";
  readonly actorUid: string;
  readonly actorEmail: string;
  readonly at: string;
  readonly reason: string;
  readonly before: { readonly enabled: boolean; readonly version: number };
  readonly after: { readonly enabled: boolean; readonly version: number };
}

/** The historical November 5 default, used only to report the retired setting. */
export const KICKOFF_AUTOMATIC_START_DEFAULT = true;

export interface KickoffAutomaticStartSetting {
  readonly enabled: boolean;
  /** 0 while nothing is saved: the shipped default applies. */
  readonly version: number;
  readonly updatedAt: string | null;
  readonly updatedByUid: string | null;
  readonly reason: string | null;
}

function settingOf(
  data: Record<string, unknown> | undefined,
): KickoffAutomaticStartSetting {
  if (!data || typeof data.enabled !== "boolean")
    return {
      enabled: KICKOFF_AUTOMATIC_START_DEFAULT,
      version: 0,
      updatedAt: null,
      updatedByUid: null,
      reason: null,
    };
  return {
    enabled: data.enabled,
    version: Number.isInteger(data.version) ? Number(data.version) : 0,
    updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
    updatedByUid: typeof data.updated_by === "string" ? data.updated_by : null,
    reason: typeof data.reason === "string" ? data.reason : null,
  };
}

export async function readKickoffAutomaticStart(
  db: Firestore = getAdminFirestore(),
): Promise<KickoffAutomaticStartSetting> {
  const snap = await db
    .collection(KICKOFF_SETTINGS_COLLECTION)
    .doc(KICKOFF_AUTOMATIC_START_DOC)
    .get();
  return settingOf(snap.exists ? snap.data() : undefined);
}

/** Historical Admin transaction, retained for verification of the saved setting and audit. */
export async function saveKickoffAutomaticStart(
  actor: AuthenticatedUser,
  input: {
    readonly enabled: boolean;
    readonly expectedVersion: number;
    readonly reason: string;
    readonly nowIso?: string;
  },
  db: Firestore = getAdminFirestore(),
): Promise<KickoffAutomaticStartSetting> {
  if (
    actor.role !== "Admin" ||
    !can(actor.role, "manageAdmin") ||
    isVerificationAccount(actor)
  )
    throw new EditableLayerError(
      "Only an Admin changes the automatic preparation setting.",
      403,
    );
  const reason = input.reason.trim();
  if (!reason || reason.length > 500 || /[\u0000-\u001f\u007f]/.test(reason))
    throw new EditableLayerError(
      "Say in one line why the setting changes (500 characters at most).",
      400,
    );
  const ref = db.collection(KICKOFF_SETTINGS_COLLECTION).doc(KICKOFF_AUTOMATIC_START_DOC);
  const auditRef = db.collection(KICKOFF_SETTING_AUDIT_COLLECTION).doc(uuidv7());
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = settingOf(snap.exists ? snap.data() : undefined);
    if (current.version !== input.expectedVersion)
      throw new EditableLayerError(
        "The setting changed since it was shown. Read it again before changing it.",
        409,
      );
    const at = input.nowIso ?? new Date().toISOString();
    const next = {
      enabled: input.enabled,
      version: current.version + 1,
      updated_at: at,
      updated_by: actor.uid,
      reason,
    };
    tx.set(ref, next);
    // G: the change and its history row commit together, or neither does.
    const row: KickoffSettingAuditRow = {
      setting: KICKOFF_AUTOMATIC_START_DOC,
      action: "changed",
      actorUid: actor.uid,
      actorEmail: actor.email.toLowerCase(),
      at,
      reason,
      before: { enabled: current.enabled, version: current.version },
      after: { enabled: next.enabled, version: next.version },
    };
    tx.create(auditRef, row);
    return settingOf(next);
  });
}

/** The setting's change history, newest first, bounded. Reads only. */
export async function listKickoffSettingHistory(
  limit = 20,
  db: Firestore = getAdminFirestore(),
): Promise<KickoffSettingAuditRow[]> {
  const rows = await db
    .collection(KICKOFF_SETTING_AUDIT_COLLECTION)
    .orderBy("at", "desc")
    .limit(Math.max(1, Math.min(100, limit)))
    .get();
  return rows.docs.map((row) => row.data() as KickoffSettingAuditRow);
}
