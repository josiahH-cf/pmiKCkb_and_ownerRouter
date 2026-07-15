// In-app user + role management (console overhaul Slice D). Roles are Firebase Auth custom claims
// (not a Firestore doc), so this reuses the exact logic scripts/set-firebase-user-role.mjs uses:
// read the roster from getAuth().listUsers(), merge a role claim via setCustomUserClaims. The guard
// logic (valid role, mandatory reason, domain boundary, last-Admin protection, audit) is dependency-
// injected via AdminAuthLike so it is fully unit-testable without firebase-admin. The live list/set
// calls stay owner-gated behind the manageAdmin capability at the route.

import { getAuth } from "firebase-admin/auth";
import { can, type Role } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import { ROLES, SPACE_SCOPES, type SpaceScope } from "@/lib/constants";
import { getFirebaseAdminApp } from "@/lib/firebase/admin";
import { recordAdminRoleChange } from "@/lib/firestore/admin-role-changes";
import { recordAdminScopeChange } from "@/lib/firestore/admin-scope-changes";

export interface AppUser {
  uid: string;
  email: string;
  role: Role;
  /** Missing means the backward-compatible All spaces wildcard. */
  scopes?: readonly SpaceScope[];
  /** Fail-loud roster marker for a present but malformed custom claim. */
  scopeClaimInvalid?: boolean;
  disabled: boolean;
  lastSignInAt: string | null;
}

// The minimal firebase-admin Auth surface this module uses. Modeled as an interface so tests inject a
// fake and the guards run without a live Admin SDK.
interface AdminUserRecordLike {
  uid: string;
  email?: string;
  disabled?: boolean;
  customClaims?: Record<string, unknown> | null;
  metadata?: { lastSignInTime?: string | null };
}

export interface AdminAuthLike {
  listUsers(
    maxResults?: number,
    pageToken?: string,
  ): Promise<{ users: AdminUserRecordLike[]; pageToken?: string }>;
  getUser(uid: string): Promise<AdminUserRecordLike>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
}

export class UserManagementError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "UserManagementError";
  }
}

function defaultAuth(): AdminAuthLike {
  return getAuth(getFirebaseAdminApp()) as unknown as AdminAuthLike;
}

function isExternalVendor(record: AdminUserRecordLike) {
  const claims = record.customClaims;
  if (!claims) return false;

  // Vendor identity evidence is fail-closed. A partially drifted claim set
  // (for example vendor_id without vendor:true, or vendor:false) must not fall
  // through to the internal Editor default merely because its email is in the
  // managed Workspace domain.
  return (
    Object.prototype.hasOwnProperty.call(claims, "vendor") ||
    Object.prototype.hasOwnProperty.call(claims, "vendor_id") ||
    Object.prototype.hasOwnProperty.call(claims, "data_mode")
  );
}

function assertInternalUser(record: AdminUserRecordLike) {
  if (isExternalVendor(record)) {
    throw new UserManagementError(
      "External Vendor identities cannot receive internal roles or space scopes.",
      403,
    );
  }
}

// A brand-new signed-in user has no role claim and defaults to Editor (mirrors readFirebaseRole).
function roleFromClaims(claims: Record<string, unknown> | null | undefined): Role {
  const role = claims?.role;
  return role === "Approver" || role === "Admin" ? role : "Editor";
}

interface ScopeClaimState {
  scopes: readonly SpaceScope[] | undefined;
  invalid: boolean;
}

function scopeStateFromClaims(
  claims: Record<string, unknown> | null | undefined,
): ScopeClaimState {
  const scopes = claims?.scopes;
  if (scopes === undefined || scopes === null || scopes === "") {
    return { scopes: undefined, invalid: false };
  }
  if (
    !Array.isArray(scopes) ||
    scopes.length === 0 ||
    scopes.some(
      (scope) =>
        typeof scope !== "string" || !(SPACE_SCOPES as readonly string[]).includes(scope),
    )
  ) {
    return { scopes: undefined, invalid: true };
  }

  return {
    scopes: SPACE_SCOPES.filter((scope) => scopes.includes(scope)),
    invalid: false,
  };
}

