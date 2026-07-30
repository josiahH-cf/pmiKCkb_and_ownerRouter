// LR-02 + S51: surface append-only access and runtime-suspension audit trails in-app. This composes
// the three server-written collections into one newest-first Admin history.
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
import {
  type RuntimeSuspensionChangeRecord,
  listRuntimeSuspensionChanges,
} from "@/lib/firestore/runtime-action-suspensions";
import { RUNTIME_SUSPENSION_REASON_LABELS } from "@/lib/operations/runtime-suspension-policy";

interface AdminActivityEntryBase {
  /** Kind-prefixed so records from different audit collections never collide. */
  id: string;
  actorEmail: string;
  /** Plain-English one-line description of the change (no jargon, no em dashes). */
  summary: string;
  reason: string;
  createdAt: string;
}

export interface AdminAccessActivityEntry extends AdminActivityEntryBase {
  kind: "role" | "scope";
  targetEmail: string;
}

export interface AdminRuntimeSuspensionActivityEntry extends AdminActivityEntryBase {
  kind: "runtime_suspension";
  actionKey: string;
  incidentRef?: string;
}

export type AdminActivityEntry =
  | AdminAccessActivityEntry
  | AdminRuntimeSuspensionActivityEntry;

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

function runtimeSuspensionEntry(
  record: RuntimeSuspensionChangeRecord,
): AdminRuntimeSuspensionActivityEntry {
  const summary =
    record.new_state === "clear"
      ? "Production action stop cleared"
      : record.previous_state === "suspended"
        ? "Production action stop updated"
        : "Production action stopped";
  return {
    id: `runtime_suspension:${record.operation_id}`,
    kind: "runtime_suspension",
    actorEmail: record.actor_email,
    actionKey: record.action_key,
    summary,
    reason: RUNTIME_SUSPENSION_REASON_LABELS[record.reason_code],
    ...(record.incident_ref ? { incidentRef: record.incident_ref } : {}),
    createdAt: record.created_at,
  };
}

/** Pure: merge all Admin change records into one newest-first list, bounded to `limit`. */
export function mergeAdminActivity(
  roleChanges: readonly AdminRoleChangeRecord[],
  scopeChanges: readonly AdminScopeChangeRecord[],
  runtimeSuspensionChanges: readonly RuntimeSuspensionChangeRecord[],
  limit = 25,
): AdminActivityEntry[] {
  const entries = [
    ...roleChanges.map(roleEntry),
    ...scopeChanges.map(scopeEntry),
    ...runtimeSuspensionChanges.map(runtimeSuspensionEntry),
  ];
  // Descending by ISO timestamp (lexicographic on ISO-8601 is chronological); id breaks ties stably.
  entries.sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? 1 : -1;
    }
    return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
  });
  return entries.slice(0, Math.max(0, limit));
}

/** Read all audit collections (each already bounded/ordered) and merge to the global newest `limit`. */
export async function readAdminActivityLog(
  options: { limit?: number; db?: Firestore } = {},
): Promise<AdminActivityEntry[]> {
  const limit = options.limit ?? 25;
  const [roleChanges, scopeChanges, runtimeSuspensionChanges] = await Promise.all([
    listAdminRoleChanges(limit, options.db),
    listAdminScopeChanges(limit, options.db),
    listRuntimeSuspensionChanges(limit, options.db),
  ]);
  return mergeAdminActivity(roleChanges, scopeChanges, runtimeSuspensionChanges, limit);
}
