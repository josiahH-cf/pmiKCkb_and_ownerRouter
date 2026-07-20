// F-TMPL-2/F-TMPL-6: read APPROVED, active templates from the editable store so composers and process
// copy draw their wording from a governed, in-app-editable record rather than a hard-coded constant.
// Server-only (getTemplate/listTemplates reach firebase-admin). Every caller keeps a built-in fallback
// (sample patterns / base copy), so an empty store or a scope denial degrades safely to the shipped
// default instead of failing the surface.

import type { Firestore } from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { getTemplate, listTemplates } from "@/lib/firestore/editable";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { TemplateRecord } from "@/lib/firestore/types";

/** Locate an Approved template either by its id or by (space + case-insensitive name). */
export type ApprovedTemplateQuery =
  | { templateId: string }
  | { spaceId: string; name: string };

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Resolve a single Approved, active template, or null when none matches. A 404 (unknown / soft-deleted /
 * Draft-only id, or no Approved record in the Space) resolves to null so the caller falls back; a scope
 * denial (AuthError) or any other error propagates rather than silently masking a real failure.
 */
export async function getApprovedTemplate(
  actor: AuthenticatedUser,
  query: ApprovedTemplateQuery,
  db: Firestore = getAdminFirestore(),
): Promise<TemplateRecord | null> {
  if ("templateId" in query) {
    try {
      const record = await getTemplate(actor, query.templateId, db);
      return record.status === "Approved" ? record : null;
    } catch (error) {
      if (error instanceof EditableLayerError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  const wanted = normalizeName(query.name);
  const records = await listTemplates(actor, query.spaceId, db);
  return (
    records.find(
      (record) => record.status === "Approved" && normalizeName(record.name) === wanted,
    ) ?? null
  );
}
