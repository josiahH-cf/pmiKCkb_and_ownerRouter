"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

import Link from "next/link";
import { useRef, useState } from "react";

// In-place Approve for a Dashboard attention-queue row (console overhaul A4; S147 keeps it on the
// compact queue). Records the app-plane approval decision by PATCHing the EXISTING already-authed
// approval-queue item route with {action:"approve"} (status to Approved). It never executes an
// external action: no send, no system-of-record write, and High-risk items are refused server-side
// so the operator uses the full surface. On failure it shows the server error inline; on success it
// shows a done state and tells the queue to refresh.
export function ConsoleApproveButton({
  itemId,
  onApproved,
}: Readonly<{ itemId: string; onApproved?: () => void }>) {
  return (
    <OwnedConsoleApproveButton key={itemId} itemId={itemId} onApproved={onApproved} />
  );
}
function OwnedConsoleApproveButton({
  itemId,
  onApproved,
}: Readonly<{ itemId: string; onApproved?: () => void }>) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const claimed = useRef(false);

  async function approve() {
    if (claimed.current) return;
    claimed.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/approval-queue/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        item?: { id: string; status: string };
      } | null;
      if (
        response.ok &&
        payload?.item?.id === itemId &&
        payload.item.status === "Approved"
      ) {
        setDone(true);
        onApproved?.();
      } else {
        if (response.status >= 500 || response.ok || !payload?.error)
          throw new Error("The approval response is unconfirmed.");
        claimed.current = false;
        setError(payload.error);
      }
    } catch {
      setUncertain(true);
      setError(
        "Approval not confirmed. The server may have recorded it; check this item's status before taking another action.",
      );
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return <span className="muted console-deck-approved">Approved.</span>;
  }

  return (
    <span className="console-deck-approve" aria-busy={pending || undefined}>
      <button
        className="secondary-button"
        disabled={pending || uncertain}
        onClick={() => void approve()}
        type="button"
      >
        {pending ? "Approving…" : "Approve"}
      </button>
      {error ? (
        <span className="muted" role="alert">
          {error}
        </span>
      ) : null}
      {uncertain ? (
        <Link
          className="text-link"
          href={`/approval-queue?item_id=${encodeURIComponent(itemId)}`}
          prefetch={false}
        >
          Check approval status
        </Link>
      ) : null}
    </span>
  );
}
