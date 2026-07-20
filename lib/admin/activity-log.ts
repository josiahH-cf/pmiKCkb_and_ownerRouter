// LR-02 (admin-audit): surface the append-only role/scope audit trail in-app. The writers already
// record every privilege change to admin_role_changes / admin_scope_changes, but the reader functions
// had no non-test callers, so the trail was viewable only through the Firestore console. This composes
// the two collections into one newest-first "who changed whose access, and why" list for the Admin page.
//
// Server-only (the list readers reach the Admin SDK). The merge is a pure function so it is fully
// unit-testable without Firestore. No write, no send.

import type { Firestore } from "firebase-admin/firestore";

import type { SpaceScope } from "@/lib/constants";
import {
  type AdminRoleChangeRecord,
  listAdminRoleChanges,
} from "@/lib/firestore/admin-role-changes";
import {
  type AdminScopeChangeRecord,
  listAdminScopeChanges,
} from "@/lib/firestore/admin-scope-changes";

export interface AdminActivityEntry {
  /** Kind-prefixed so role and scope ids never collide in a merged list. */
  id: string;
  kind: "role" | "scope";
  actorEmail: string;
  targetEmail: string;
  /** Plain-English one-line description of the change (no jargon, no em dashes). */
  summary: string;
  reason: string;
  createdAt: string;
}

function roleEntry(record: AdminRoleChangeRecord): AdminActivityEntry {
  return {
    id: `role:${record.id}`,
    kind: "role",
    actorEmail: record.actor_email,
    targetEmail: record.target_email,
    summary: `Role changed from ${record.previous_role} to ${record.new_role}`,
    reason: record.reason,
    createdAt: record.created_at,
  };
}

function describeScopes(scopes: readonly SpaceScope[] | null): string {
  if (scopes === null || scopes.length === 0) return "All spaces";
  return scopes.join(", ");
}

function scopeEntry(record: AdminScopeChangeRecord): AdminActivityEntry {
  const invalidNote = record.previous_scope_claim_invalid
    ? " (previous access setting was unreadable)"
    : "";
  return {
    id: `scope:${record.id}`,
    kind: "scope",
    actorEmail: record.actor_email,
    targetEmail: record.target_email,
    summary: `Space access set to ${describeScopes(record.new_scopes)}${invalidNote}`,
    reason: record.reason,
    createdAt: record.created_at,
  };
}

/** Pure: merge role + scope change records into one newest-first list, bounded to `limit`. */
export function mergeAdminActivity(
  roleChanges: readonly AdminRoleChangeRecord[],
  scopeChanges: readonly AdminScopeChangeRecord[],
  limit = 25,
): AdminActivityEntry[] {
  const entries = [...roleChanges.map(roleEntry), ...scopeChanges.map(scopeEntry)];
  // Descending by ISO timestamp (lexicographic on ISO-8601 is chronological); id breaks ties stably.
  entries.sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? 1 : -1;
    }
    return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
  });
  return entries.slice(0, Math.max(0, limit));
}

/** Read both audit collections (each already bounded/ordered) and merge to the global newest `limit`. */
export async function readAdminActivityLog(
  options: { limit?: number; db?: Firestore } = {},
): Promise<AdminActivityEntry[]> {
  const limit = options.limit ?? 25;
  const [roleChanges, scopeChanges] = await Promise.all([
    listAdminRoleChanges(limit, options.db),
    listAdminScopeChanges(limit, options.db),
  ]);
  return mergeAdminActivity(roleChanges, scopeChanges, limit);
}
