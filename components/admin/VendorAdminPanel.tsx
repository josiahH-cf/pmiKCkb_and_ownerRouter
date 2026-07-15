"use client";

import { useState } from "react";

export function VendorAdminPanel() {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [previewed, setPreviewed] = useState(false);

  return (
    <article className="panel">
      <h2>External Vendors</h2>
      <p>
        Prepare an email-only Vendor invite. PMI KC never creates or displays a reusable
        password; the Vendor finishes the one-time setup and TOTP enrollment themselves.
      </p>
      <label>
        Vendor email
        <input
          onChange={(event) => {
            setEmail(event.target.value);
            setPreviewed(false);
          }}
          type="email"
          value={email}
        />
      </label>
      <label>
        Invite reason
        <textarea
          onChange={(event) => {
            setReason(event.target.value);
            setPreviewed(false);
          }}
          value={reason}
        />
      </label>
      <button
        className="secondary-button"
        disabled={!email.trim() || reason.trim().length < 3}
        onClick={() => setPreviewed(true)}
        type="button"
      >
        Review exact invite
      </button>
      {previewed ? (
        <div className="panel">
          <p>
            <strong>Recipient:</strong> {email.trim().toLowerCase()}
          </p>
          <p>
            <strong>Artifact:</strong> vendor-invite:v1.0
          </p>
          <p>
            <strong>Reason:</strong> {reason.trim()}
          </p>
          <button disabled type="button">
            Send one-time setup link
          </button>
          <p className="muted">
            Live invitation delivery is gated until Identity Platform TOTP, the approved
            delivery channel, Action Registry review, and first-invite authority are
            configured.
          </p>
        </div>
      ) : null}
    </article>
  );
}
