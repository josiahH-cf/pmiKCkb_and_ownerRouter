"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

import { useRef, useState } from "react";
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
  const [uncertain, setUncertain] = useState(false);
  const dispatched = useRef(false);

  async function transition(nextStatus: SupportReportStatus) {
    if (dispatched.current || uncertain) return;
    dispatched.current = true;
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
      } else if (response.status >= 500) {
        setUncertain(true);
        setError(
          "The report status is not confirmed. Reload and review its current status before another change.",
        );
      } else {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Could not update the report status.");
      }
    } catch {
      setUncertain(true);
      setError(
        "The report status is not confirmed. Reload and review its current status before another change.",
      );
    } finally {
      setPending(false);
      dispatched.current = false;
    }
  }

  return (
    <div className="ui-row" data-testid={`support-status-control-${reportId}`}>
      {NEXT_ACTIONS[status].map((action) => (
        <Button
          disabled={pending || uncertain}
          key={action.status}
          onClick={() => void transition(action.status)}
          type="button"
          variant="secondary"
        >
          {pending ? "Saving…" : action.label}
        </Button>
      ))}
      <label className="select-field">
        Note
        <input
          aria-label="Optional note recorded on the status change"
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional note (kept on the audit trail)"
          type="text"
          value={note}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      {uncertain ? (
        <a className="text-link" href="/admin">
          Reload current feedback
        </a>
      ) : null}
    </div>
  );
}
