"use client";

import { useState } from "react";

import { UnitTypeahead } from "@/components/maintenance/UnitTypeahead";
import { Button, ConfirmationDialog } from "@/components/ui";
import type { UnverifiedIntakeRecord } from "@/lib/maintenance/intake-model";

// Staff triage for the public tokenized intake (2d). Lists what the unauthenticated ingress captured and
// lets an editor PROMOTE each report into a real ticket (external reporter, unit still Needs Verification)
// or DISMISS it as junk with a reason. Read + app-plane transitions only; promotion creates a KB ticket,
// never a system-of-record work order. A promoted/dismissed row leaves the list.

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function UnverifiedIntakeReview({
  initialIntake,
  unavailableNote,
}: Readonly<{ initialIntake: UnverifiedIntakeRecord[]; unavailableNote?: string }>) {
  const [intake, setIntake] = useState(
    initialIntake.filter((record) => record.data_mode === "live"),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingDismiss, setPendingDismiss] = useState<UnverifiedIntakeRecord | null>(
    null,
  );
  const [dismissReason, setDismissReason] = useState("");
  const [dismissError, setDismissError] = useState("");
  const [status, setStatus] = useState("");
  // Optional per-row unit confirmation before promotion (slice 2a). Absence keeps the default
  // Needs-Verification promote unchanged.
  const [selectedUnits, setSelectedUnits] = useState<
    Record<string, { unitId: string; label: string }>
  >({});

  if (unavailableNote) {
    return (
      <section aria-label="Unverified intake" className="ui-stack">
        <h2 className="section-subtitle">Unverified intake</h2>
        <p className="muted">{unavailableNote}</p>
      </section>
    );
  }

  async function act(
    intakeId: string,
    action: "promote" | "dismiss",
    body?: unknown,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    setPendingId(intakeId);
    setStatus("");
    try {
      const response = await fetch(
        `/api/maintenance/intake/${encodeURIComponent(intakeId)}/${action}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (response.ok) {
        setIntake((prev) => prev.filter((row) => row.id !== intakeId));
        setStatus(
          action === "promote"
            ? "Promoted to a Live app ticket (unit needs verification; no provider effect was created)."
            : "Dismissed.",
        );
        return { ok: true };
      } else {
        const message = payload.error ?? "Could not update the intake. Try again.";
        setStatus(message);
        return { ok: false, message };
      }
    } catch {
      const message = "Could not reach the intake service. Try again.";
      setStatus(message);
      return { ok: false, message };
    } finally {
      setPendingId(null);
    }
  }

  function requestDismiss(intakeId: string) {
    const row = intake.find((candidate) => candidate.id === intakeId);
    if (!row) return;
    setPendingDismiss(row);
    setDismissReason("");
    setDismissError("");
  }

  async function confirmDismiss() {
    const row = pendingDismiss;
    const reason = dismissReason.trim();
    if (!row || pendingId || !reason) return;
    setDismissError("");
    const result = await act(row.id, "dismiss", { reason });
    if (result.ok) {
      setPendingDismiss(null);
      setDismissReason("");
    } else {
      setDismissError(result.message);
    }
  }

  return (
    <section aria-label="Unverified intake" className="ui-stack">
      <h2 className="section-subtitle">Unverified intake ({intake.length})</h2>
      <p className="muted">
        Reports submitted through a public intake link. Review each, then promote it to a
        tracked Live ticket or dismiss it.
      </p>
      {intake.length === 0 ? (
        <p className="muted">No unverified intake right now.</p>
      ) : null}
      {intake.map((row) => (
        <article key={row.id} className="ui-card ui-stack">
          <div>
            <p>
              <span className="queue-pill" data-value="Scheduled">
                LIVE INTAKE
              </span>{" "}
              <strong>{row.summary}</strong>
            </p>
            <div className="muted">
              {formatWhen(row.created_at)}
              {row.contact ? ` · contact: ${row.contact}` : ""} · property:{" "}
              {row.property_key}
            </div>
          </div>
          {row.description ? <p>{row.description}</p> : null}
          <UnitTypeahead
            id={`intake-unit-${row.id}`}
            label="Confirm unit (optional)"
            onSelect={(unit) =>
              setSelectedUnits((prev) => {
                const next = { ...prev };
                if (unit) next[row.id] = unit;
                else delete next[row.id];
                return next;
              })
            }
          />
          <div className="ui-row">
            <Button
              busy={pendingId === row.id && pendingDismiss?.id !== row.id}
              busyLabel="Promoting to Live app ticket"
              disabled={pendingId === row.id}
              onClick={() =>
                void act(
                  row.id,
                  "promote",
                  selectedUnits[row.id] ? { unit: selectedUnits[row.id] } : undefined,
                )
              }
            >
              Promote to Live app ticket
            </Button>
            <Button
              disabled={pendingId === row.id}
              onClick={() => requestDismiss(row.id)}
              variant="secondary"
            >
              Dismiss
            </Button>
          </div>
        </article>
      ))}
      <p aria-atomic="true" aria-live="polite" className="muted" role="status">
        {status}
      </p>
      <ConfirmationDialog
        busy={pendingId === pendingDismiss?.id}
        busyLabel="Dismissing intake"
        confirmDisabled={dismissReason.trim().length === 0}
        confirmLabel="Dismiss intake"
        confirmVariant="destructive"
        description="This removes the report from the unverified intake queue. No provider record is changed."
        error={dismissError}
        onCancel={() => {
          setPendingDismiss(null);
          setDismissReason("");
          setDismissError("");
        }}
        onConfirm={() => void confirmDismiss()}
        open={pendingDismiss !== null}
        title="Dismiss unverified intake"
      >
        {pendingDismiss ? (
          <>
            <dl className="ui-confirmation-summary">
              <dt>Intake</dt>
              <dd>{pendingDismiss.summary}</dd>
              <dt>Property</dt>
              <dd>{pendingDismiss.property_key}</dd>
            </dl>
            <label htmlFor="maintenance-intake-dismiss-reason">
              Reason
              <textarea
                disabled={pendingId === pendingDismiss.id}
                id="maintenance-intake-dismiss-reason"
                onChange={(event) => setDismissReason(event.target.value)}
                required
                rows={3}
                value={dismissReason}
              />
            </label>
          </>
        ) : null}
      </ConfirmationDialog>
    </section>
  );
}
