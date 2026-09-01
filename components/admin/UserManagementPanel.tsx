"use client";

import { useState } from "react";
import { Button, ConfirmationDialog } from "@/components/ui";
import { ACCESS_CAPABILITIES, capabilityCatalogEntry } from "@/lib/access/catalog";
import type { AppUser } from "@/lib/admin/users";
import { can } from "@/lib/auth/roles";
import { SPACE_SCOPES, type SpaceScope } from "@/lib/constants";
import {
  RENEWAL_GOVERNANCE_MATRIX,
  renewalRoleCapability,
  type RenewalCapabilityKey,
} from "@/lib/lease-renewal/role-action-governance";

const ROLE_OPTIONS = ["Editor", "Approver", "Admin"] as const;
const SCOPE_LABELS = {
  renewals: "Renewals",
  maintenance: "Maintenance",
} as const satisfies Readonly<Record<SpaceScope, string>>;

const RENEWAL_AUTHORITY_SUMMARY = [
  "save_renewal_progress",
  "resolve_reconciliation",
  "approve_pricing_suggestion",
  "manage_renewal_configuration",
] as const satisfies readonly RenewalCapabilityKey[];

interface RoleDraft {
  role: string;
  reason: string;
}

interface ScopeDraft {
  scopes: readonly SpaceScope[] | undefined;
  reason: string;
}

type PendingUserChange =
  | {
      kind: "role";
      user: AppUser;
      proposedRole: string;
      reason: string;
    }
  | {
      kind: "scopes";
      user: AppUser;
      proposedScopes: readonly SpaceScope[] | undefined;
      reason: string;
    };

