"use client";

import { useState } from "react";
import type { AppUser } from "@/lib/admin/users";

const ROLE_OPTIONS = ["Editor", "Approver", "Admin"] as const;

// Roster + per-user role change (console overhaul Slice D). A role change needs a plain-English
// reason and a confirm for any Admin grant/removal; the last-Admin guard is enforced server-side.
export function UserManagementPanel({
  initialUsers,
  unavailableNote,
}: Readonly<{ initialUsers: AppUser[]; unavailableNote?: string }>) {
  const [users, setUsers] = useState<AppUser[]>(initialUsers);
  const [draft, setDraft] = useState<Record<string, { role: string; reason: string }>>(
    {},
  );
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  if (unavailableNote) {
    return (
      <article className="panel">
        <h2>Users</h2>
        <p className="muted">{unavailableNote}</p>
      </article>
    );
  }

  function draftFor(user: AppUser) {
    return draft[user.uid] ?? { role: user.role, reason: "" };
  }

  function setDraftValue(uid: string, patch: Partial<{ role: string; reason: string }>) {
    setDraft((prev) => ({
      ...prev,
      [uid]: { ...(prev[uid] ?? { role: "", reason: "" }), ...patch } as {
        role: string;
        reason: string;
      },
    }));
  }

  async function save(user: AppUser) {
    const current = draftFor(user);
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

    setPendingUid(user.uid);
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
        setDraft((prev) => ({ ...prev, [user.uid]: { role: updated.role, reason: "" } }));
        setStatus(`${updated.email} is now ${updated.role}. They re-sign-in to refresh.`);
      } else {
        setStatus(payload.error ?? "Could not change the role.");
      }
    } finally {
      setPendingUid(null);
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
          const current = draftFor(user);
          return (
            <div className="admin-user-row" key={user.uid}>
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
                    setDraftValue(user.uid, { role: event.target.value })
                  }
                  value={current.role}
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
                  setDraftValue(user.uid, { reason: event.target.value })
                }
                placeholder="Reason (required)"
                type="text"
                value={current.reason}
              />
              <button
                className="secondary-button"
                disabled={pendingUid === user.uid || current.role === user.role}
                onClick={() => save(user)}
                type="button"
              >
                {pendingUid === user.uid ? "Saving" : "Save role"}
              </button>
            </div>
          );
        })}
      </div>
      {status ? <p className="muted">{status}</p> : null}
    </article>
  );
}
