"use client";

import { useState } from "react";

// In-place Approve for a Console deck queue_item row (console overhaul A4). Records the app-plane
// approval decision by PATCHing the EXISTING already-authed approval-queue item route with
// {action:"approve"} (status to Approved). It never executes an external action: no send, no
// system-of-record write, and High-risk items are refused server-side so the operator uses the full
// surface. On failure it shows the server error inline; on success it shows a done state.
export function ConsoleApproveButton({ itemId }: Readonly<{ itemId: string }>) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/approval-queue/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (response.ok) {
        setDone(true);
      } else {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(payload.error ?? "Could not approve this item.");
      }
    } catch {
      setError("Could not approve this item.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return <span className="muted console-deck-approved">Approved.</span>;
  }

  return (
    <span className="console-deck-approve">
      <button
        className="secondary-button"
        disabled={pending}
        onClick={() => void approve()}
        type="button"
      >
        {pending ? "Approving…" : "Approve"}
      </button>
      {error ? <span className="muted">{error}</span> : null}
    </span>
  );
}