function toAppUser(record: AdminUserRecordLike): AppUser | null {
  if (!record.email) return null;
  const scopeState = scopeStateFromClaims(record.customClaims);
  return {
    uid: record.uid,
    email: record.email,
    role: roleFromClaims(record.customClaims),
    scopes: scopeState.scopes,
    scopeClaimInvalid: scopeState.invalid,
    disabled: Boolean(record.disabled),
    lastSignInAt: record.metadata?.lastSignInTime ?? null,
  };
}

export async function listAppUsers(
  auth: AdminAuthLike = defaultAuth(),
): Promise<AppUser[]> {
  const result = await auth.listUsers(1000);
  const allowedHd = readServerConfig().allowedHostedDomain.toLowerCase();
  return (
    result.users
      // Identity class wins over email domain. A Vendor account remains external even if its
      // address happens to use the managed Workspace domain.
      .filter((record) => !isExternalVendor(record))
      .map(toAppUser)
      .filter((user): user is AppUser => user !== null)
      // Firebase Auth also contains the separately scoped external Vendor principals. They are
      // managed in the Vendor panel and must never look like internal Editors with All-spaces access.
      .filter((user) => user.email.toLowerCase().endsWith(`@${allowedHd}`))
      .sort((left, right) => left.email.localeCompare(right.email))
  );
}

export interface SetAppUserRoleInput {
  actor: AuthenticatedUser;
  targetUid: string;
  role: Role;
  reason: string;
}

/**
 * Change a user's role (app-plane auth op — no external system, no send). Enforces: valid role, a
 * mandatory plain-English reason, the pmikcmetro.com domain boundary (defense in depth), and a
 * last-Admin guard so the app can never drop to zero Admins. Writes an append-only audit record.
 */
export async function setAppUserRole(
  input: SetAppUserRoleInput,
  auth: AdminAuthLike = defaultAuth(),
): Promise<AppUser> {
  const { actor, targetUid, role, reason } = input;

  if (!ROLES.includes(role)) {
    throw new UserManagementError("Invalid role.", 400);
  }
  if (reason.trim().length < 3) {
    throw new UserManagementError("A plain-English reason is required.", 400);
  }

  const target = await auth.getUser(targetUid);
  assertInternalUser(target);
  if (!target.email) {
    throw new UserManagementError("The target user has no email address.", 400);
  }

  const allowedHd = readServerConfig().allowedHostedDomain.toLowerCase();
  if (!target.email.toLowerCase().endsWith(`@${allowedHd}`)) {
    throw new UserManagementError(
      "Role changes are limited to the allowed Google Workspace domain.",
      403,
    );
  }

  const previousRole = roleFromClaims(target.customClaims);

  // Last-Admin guard: never let a demotion drop the app to zero Admins. Best-effort, NOT
  // concurrency-safe: the count-then-write is not atomic across Firebase Auth, so two simultaneous
  // demotions of the last two Admins could still race to zero. That is recoverable with the
  // break-glass `npm run firebase:set-role` script; a stronger invariant needs an atomic admin
  // counter (tracked as a follow-on).
  if (previousRole === "Admin" && role !== "Admin") {
    const users = await listAppUsers(auth);
    const adminCount = users.filter((user) => user.role === "Admin").length;
    if (adminCount <= 1) {
      throw new UserManagementError("Cannot remove the last Admin.", 409);
    }
  }

  await auth.setCustomUserClaims(targetUid, {
    ...(target.customClaims ?? {}),
    role,
  });

  // The privilege change has already committed. If the audit write fails (transient Firestore
  // error), do NOT surface a role-change failure — that would leave the operator's roster view stale
  // and wrong while the claim actually changed. Log the audit gap and return the true new state.
  try {
    await recordAdminRoleChange(
      {
        actor_uid: actor.uid,
        actor_email: actor.email,
        target_uid: targetUid,
        target_email: target.email,
        previous_role: previousRole,
        new_role: role,
        reason: reason.trim(),
      },
      new Date().toISOString(),
    );
  } catch (error) {
    console.error(
      `Role change applied for ${target.email} (${previousRole} -> ${role}) but the audit write failed:`,
      error,
    );
  }

  const scopeState = scopeStateFromClaims(target.customClaims);
  return {
    uid: targetUid,
    email: target.email,
    role,
    scopes: scopeState.scopes,
    scopeClaimInvalid: scopeState.invalid,
    disabled: Boolean(target.disabled),
    lastSignInAt: target.metadata?.lastSignInTime ?? null,
  };
}

