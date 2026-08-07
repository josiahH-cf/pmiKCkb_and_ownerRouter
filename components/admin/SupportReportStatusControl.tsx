"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui";
import type { SupportReportStatus } from "@/lib/firestore/types";

// S65: the per-report closure control. An Admin moves a report between the three statuses that
// already exist — nothing more. No assignment, no comment thread, no reply to the reporter. The
// optional short note lands on the append-only audit entry, not on the report body.

const NEXT_ACTIONS: Record<
  SupportReportStatus,
  ReadonlyArray<{ status: SupportReportStatus; label: string }>
> = {
  new: [
    { status: "acknowledged", label: "Acknowledge" },
    { status: "resolved", label: "Resolve" },
  ],
  acknowledged: [{ status: "resolved", label: "Resolve" }],
  resolved: [{ status: "acknowledged", label: "Reopen as acknowledged" }],
};

export function SupportReportStatusControl({
  reportId,
  status,
}: Readonly<{ reportId: string; status: SupportReportStatus }>) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function transition(nextStatus: SupportReportStatus) {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/support-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          report_id: reportId,
          status: nextStatus,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      if (response.ok) {
        setNote("");
        router.refresh();
      } else {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Could not update the report status.");
      }
    } catch {
      setError("Could not reach the feedback service.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ui-row" data-testid={`support-status-control-${reportId}`}>
      {NEXT_ACTIONS[status].map((action) => (
        <Button
          disabled={pending}
          key={action.status}
          onClick={() => void transition(action.status)}
          type="button"
          variant="secondary"
        >
          {pending ? "Saving…" : action.label}
        </Button>
      ))}
      <input
        aria-label="Optional note recorded on the status change"
        onChange={(event) => setNote(event.target.value)}
        placeholder="Optional note (kept on the audit trail)"
        type="text"
        value={note}
      />
      {error ? <p className="muted">{error}</p> : null}
    </div>
  );
}
