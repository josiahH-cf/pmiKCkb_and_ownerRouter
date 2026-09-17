"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Field } from "@/components/ui";
import {
  NOT_RECORDED_WORK_STATUS_LABEL,
  RENEWAL_WORK_STATUSES,
  RENEWAL_WORK_STATUS_CONTROL_LABEL,
  RENEWAL_WORK_STATUS_LABELS,
  RENEWAL_WORK_STATUS_SAVE_LABEL,
  WORK_STATUS_CYCLE_NOTES,
  formatWorkStatusRecordedAt,
  projectRenewalWorkStatus,
  workStatusQueryKey,
  type RenewalWorkStatus,
  type RenewalWorkStatusActivity,
  type RenewalWorkStatusPanelInput,
  type RenewalWorkStatusRecord,
} from "@/lib/lease-renewal/work-status";

/**
 * S119: select and save the staff work status for one lease. Selecting changes only the local
 * choice; Save status persists it through the app-owned route and shows the actual result. A
 * failed save keeps the last saved value, a stale save reads the current value back, and a lost
 * response is resolved by reading the saved record, never by writing again. Nothing here records
 * approval, delivery, a signature, completion or a source update.
 */
export function RenewalWorkStatusControl({
  leaseId,
  canEdit,
  read,
}: Readonly<{
  leaseId: string;
  canEdit: boolean;
  read: RenewalWorkStatusPanelInput;
}>) {
  const router = useRouter();
  const [available, setAvailable] = useState(read.available);
  const [saved, setSaved] = useState<RenewalWorkStatusRecord | null>(read.record);
  const [history, setHistory] = useState<readonly RenewalWorkStatusActivity[]>(
    read.history,
  );
  const [selected, setSelected] = useState<RenewalWorkStatus | "">(
    read.record?.status ?? "",
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const outstanding = useRef<{ key: string; id: string } | null>(null);
  const controlId = `renewal-work-status-${leaseId}`;

  const projection = projectRenewalWorkStatus(
    available ? { available: true, record: saved } : { available: false },
    read.currentCycleId,
  );
  const dirty = selected !== "" && selected !== (saved?.status ?? "");
  const canSave = canEdit && available && !pending && dirty;

  async function readBack(): Promise<{
    record: RenewalWorkStatusRecord | null;
    history: RenewalWorkStatusActivity[];
  } | null> {
    try {
      const response = await fetch(
        `/api/lease-renewal/work-status?leaseId=${encodeURIComponent(leaseId)}`,
        { method: "GET" },
      );
      const body = (await response.json().catch(() => ({}))) as {
        record?: RenewalWorkStatusRecord | null;
        history?: RenewalWorkStatusActivity[];
      };
      if (!response.ok) return null;
      return { record: body.record ?? null, history: body.history ?? [] };
    } catch {
      return null;
    }
  }

  function applyCurrent(
    record: RenewalWorkStatusRecord | null,
    entries: readonly RenewalWorkStatusActivity[],
  ) {
    setSaved(record);
    setHistory(entries);
    setAvailable(true);
  }

  async function save() {
    if (!canSave) return;
    const status = selected as RenewalWorkStatus;
    const expectedRevision = saved?.revision ?? 0;
    const key = `${status}:${expectedRevision}`;
    if (outstanding.current?.key !== key)
      outstanding.current = { key, id: crypto.randomUUID() };
    const operationId = outstanding.current.id;
    const label = RENEWAL_WORK_STATUS_LABELS[status];
    setPending(true);
    setMessage("");
    try {
      let response: { ok: boolean; status: number; json: () => Promise<unknown> };
      try {
        response = await fetch("/api/lease-renewal/work-status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            leaseId,
            status,
            expectedRevision,
            operationId,
          }),
        });
      } catch {
        // The response was lost. Read the saved state; the operation id proves whether it landed.
        const current = await readBack();
        if (current?.record?.eventId === operationId) {
          outstanding.current = null;
          applyCurrent(current.record, current.history);
          setMessage(
            `Saved: ${label}. The save response was lost, so the saved status was read back to confirm it.`,
          );
          router.refresh();
        } else if (current) {
          applyCurrent(current.record, current.history);
          setMessage(
            "The save response was lost and the status was not saved. Choose Save status to retry.",
          );
        } else {
          setMessage(
            "The save response was lost and the saved status could not be read back. Reload before retrying.",
          );
        }
        return;
      }
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        record?: RenewalWorkStatusRecord;
        history?: RenewalWorkStatusActivity[];
      };
      if (!response.ok || !body.record) {
        const error = body.error ?? "The status could not be saved.";
        if (response.status === 409) {
          const current = await readBack();
          if (current) {
            applyCurrent(current.record, current.history);
            // The page's compact context and desk row read the server projection; refresh them.
            router.refresh();
          }
          setMessage(
            `Not saved: ${error} The current saved value is shown here; review it, then choose again.`,
          );
        } else {
          setMessage(`Not saved: ${error}`);
        }
        return;
      }
      outstanding.current = null;
      applyCurrent(body.record, body.history ?? []);
      setSelected(body.record.status);
      setMessage(
        `Saved: ${RENEWAL_WORK_STATUS_LABELS[body.record.status]}. Recorded by ${body.record.recordedByLabel} at ${formatWorkStatusRecordedAt(body.record.recordedAt)}.`,
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ui-stack-tight renewal-work-status">
      <p
        className="renewal-work-status-saved"
        data-testid="renewal-work-status-saved"
        data-work-status={workStatusQueryKey(projection)}
      >
        {projection.state === "recorded" ? (
          <>
            Saved status: <strong>{projection.label}</strong>, recorded by{" "}
            {projection.recordedByLabel} at{" "}
            <time dateTime={projection.recordedAt}>
              {formatWorkStatusRecordedAt(projection.recordedAt)}
            </time>
            . {WORK_STATUS_CYCLE_NOTES[projection.cycleRelation]}
          </>
        ) : projection.state === "not_recorded" ? (
          `Saved status: ${NOT_RECORDED_WORK_STATUS_LABEL}.`
        ) : (
          "Work status could not be read. Reload before saving; the last saved status is unknown."
        )}
      </p>
      <Field htmlFor={controlId} label={RENEWAL_WORK_STATUS_CONTROL_LABEL}>
        <select
          className="ui-input"
          disabled={!canEdit || !available || pending}
          id={controlId}
          onChange={(event) => setSelected(event.target.value as RenewalWorkStatus | "")}
          value={selected}
        >
          {saved ? null : (
            <option disabled value="">
              {available ? NOT_RECORDED_WORK_STATUS_LABEL : "Not read"}
            </option>
          )}
          {RENEWAL_WORK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {RENEWAL_WORK_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </Field>
      {dirty ? (
        <p className="muted">
          Selected, not saved yet:{" "}
          {RENEWAL_WORK_STATUS_LABELS[selected as RenewalWorkStatus]}. Choose{" "}
          {RENEWAL_WORK_STATUS_SAVE_LABEL} to record it.
        </p>
      ) : null}
      {canEdit ? null : (
        <p className="muted">
          Saving the status needs Editor access in the Renewals Space. The saved value
          stays visible.
        </p>
      )}
      <button
        className="secondary-button"
        disabled={!canSave}
        onClick={() => void save()}
        type="button"
      >
        {pending ? "Saving…" : RENEWAL_WORK_STATUS_SAVE_LABEL}
      </button>
      {message ? <p role="status">{message}</p> : null}
      <details className="renewal-work-status-history">
        <summary>Status history</summary>
        {history.length === 0 ? (
          <p className="muted">No status changes recorded yet.</p>
        ) : (
          <ol className="ui-rows">
            {history.map((entry) => (
              <li key={entry.id}>
                {RENEWAL_WORK_STATUS_LABELS[entry.status]} (was{" "}
                {entry.previousStatus
                  ? RENEWAL_WORK_STATUS_LABELS[entry.previousStatus]
                  : NOT_RECORDED_WORK_STATUS_LABEL}
                ), recorded by {entry.recordedByLabel} at{" "}
                <time dateTime={entry.recordedAt}>
                  {formatWorkStatusRecordedAt(entry.recordedAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  );
}