export interface SetAppUserScopesInput {
  actor: AuthenticatedUser;
  targetUid: string;
  /** Undefined clears the claim and restores the backward-compatible All spaces wildcard. */
  scopes: readonly SpaceScope[] | undefined;
  reason: string;
}

function normalizeRequestedScopes(
  scopes: readonly SpaceScope[] | undefined,
): readonly SpaceScope[] | undefined {
  if (scopes === undefined) return undefined;
  if (
    !Array.isArray(scopes) ||
    scopes.length === 0 ||
    scopes.some(
      (scope) =>
        typeof scope !== "string" || !(SPACE_SCOPES as readonly string[]).includes(scope),
    )
  ) {
    throw new UserManagementError(
      "Choose at least one known space, or choose All spaces.",
      400,
    );
  }

  // Store a deterministic set even if a direct caller repeats or reorders values.
  return SPACE_SCOPES.filter((scope) => scopes.includes(scope));
}

/**
 * Narrow or restore a user's space reach without changing their role/capability tier. This is an
 * app-plane Firebase Auth operation: Admin-only, domain-bound, reasoned, and append-only audited.
 */
export async function setAppUserScopes(
  input: SetAppUserScopesInput,
  auth: AdminAuthLike = defaultAuth(),
): Promise<AppUser> {
  const { actor, targetUid, reason } = input;

  if (!can(actor.role, "manageAdmin")) {
    throw new UserManagementError("Admin access is required.", 403);
  }
  if (reason.trim().length < 3) {
    throw new UserManagementError("A plain-English reason is required.", 400);
  }
  const scopes = normalizeRequestedScopes(input.scopes);

  const target = await auth.getUser(targetUid);
  assertInternalUser(target);
  if (!target.email) {
    throw new UserManagementError("The target user has no email address.", 400);
  }

  const allowedHd = readServerConfig().allowedHostedDomain.toLowerCase();
  if (!target.email.toLowerCase().endsWith(`@${allowedHd}`)) {
    throw new UserManagementError(
      "Scope changes are limited to the allowed Google Workspace domain.",
      403,
    );
  }

  const previousScopeState = scopeStateFromClaims(target.customClaims);
  const nextClaims = { ...(target.customClaims ?? {}) };
  if (scopes === undefined) {
    delete nextClaims.scopes;
  } else {
    nextClaims.scopes = [...scopes];
  }

  // Merge rather than replace so the target's role and any unrelated custom claims are untouched.
  await auth.setCustomUserClaims(targetUid, nextClaims);

  // The claim has already committed. Match role changes' degradation policy: report an audit gap,
  // but return the true claim state rather than telling the operator the scope change failed.
  try {
    await recordAdminScopeChange(
      {
        actor_uid: actor.uid,
        actor_email: actor.email,
        target_uid: targetUid,
        target_email: target.email,
        previous_scopes: previousScopeState.scopes
          ? [...previousScopeState.scopes]
          : null,
        previous_scope_claim_invalid: previousScopeState.invalid,
        new_scopes: scopes ? [...scopes] : null,
        reason: reason.trim(),
      },
      new Date().toISOString(),
    );
  } catch (error) {
    console.error(
      `Scope change applied for ${target.email} but the audit write failed:`,
      error,
    );
  }

  return {
    uid: targetUid,
    email: target.email,
    role: roleFromClaims(target.customClaims),
    scopes,
    scopeClaimInvalid: false,
    disabled: Boolean(target.disabled),
    lastSignInAt: target.metadata?.lastSignInTime ?? null,
  };
}