// Roster + per-user role and orthogonal space-scope changes. Missing scopes means All spaces; an
// explicit non-empty set only narrows surfaces and never changes the user's role capability tier.
export function UserManagementPanel({
  initialUsers,
  unavailableNote,
}: Readonly<{ initialUsers: AppUser[]; unavailableNote?: string }>) {
  const [users, setUsers] = useState<AppUser[]>(initialUsers);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, RoleDraft>>({});
  const [scopeDrafts, setScopeDrafts] = useState<Record<string, ScopeDraft>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingUserChange | null>(null);
  const [confirmationError, setConfirmationError] = useState("");
  const [status, setStatus] = useState("");

  if (unavailableNote) {
    return (
      <article className="panel">
        <h2>Users</h2>
        <p className="muted">{unavailableNote}</p>
      </article>
    );
  }

  function roleDraftFor(user: AppUser): RoleDraft {
    return roleDrafts[user.uid] ?? { role: user.role, reason: "" };
  }

  function scopeDraftFor(user: AppUser): ScopeDraft {
    return (
      scopeDrafts[user.uid] ?? {
        scopes: user.scopeClaimInvalid ? [] : user.scopes ? [...user.scopes] : undefined,
        reason: "",
      }
    );
  }

  function setRoleDraftValue(uid: string, patch: Partial<RoleDraft>) {
    setRoleDrafts((prev) => ({
      ...prev,
      [uid]: { ...(prev[uid] ?? { role: "", reason: "" }), ...patch } as {
        role: string;
        reason: string;
      },
    }));
  }

  function setScopeDraftValue(user: AppUser, patch: Partial<ScopeDraft>) {
    setScopeDrafts((prev) => ({
      ...prev,
      [user.uid]: {
        ...(prev[user.uid] ?? {
          scopes: user.scopeClaimInvalid
            ? []
            : user.scopes
              ? [...user.scopes]
              : undefined,
          reason: "",
        }),
        ...patch,
      },
    }));
  }

  function saveRole(user: AppUser) {
    const current = roleDraftFor(user);
    if (current.role === user.role) {
      setStatus("Pick a different role before saving.");
      return;
    }
    if (current.reason.trim().length < 3) {
      setStatus("Add a short reason for the change.");
      return;
    }
    setConfirmationError("");
    setPendingChange({
      kind: "role",
      user,
      proposedRole: current.role,
      reason: current.reason.trim(),
    });
  }

  async function commitRoleChange(change: Extract<PendingUserChange, { kind: "role" }>) {
    const { user, proposedRole, reason } = change;
    setPendingKey(`${user.uid}:role`);
    setStatus("");
    setConfirmationError("");
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.uid)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: proposedRole, reason }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        user?: AppUser;
        error?: string;
      };
      if (response.ok && payload.user) {
        const updated = payload.user;
        setUsers((prev) => prev.map((u) => (u.uid === updated.uid ? updated : u)));
        setRoleDrafts((prev) => ({
          ...prev,
          [user.uid]: { role: updated.role, reason: "" },
        }));
        setStatus(`${updated.email} is now ${updated.role}. They re-sign-in to refresh.`);
        setPendingChange(null);
      } else {
        setConfirmationError(payload.error ?? "Could not change the role. Try again.");
      }
    } catch {
      setConfirmationError("Could not reach the user service. Try again.");
    } finally {
      setPendingKey(null);
    }
  }

  function saveScopes(user: AppUser) {
    const current = scopeDraftFor(user);
    if (!user.scopeClaimInvalid && sameScopes(current.scopes, user.scopes)) {
      setStatus("Pick different space access before saving.");
      return;
    }
    if (current.scopes?.length === 0) {
      setStatus("Choose at least one space, or choose All spaces.");
      return;
    }
    if (current.reason.trim().length < 3) {
      setStatus("Add a short reason for the access change.");
      return;
    }

    setConfirmationError("");
    setPendingChange({
      kind: "scopes",
      user,
      proposedScopes: current.scopes ? [...current.scopes] : undefined,
      reason: current.reason.trim(),
    });
  }

  async function commitScopeChange(
    change: Extract<PendingUserChange, { kind: "scopes" }>,
  ) {
    const { user, proposedScopes, reason } = change;
    setPendingKey(`${user.uid}:scopes`);
    setStatus("");
    setConfirmationError("");
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(user.uid)}/scopes`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            // null deliberately means clear the custom claim (the All spaces wildcard).
            scopes: proposedScopes ?? null,
            reason,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        user?: AppUser;
        error?: string;
      };
      if (response.ok && payload.user) {
        const updated = payload.user;
        setUsers((prev) => prev.map((u) => (u.uid === updated.uid ? updated : u)));
        setScopeDrafts((prev) => ({
          ...prev,
          [user.uid]: {
            scopes: updated.scopes ? [...updated.scopes] : undefined,
            reason: "",
          },
        }));
        const access = updated.scopes
          ? updated.scopes.map((scope) => SCOPE_LABELS[scope]).join(" and ")
          : "All spaces";
        setStatus(
          `${updated.email} now has access to ${access}. They re-sign-in to refresh.`,
        );
        setPendingChange(null);
      } else {
        setConfirmationError(
          payload.error ?? "Could not change space access. Try again.",
        );
      }
    } catch {
      setConfirmationError("Could not reach the user service. Try again.");
    } finally {
      setPendingKey(null);
    }
  }

  function confirmPendingChange() {
    if (!pendingChange || pendingKey) return;
    if (pendingChange.kind === "role") {
      void commitRoleChange(pendingChange);
    } else {
      void commitScopeChange(pendingChange);
    }
  }

  return (
    <article className="panel">
      <h2>Users</h2>
      <p className="muted">
        {users.length} {users.length === 1 ? "person" : "people"} with access. A change
        takes effect the next time they sign in.
      </p>
      <div className="admin-user-table">
        {users.map((user) => {
          const roleDraft = roleDraftFor(user);
          const scopeDraft = scopeDraftFor(user);
          const allSpaces = scopeDraft.scopes === undefined;
          const userPending = pendingKey?.startsWith(`${user.uid}:`) ?? false;
          const capabilities = ACCESS_CAPABILITIES.filter((capability) =>
            can(user.role, capability),
          ).map((capability) => capabilityCatalogEntry(capability).label);
          const hasRenewalsSpace =
            !user.scopeClaimInvalid &&
            (user.scopes === undefined || user.scopes.includes("renewals"));
          const renewalAuthority = hasRenewalsSpace
            ? RENEWAL_AUTHORITY_SUMMARY.filter((key) =>
                can(user.role, renewalRoleCapability(key)),
              ).map((key) => RENEWAL_GOVERNANCE_MATRIX[key].label)
            : [];
          return (
            <section
              aria-label={`Effective access for ${user.email}`}
              className="admin-user-record"
              key={user.uid}
            >
              <dl className="admin-user-access-summary">
                <div>
                  <dt>Individual role</dt>
                  <dd>{user.role}</dd>
                </div>
                <div>
                  <dt>Inherited capabilities</dt>
                  <dd>{capabilities.join(", ")}</dd>
                </div>
                <div>
                  <dt>Spaces</dt>
                  <dd>
                    {user.scopeClaimInvalid
                      ? "Unavailable: invalid Space claim"
                      : formatScopes(user.scopes)}
                  </dd>
                </div>
                <div>
                  <dt>Derived renewal authority</dt>
                  <dd>
                    {user.scopeClaimInvalid
                      ? "Unavailable: invalid Space claim"
                      : hasRenewalsSpace
                        ? renewalAuthority.join(", ")
                        : "None: no Renewals Space access"}
                  </dd>
                </div>
              </dl>
              <p className="muted admin-user-authority-note">
                Renewal authority reflects this role and Space only. Exact action keys,
                provider readiness, quotas, and confirmation remain separate checks.
              </p>
              <div className="admin-user-row">
                <div className="admin-user-id">
                  <strong>{user.email}</strong>
                  <span className="muted">
                    {user.lastSignInAt
                      ? `Last sign-in ${user.lastSignInAt.slice(0, 10)}`
                      : "No sign-in yet"}
                  </span>
                </div>
                <label className="select-field" htmlFor={`role-${user.uid}`}>
                  Role
                  <select
                    id={`role-${user.uid}`}
                    onChange={(event) =>
                      setRoleDraftValue(user.uid, { role: event.target.value })
                    }
                    value={roleDraft.role}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  aria-label={`Reason for changing ${user.email}`}
                  onChange={(event) =>
                    setRoleDraftValue(user.uid, { reason: event.target.value })
                  }
                  placeholder="Reason (required)"
                  type="text"
                  value={roleDraft.reason}
                />
                <Button
                  busy={pendingKey === `${user.uid}:role`}
                  busyLabel="Saving role"
                  disabled={userPending || roleDraft.role === user.role}
                  onClick={() => saveRole(user)}
                  variant="secondary"
                >
                  Save role
                </Button>
              </div>
              <div className="admin-user-row">
                <div className="admin-user-id">
                  <strong>Space access</strong>
                  <span className="muted">
                    {user.scopeClaimInvalid
                      ? "Invalid scope claim: choose valid access and save before this user signs in."
                      : "Scopes narrow reach; the role still applies."}
                  </span>
                </div>
                <fieldset>
                  <legend className="muted">Spaces</legend>
                  <label>
                    <input
                      aria-label={`All spaces for ${user.email}`}
                      checked={allSpaces}
                      onChange={(event) =>
                        setScopeDraftValue(user, {
                          scopes: event.target.checked ? undefined : [...SPACE_SCOPES],
                        })
                      }
                      type="checkbox"
                    />{" "}
                    All spaces
                  </label>
                  {SPACE_SCOPES.map((scope) => (
                    <label key={scope}>
                      <input
                        aria-label={`${SCOPE_LABELS[scope]} for ${user.email}`}
                        checked={scopeDraft.scopes?.includes(scope) ?? false}
                        disabled={allSpaces}
                        onChange={(event) => {
                          const selected = scopeDraft.scopes ?? [];
                          setScopeDraftValue(user, {
                            scopes: event.target.checked
                              ? SPACE_SCOPES.filter(
                                  (candidate) =>
                                    candidate === scope || selected.includes(candidate),
                                )
                              : selected.filter((candidate) => candidate !== scope),
                          });
                        }}
                        type="checkbox"
                      />{" "}
                      {SCOPE_LABELS[scope]}
                    </label>
                  ))}
                </fieldset>
                <input
                  aria-label={`Reason for changing space access for ${user.email}`}
                  onChange={(event) =>
                    setScopeDraftValue(user, { reason: event.target.value })
                  }
                  placeholder="Access reason (required)"
                  type="text"
                  value={scopeDraft.reason}
                />
                <Button
                  busy={pendingKey === `${user.uid}:scopes`}
                  busyLabel="Saving space access"
                  disabled={
                    userPending ||
                    (!user.scopeClaimInvalid &&
                      sameScopes(scopeDraft.scopes, user.scopes))
                  }
                  onClick={() => saveScopes(user)}
                  variant="secondary"
                >
                  Save space access
                </Button>
              </div>
            </section>
          );
        })}
      </div>
      <p aria-atomic="true" aria-live="polite" className="muted" role="status">
        {status}
      </p>
      <ConfirmationDialog
        busy={pendingKey !== null}
        busyLabel={
          pendingChange?.kind === "role" ? "Changing role" : "Changing Space access"
        }
        confirmLabel={
          pendingChange?.kind === "role"
            ? "Confirm role change"
            : "Confirm Space access change"
        }
        error={confirmationError}
        onCancel={() => {
          setPendingChange(null);
          setConfirmationError("");
        }}
        onConfirm={confirmPendingChange}
        open={pendingChange !== null}
        title={
          pendingChange?.kind === "role"
            ? "Confirm role change"
            : "Confirm Space access change"
        }
      >
        {pendingChange ? (
          <dl className="ui-confirmation-summary">
            <dt>User</dt>
            <dd>{pendingChange.user.email}</dd>
            {pendingChange.kind === "role" ? (
              <>
                <dt>Current role</dt>
                <dd>{pendingChange.user.role}</dd>
                <dt>Proposed role</dt>
                <dd>{pendingChange.proposedRole}</dd>
                {pendingChange.user.role === "Admin" ||
                pendingChange.proposedRole === "Admin" ? (
                  <>
                    <dt>Admin access</dt>
                    <dd>Admins can approve work and manage users.</dd>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <dt>Current Spaces</dt>
                <dd>
                  {pendingChange.user.scopeClaimInvalid
                    ? "Invalid configured access"
                    : formatScopes(pendingChange.user.scopes)}
                </dd>
                <dt>Proposed Spaces</dt>
                <dd>{formatScopes(pendingChange.proposedScopes)}</dd>
              </>
            )}
            <dt>Reason</dt>
            <dd>{pendingChange.reason}</dd>
          </dl>
        ) : null}
      </ConfirmationDialog>
    </article>
  );
}

function formatScopes(scopes: readonly SpaceScope[] | undefined) {
  return scopes ? scopes.map((scope) => SCOPE_LABELS[scope]).join(" and ") : "All spaces";
}

function sameScopes(
  left: readonly SpaceScope[] | undefined,
  right: readonly SpaceScope[] | undefined,
) {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.length === right.length &&
    SPACE_SCOPES.every((scope) => left.includes(scope) === right.includes(scope))
  );
}
