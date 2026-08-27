// Admin-owned rehearsal-Sheet configuration (I03 / S76). This stores only the spreadsheet
// identifier and audit metadata; it never reads Sheet contents and never runs the copy proof.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  canonicalizeSpreadsheetIdentifier,
  resolveRenewalSheetBindings,
  sheetLink,
  type RenewalSheetLink,
} from "@/lib/lease-renewal/rehearsal-sheet";

export const RENEWAL_REHEARSAL_SHEET_CONFIG_COLLECTION = "renewal_rehearsal_sheet_config";
export const RENEWAL_REHEARSAL_SHEET_CONFIG_ACTIVITY_COLLECTION =
  "renewal_rehearsal_sheet_config_activity";
const DOC_ID = "active";

export const UpdateRenewalRehearsalSheetConfigInputSchema = z
  .object({ spreadsheet: z.string().trim().min(1).max(500) })
  .strict();

export interface RenewalRehearsalSheetAdminConfig {
  operating: RenewalSheetLink;
  rehearsal:
    | { status: "not_configured"; configured: false }
    | {
        status: "ready";
        configured: true;
        spreadsheetId: string;
        url: string;
        source: "saved" | "environment";
        updatedAt?: string;
        updatedByUid?: string;
      };
}

function assertAdmin(actor: AuthenticatedUser): void {
  if (!can(actor.role, "manageAdmin")) {
    throw new EditableLayerError(
      "Only Admins can view or change the rehearsal Sheet configuration.",
      403,
    );
  }
}

export async function readRenewalRehearsalSheetAdminConfig(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
  env: Record<string, string | undefined> = process.env,
): Promise<RenewalRehearsalSheetAdminConfig> {
  assertAdmin(actor);
  const bindings = resolveRenewalSheetBindings(env);
  const snapshot = await db
    .collection(RENEWAL_REHEARSAL_SHEET_CONFIG_COLLECTION)
    .doc(DOC_ID)
    .get();
  const saved = snapshot.data();
  const savedId =
    typeof saved?.spreadsheet_id === "string"
      ? canonicalizeSpreadsheetIdentifier(saved.spreadsheet_id)
      : null;

  if (savedId && savedId !== bindings.operating.spreadsheetId) {
    const link = sheetLink(savedId);
    const updatedAt = toIso(saved?.updated_at);
    return {
      operating: bindings.operating,
      rehearsal: {
        status: "ready",
        configured: true,
        spreadsheetId: savedId,
        url: link.url!,
        source: "saved",
        ...(updatedAt ? { updatedAt } : {}),
        ...(typeof saved?.updated_by_uid === "string"
          ? { updatedByUid: saved.updated_by_uid }
          : {}),
      },
    };
  }

  if (bindings.rehearsal.status === "ready") {
    return {
      operating: bindings.operating,
      rehearsal: { ...bindings.rehearsal, source: "environment" },
    };
  }
  return {
    operating: bindings.operating,
    rehearsal: { status: "not_configured", configured: false },
  };
}

export async function updateRenewalRehearsalSheetAdminConfig(
  actor: AuthenticatedUser,
  input: z.input<typeof UpdateRenewalRehearsalSheetConfigInputSchema>,
  db: Firestore = getAdminFirestore(),
  env: Record<string, string | undefined> = process.env,
): Promise<RenewalRehearsalSheetAdminConfig> {
  assertAdmin(actor);
  const parsed = UpdateRenewalRehearsalSheetConfigInputSchema.parse(input);
  const spreadsheetId = canonicalizeSpreadsheetIdentifier(parsed.spreadsheet);
  if (!spreadsheetId) {
    throw new EditableLayerError(
      "Paste a valid Google Sheet URL or spreadsheet ID.",
      400,
    );
  }

  const operating = resolveRenewalSheetBindings(env).operating;
  if (!operating.configured || !operating.spreadsheetId) {
    throw new EditableLayerError(
      "The operating Sheet is not configured, so copy separation cannot be verified.",
      409,
    );
  }
  if (spreadsheetId === operating.spreadsheetId) {
    throw new EditableLayerError(
      "The rehearsal copy must be different from the operating Sheet.",
      409,
    );
  }

  const configRef = db.collection(RENEWAL_REHEARSAL_SHEET_CONFIG_COLLECTION).doc(DOC_ID);
  const activityRef = db
    .collection(RENEWAL_REHEARSAL_SHEET_CONFIG_ACTIVITY_COLLECTION)
    .doc(uuidv7());
  await db.runTransaction(async (transaction) => {
    transaction.set(configRef, {
      spreadsheet_id: spreadsheetId,
      updated_at: FieldValue.serverTimestamp(),
      updated_by_uid: actor.uid,
    });
    transaction.create(activityRef, {
      action: "configured",
      spreadsheet_id: spreadsheetId,
      actor_uid: actor.uid,
      created_at: FieldValue.serverTimestamp(),
    });
  });

  return readRenewalRehearsalSheetAdminConfig(actor, db, env);
}

function toIso(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") return toDate.call(value).toISOString();
  }
  return undefined;
}
