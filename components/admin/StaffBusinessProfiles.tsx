"use client";
import { useState } from "react";
import { PresentationSettingsPanel } from "./PresentationSettingsPanel";
export function StaffBusinessProfiles({
  users,
}: {
  users: { uid: string; email: string; disabled: boolean }[];
}) {
  const [uid, setUid] = useState(users.find((u) => !u.disabled)?.uid ?? "");
  return (
    <section className="stack">
      <h2>Existing staff profiles</h2>
      <label>
        Staff account
        <select
          aria-label="Staff account"
          value={uid}
          onChange={(e) => setUid(e.target.value)}
        >
          <option value="">Choose an existing staff account</option>
          {users
            .filter((u) => !u.disabled)
            .map((u) => (
              <option key={u.uid} value={u.uid}>
                {u.email}
              </option>
            ))}
        </select>
      </label>
      {uid ? (
        <PresentationSettingsPanel kind="profile" uid={uid} key={uid} />
      ) : (
        <p>Current enabled staff identities are required.</p>
      )}
    </section>
  );
}
