// Assignable-user roster for the maintenance ticket picker (slice 2b). The roster is edit-gated (any
// Editor can assign a ticket), so it must NOT reuse the manageAdmin-only /api/admin/users route — it
// wraps `listAppUsers` (which imposes no capability of its own) directly, behind the caller's edit gate.
//
// Roles live in Firebase Auth, so the real roster reads Firebase Auth (getAuth().listUsers). But LOCAL
// DEMO auth is entirely synthetic — a demo Editor is never a Firebase Auth account — so in demo mode the
// real roster would be empty/ADC-dependent and the picker untestable. When `localDemoAuth` is on
// (dev/test only, NODE_ENV-fenced in config), we return the synthetic demo users instead so the feature
// is fully exercisable locally; production always reads the real Firebase Auth roster.

import { LOCAL_DEMO_ROLES, localDemoUser } from "@/lib/auth/session";
import { readServerConfig, type ServerConfig } from "@/lib/config/server";
import { type AdminAuthLike, listAppUsers } from "@/lib/admin/users";
import type { AssignableUser } from "@/lib/maintenance/assignee-model";

export interface AssignableRosterDeps {
  config?: ServerConfig;
  auth?: AdminAuthLike;
}

/**
 * The users a ticket may be assigned to: minimal {uid,email}. In local-demo mode, the synthetic demo
 * users (so the picker works without real Firebase Auth); otherwise the real Firebase Auth roster with
 * disabled accounts filtered out (you cannot assign work to a deactivated user).
 */
export async function listAssignableUsers(
  deps: AssignableRosterDeps = {},
): Promise<AssignableUser[]> {
  const config = deps.config ?? readServerConfig();

  if (config.localDemoAuth) {
    return LOCAL_DEMO_ROLES.map((role) => {
      const user = localDemoUser(role);
      return { uid: user.uid, email: user.email };
    });
  }

  // Filter to non-disabled users INSIDE the allowed hosted domain. getAuth().listUsers() can return
  // accounts that never pass the sign-in hd check (e.g. an external address that once attempted Google
  // sign-in), so mirror the defense-in-depth domain guard on the sibling admin role path
  // (lib/admin/users.ts) — an external account must never be a pickable/assignable user.
  const allowedHd = config.allowedHostedDomain.toLowerCase();
  const users = await listAppUsers(deps.auth);
  return users
    .filter(
      (user) => !user.disabled && user.email.toLowerCase().endsWith(`@${allowedHd}`),
    )
    .map((user) => ({ uid: user.uid, email: user.email }));
}

/**
 * Whether `uid` is a currently-assignable user (present in the same roster the picker shows). Used to
 * reject typo'd/stale/deactivated uids before an assign writes. Empty/blank → false (callers pass null,
 * not "", to unassign).
 */
export async function isAssignableUser(
  uid: string,
  deps: AssignableRosterDeps = {},
): Promise<boolean> {
  const trimmed = uid?.trim();
  if (!trimmed) return false;
  const roster = await listAssignableUsers(deps);
  return roster.some((user) => user.uid === trimmed);
}
