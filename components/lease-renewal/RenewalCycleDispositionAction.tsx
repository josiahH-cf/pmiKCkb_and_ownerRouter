"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmationDialog, Field } from "@/components/ui";
import { formatBusinessTimestamp, formatCalendarDate } from "@/lib/date-display";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";
import type {
  CycleDisposition,
  CycleDispositionRecord,
} from "@/lib/lease-renewal/cycle-disposition";
import type { ChangeRenewalCycleDisposition } from "@/lib/firestore/renewal-cycle-dispositions";

const endpoint = "/api/lease-renewal/cycle-disposition";
type Review = Pick<ChangeRenewalCycleDisposition, "action" | "expected">;

export function RenewalCycleDispositionAction({
  disposition,
  leaseId,
}: Readonly<{ disposition: CycleDisposition; leaseId: string }>) {
  const router = useRouter();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [sequenceId, setSequenceId] = useState<string | null>(null);
  const [draftAttemptId, setDraftAttemptId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState<ChangeRenewalCycleDisposition | null>(
    null,
  );
  const [retrySame, setRetrySame] = useState(false);
  const inFlight = useRef(false);

  function recorded(event: CycleDispositionRecord) {
    setUnconfirmed(null);
    setRetrySame(false);
    setReview(null);
    setReason("");
    setMessage(
      event.action === "retire" ? "Retirement recorded." : "Restoration recorded.",
    );
    router.refresh();
  }

  async function readAttempt(input: ChangeRenewalCycleDisposition) {
    try {
      const query = new URLSearchParams({ leaseId, operationId: input.operationId });
      const response = await fetchWithDeadline(`${endpoint}?${query}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("read failed");
      const { event } = (await response.json()) as {
        event: CycleDispositionRecord | null;
      };
      if (event?.operationId === input.operationId && event.leaseId === leaseId) {
        recorded(event);
        return;
      }
      setUnconfirmed(input);
      setRetrySame(true);
      setMessage(
        "The event is not visible yet. You can retry this exact decision without creating a duplicate.",
      );
    } catch {
      setUnconfirmed(input);
      setRetrySame(false);
      setMessage(
        "The result could not be read. Check this exact attempt before making another change.",
      );
    }
  }

  async function confirm() {
    if (inFlight.current || !review || !reason.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    setSequenceId(null);
    setDraftAttemptId(null);
    const input = unconfirmed ?? {
      ...review,
      reason,
      leaseId,
      operationId: crypto.randomUUID(),
    };
    try {
      if (unconfirmed && !retrySame) {
        await readAttempt(input);
        return;
      }
      const response = await fetchWithDeadline(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = (await response.json()) as {
        error?: string;
        sequenceId?: string;
        executionId?: string;
        event?: CycleDispositionRecord;
      };
      if (
        response.ok &&
        result.event?.operationId === input.operationId &&
        result.event.leaseId === leaseId
      ) {
        recorded(result.event);
      } else if (response.status >= 500 || response.ok) {
        await readAttempt(input);
      } else {
        setMessage(result.error ?? "The decision was refused. Your reason is kept.");
        setSequenceId(result.sequenceId ?? null);
        setDraftAttemptId(result.executionId ?? null);
        setUnconfirmed(null);
        setRetrySame(false);
        router.refresh();
      }
    } catch {
      await readAttempt(input);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const action = disposition.state === "retired" ? "restore" : "retire";
  const label = action === "retire" ? "Retire from renewals" : "Restore to renewals";
  const cycle = disposition.state === "unavailable" ? null : disposition.cycle;
  const reviewedLabel =
    review?.action === "restore" ? "Restore to renewals" : "Retire from renewals";
  return (
    <>
      <Button
        disabled={!cycle || busy}
        onClick={() => {
          if (!cycle || disposition.state === "unavailable") return;
          if (!unconfirmed) {
            setMessage("");
            setSequenceId(null);
            setDraftAttemptId(null);
          }
          setReview(
            unconfirmed ?? {
              action,
              expected: {
                cycle,
                revision: disposition.revision,
                workspaceRevision: disposition.workspaceRevision,
              },
            },
          );
        }}
        ref={trigger}
        size="compact"
        variant="secondary"
      >
        {unconfirmed ? "Check retirement attempt" : label}
      </Button>
      {!cycle ? <p className="muted">Refresh data to verify the current cycle.</p> : null}
      {!review && message ? <p role="status">{message}</p> : null}
      <ConfirmationDialog
        busy={busy}
        busyLabel={unconfirmed ? "Checking…" : "Recording…"}
        confirmDisabled={!reason.trim() && !unconfirmed}
        confirmLabel={
          unconfirmed
            ? retrySame
              ? "Retry this exact decision"
              : "Check saved decision"
            : reviewedLabel
        }
        description={
          review
            ? `Lease ${leaseId} · ${review.expected.cycle.kind === "lease_end" ? "Lease end" : "Annual review"} ${formatCalendarDate(review.expected.cycle.dateIso)}`
            : undefined
        }
        error={message || undefined}
        onCancel={() => setReview(null)}
        onConfirm={() => void confirm()}
        open={review !== null}
        title={reviewedLabel}
        triggerRef={trigger}
      >
        <p>
          {review?.action === "retire"
            ? "The cycle moves to Retired on the desk and leaves active renewal targeting and preparation. Its history, source status and collection memberships remain available."
            : "Current source facts decide where the cycle appears on the desk. Restoration does not resume messages or comparisons."}
        </p>
        <Field label="Reason" htmlFor={id}>
          <textarea
            id={id}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            maxLength={1000}
            rows={3}
            disabled={busy || Boolean(unconfirmed)}
          />
        </Field>
        {sequenceId ? (
          <a href={`/gmail-hub?communication=${encodeURIComponent(sequenceId)}`}>
            Open the pending communication
          </a>
        ) : null}
        {draftAttemptId ? (
          <a
            href={`?view=full#renewal-draft-attempt-${encodeURIComponent(draftAttemptId)}`}
          >
            Open the pending Gmail draft attempt
          </a>
        ) : null}
      </ConfirmationDialog>
    </>
  );
}

export function RenewalCycleDispositionHistory({
  leaseId,
}: Readonly<{ leaseId: string }>) {
  const [result, setResult] = useState<
    | { events: CycleDispositionRecord[]; truncated: boolean }
    | "reading"
    | "unavailable"
    | null
  >(null);
  async function readHistory() {
    setResult("reading");
    try {
      const response = await fetchWithDeadline(
        `${endpoint}?leaseId=${encodeURIComponent(leaseId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("read failed");
      setResult(await response.json());
    } catch {
      setResult("unavailable");
    }
  }
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) void readHistory();
      }}
    >
      <summary>Retirement and restoration history</summary>
      {result === "reading" ? <p role="status">Reading history…</p> : null}
      {result === "unavailable" ? (
        <p role="status">
          History could not be read.{" "}
          <Button onClick={() => void readHistory()} size="compact" variant="tertiary">
            Try again
          </Button>
        </p>
      ) : null}
      {typeof result === "object" && result ? (
        <>
          <ol>
            {result.events.map((event) => (
              <li key={event.operationId}>
                {event.action === "retire" ? "Retired" : "Restored"} ·{" "}
                {formatCalendarDate(event.cycle.dateIso)} · {event.reason} ·{" "}
                {event.actorUid} · {formatBusinessTimestamp(event.at)}
              </li>
            ))}
          </ol>
          {result.truncated ? <p>Showing the 50 most recent entries.</p> : null}
        </>
      ) : null}
    </details>
  );
}
