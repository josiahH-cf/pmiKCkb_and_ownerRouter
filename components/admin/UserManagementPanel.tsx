"use client";

import { useState } from "react";
import { Button, ConfirmationDialog } from "@/components/ui";
import { ACCESS_CAPABILITIES, capabilityCatalogEntry } from "@/lib/access/catalog";
import type { AppUser } from "@/lib/admin/users";
import { can } from "@/lib/auth/roles";
import { formatBusinessTimestamp } from "@/lib/date-display";
import {
  RENEWAL_GOVERNANCE_MATRIX,
  renewalRoleCapability,
  type RenewalCapabilityKey,
} from "@/lib/lease-renewal/role-action-governance";

const ROLE_OPTIONS = ["Editor", "Approver", "Admin"] as const;
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

interface PendingUserChange {
  user: AppUser;
  proposedRole: string;
  reason: string;
}

// Roster + per-user role changes. S167: every staff account has every existing internal Space, so
// there is no per-user Space allowlist to edit; the role alone sets the capability tier.
export function UserManagementPanel({
  initialUsers,
  unavailableNote,
}: Readonly<{ initialUsers: AppUser[]; unavailableNote?: string }>) {
  const [users, setUsers] = useState<AppUser[]>(initialUsers);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, RoleDraft>>({});
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

  function setRoleDraftValue(uid: string, patch: Partial<RoleDraft>) {
    setRoleDrafts((prev) => ({
      ...prev,
      [uid]: { ...(prev[uid] ?? { role: "", reason: "" }), ...patch } as {
        role: string;
        reason: string;
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
      user,
      proposedRole: current.role,
      reason: current.reason.trim(),
    });
  }

  async function commitRoleChange(change: PendingUserChange) {
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

  function confirmPendingChange() {
    if (!pendingChange || pendingKey) return;
    void commitRoleChange(pendingChange);
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
          const userPending = pendingKey?.startsWith(`${user.uid}:`) ?? false;
          const capabilities = ACCESS_CAPABILITIES.filter((capability) =>
            can(user.role, capability),
          ).map((capability) => capabilityCatalogEntry(capability).label);
          const renewalAuthority = RENEWAL_AUTHORITY_SUMMARY.filter((key) =>
            can(user.role, renewalRoleCapability(key)),
          ).map((key) => RENEWAL_GOVERNANCE_MATRIX[key].label);
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
                  <dd>All internal Spaces</dd>
                </div>
                <div>
                  <dt>Derived renewal authority</dt>
                  <dd>{renewalAuthority.join(", ")}</dd>
                </div>
              </dl>
              <p className="muted admin-user-authority-note">
                Every staff account has every internal Space. Renewal authority reflects
                this role; exact action keys, provider readiness, quotas, and confirmation
                remain separate checks.
              </p>
              <div className="admin-user-row">
                <div className="admin-user-id">
                  <strong>{user.email}</strong>
                  <span className="muted">
                    {user.lastSignInAt
                      ? `Last sign-in ${formatBusinessTimestamp(user.lastSignInAt)}`
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
            </section>
          );
        })}
      </div>
      <p aria-atomic="true" aria-live="polite" className="muted" role="status">
        {status}
      </p>
      <ConfirmationDialog
        busy={pendingKey !== null}
        busyLabel="Changing role"
        confirmLabel="Confirm role change"
        error={confirmationError}
        onCancel={() => {
          setPendingChange(null);
          setConfirmationError("");
        }}
        onConfirm={confirmPendingChange}
        open={pendingChange !== null}
        title="Confirm role change"
      >
        {pendingChange ? (
          <dl className="ui-confirmation-summary">
            <dt>User</dt>
            <dd>{pendingChange.user.email}</dd>
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
            <dt>Reason</dt>
            <dd>{pendingChange.reason}</dd>
          </dl>
        ) : null}
      </ConfirmationDialog>
    </article>
  );
}
