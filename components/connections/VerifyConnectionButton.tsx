"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Admin-only "Verify connection" (S13 D5): asks the server to re-run this connector's read-only
// live probe fresh, then refreshes so the card shows the new verdict. Verifies only — never writes.
export function VerifyConnectionButton({
  connectorId,
  connectorName,
}: Readonly<{ connectorId: string; connectorName: string }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/connections/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connector_id: connectorId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setMessage(body?.error ?? "The check could not run.");
        return;
      }
      const body = (await response.json()) as { verified: boolean };
      setMessage(
        body.verified
          ? `${connectorName} answered the live check.`
          : `${connectorName} did not pass the live check. See the card status for what to fix.`,
      );
      router.refresh();
    } catch {
      setMessage("The check could not run.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-stack-tight">
      <button className="secondary-button" disabled={busy} onClick={verify} type="button">
        {busy ? "Checking…" : "Verify connection"}
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
