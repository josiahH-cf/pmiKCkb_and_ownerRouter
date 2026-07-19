"use client";

import { useState } from "react";
import type { AppUser } from "@/lib/admin/users";
import { SPACE_SCOPES, type SpaceScope } from "@/lib/constants";

const ROLE_OPTIONS = ["Editor", "Approver", "Admin"] as const;
const SCOPE_LABELS = {
  renewals: "Renewals",
  maintenance: "Maintenance",
} as const satisfies Readonly<Record<SpaceScope, string>>;

interface RoleDraft {
  role: string;
  reason: string;
}

interface ScopeDraft {
  scopes: readonly SpaceScope[] | undefined;
  reason: string;
}

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

  async function saveRole(user: AppUser) {
    const current = roleDraftFor(user);
    if (current.role === user.role) {
      setStatus("Pick a different role before saving.");
      return;
    }
    if (current.reason.trim().length < 3) {
      setStatus("Add a short reason for the change.");
      return;
    }
    const grantsOrRemovesAdmin = current.role === "Admin" || user.role === "Admin";
    if (
      grantsOrRemovesAdmin &&
      !window.confirm(
        `Change ${user.email} from ${user.role} to ${current.role}? Admin can approve work and manage users.`,
      )
    ) {
      return;
    }

    setPendingKey(`${user.uid}:role`);
    setStatus("");
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.uid)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: current.role, reason: current.reason.trim() }),
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
      } else {
        setStatus(payload.error ?? "Could not change the role.");
      }
    } finally {
      setPendingKey(null);
    }
  }

  async function saveScopes(user: AppUser) {
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

    setPendingKey(`${user.uid}:scopes`);
    setStatus("");
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(user.uid)}/scopes`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            // null deliberately means clear the custom claim (the All spaces wildcard).
            scopes: current.scopes ?? null,
            reason: current.reason.trim(),
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
      } else {
        setStatus(payload.error ?? "Could not change space access.");
      }
    } finally {
      setPendingKey(null);
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
          return (
            <div key={user.uid}>
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
                <button
                  className="secondary-button"
                  disabled={userPending || roleDraft.role === user.role}
                  onClick={() => saveRole(user)}
                  type="button"
                >
                  {pendingKey === `${user.uid}:role` ? "Saving" : "Save role"}
                </button>
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
                <button
                  className="secondary-button"
                  disabled={
                    userPending ||
                    (!user.scopeClaimInvalid &&
                      sameScopes(scopeDraft.scopes, user.scopes))
                  }
                  onClick={() => saveScopes(user)}
                  type="button"
                >
                  {pendingKey === `${user.uid}:scopes` ? "Saving" : "Save space access"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {status ? <p className="muted">{status}</p> : null}
    </article>
  );
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
