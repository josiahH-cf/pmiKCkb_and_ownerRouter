"use client";
import { useRenewalSaveFocus } from "./RenewalSaveFocus";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RenewalNoticeSafety } from "@/lib/firestore/renewal-notice-safety";
import type { MoveOutEvidence } from "@/lib/lease-renewal/move-out-disposition";
import { formatCalendarDate, formatBusinessTimestamp } from "@/lib/date-display";
function EvidenceReadback({
  evidence,
  sourceReadAt,
  freshness,
}: {
  evidence: MoveOutEvidence;
  sourceReadAt: { lease: number; status: number };
  freshness: string;
}) {
  const flag = (value: boolean | null) =>
    value === null ? "Unknown" : value ? "Yes" : "No";
  return (
    <p>
      Provider status: {evidence.statusName ?? "Unknown"}; pending move-out:{" "}
      {flag(evidence.pendingMoveOut)}; completed move-out:{" "}
      {flag(evidence.completedMoveOut)}. Notice:{" "}
      {formatCalendarDate(evidence.noticeDateIso)}; expected move-out:{" "}
      {formatCalendarDate(evidence.expectedMoveOutIso)}; move-out:{" "}
      {formatCalendarDate(evidence.moveOutIso)}. Lease source read:{" "}
      {formatBusinessTimestamp(new Date(sourceReadAt.lease).toISOString())}; status source
      read: {formatBusinessTimestamp(new Date(sourceReadAt.status).toISOString())}. Source
      age state when recorded: {freshness}.
    </p>
  );
}
/** Explicit staff evidence recording, including before a renewal cycle has been selected. */
export function RenewalNoticeReview({
  leaseId,
  canEdit,
}: {
  leaseId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const focusAfterSave = useRenewalSaveFocus();
  const [current, setCurrent] = useState<RenewalNoticeSafety | null>(null);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let mounted = true;
    fetch(`/api/lease-renewal/notice-review?leaseId=${encodeURIComponent(leaseId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "Notice review could not be read.");
        if (mounted) setCurrent(body);
      })
      .catch(() => {
        if (mounted)
          setStatus("Notice review is unavailable. Refresh the source before outreach.");
      });
    return () => {
      mounted = false;
    };
  }, [leaseId]);
  const action =
    current?.disposition.state === "initiated"
      ? "record_notice"
      : current?.disposition.reason === "withdrawal_review_required"
        ? "review_withdrawal"
        : null;
  async function save() {
    if (!action || !current?.basis || !reason.trim() || pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/lease-renewal/notice-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leaseId,
          action,
          expected: current.basis,
          operationId: crypto.randomUUID(),
          reason: reason.trim(),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "The evidence changed; reload and review again.");
      setCurrent(body);
      setReason("");
      setStatus("Staff notice review recorded. Review a fresh message before outreach.");
      if (!focusAfterSave?.()) router.refresh();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Notice review could not be recorded.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section aria-label="Notice evidence review">
      <p>{current?.disposition.label ?? "Reading notice review…"}</p>
      {current?.history ? (
        <details>
          <summary>Recorded notice evidence for this tenancy and cycle</summary>
          <p>
            Staff recorded the positive RentVine observation from{" "}
            {formatBusinessTimestamp(current.history.positive.observedAt)}.
          </p>
          <EvidenceReadback {...current.history.positive} />
          {current.history.withdrawal ? (
            <>
              <p>
                Staff reviewed clear source evidence on{" "}
                {formatBusinessTimestamp(current.history.withdrawal.reviewedAt)}. This
                staff review does not prove provider cancellation.
              </p>
              <EvidenceReadback {...current.history.withdrawal} />
            </>
          ) : null}
        </details>
      ) : null}
      {current && !current.cycleId ? (
        <p className="muted">
          This review is for the current verified tenancy before a cycle is selected. It
          does not start a renewal cycle; a new cycle needs its own review.
        </p>
      ) : null}
      {current?.reason ? <p role="status">{current.reason}</p> : null}
      {canEdit && action && current?.ready ? (
        <>
          <label>
            Notice review reason
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
            />
          </label>
          <p className="muted">
            This records staff evidence only. It does not cancel a provider notice, clear
            a non-renewal decision, create a draft, or send a message.
          </p>
          <button
            type="button"
            disabled={pending || !reason.trim()}
            onClick={() => void save()}
          >
            {action === "record_notice"
              ? "Record this notice evidence"
              : "Record reviewed withdrawal"}
          </button>
        </>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
    </section>
  );
}
