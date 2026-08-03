"use client";

import { useState } from "react";

import { UnitTypeahead } from "@/components/maintenance/UnitTypeahead";
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

  async function act(intakeId: string, action: "promote" | "dismiss", body?: unknown) {
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
      } else {
        setStatus(payload.error ?? "Could not update the intake.");
      }
    } catch {
      setStatus("Network error. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  function dismiss(intakeId: string) {
    const reason = window.prompt("Why is this intake being dismissed?")?.trim();
    if (!reason) {
      setStatus("A reason is required to dismiss an intake.");
      return;
    }
    const row = intake.find((candidate) => candidate.id === intakeId);
    if (!row) return;
    void act(intakeId, "dismiss", { reason });
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
            <button
              type="button"
              disabled={pendingId === row.id}
              onClick={() =>
                act(
                  row.id,
                  "promote",
                  selectedUnits[row.id] ? { unit: selectedUnits[row.id] } : undefined,
                )
              }
            >
              Promote to Live app ticket
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={pendingId === row.id}
              onClick={() => dismiss(row.id)}
            >
              Dismiss
            </button>
          </div>
        </article>
      ))}
      {status ? <p className="muted">{status}</p> : null}
    </section>
  );
}
