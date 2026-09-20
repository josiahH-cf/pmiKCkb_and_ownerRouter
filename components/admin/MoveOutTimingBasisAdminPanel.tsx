"use client";

import { useState } from "react";

import { Button, Field } from "@/components/ui";
import type {
  MoveOutTimingBasisAdminRead,
  MoveOutTimingBasisRecord,
} from "@/lib/firestore/lease-renewal-move-out-timing-basis";
import {
  MOVE_OUT_TIMING_COUNTING_RULES,
  MOVE_OUT_TIMING_COUNTING_RULE_LABELS,
  MOVE_OUT_TIMING_TARGET_KINDS,
  MOVE_OUT_TIMING_TARGET_LABELS,
  MOVE_OUT_TIMING_THRESHOLD_DAYS_DEFAULT,
  type MoveOutTimingCountingRule,
  type MoveOutTimingTargetKind,
} from "@/lib/lease-renewal/move-out-timing";

const UNSAVED_NOTES: Record<
  Exclude<MoveOutTimingBasisAdminRead["state"], "saved">,
  string
> = {
  missing:
    "No reviewed basis is saved. Every notice on the renewal desk reads Cannot determine until one is recorded here.",
  invalid:
    "The saved basis is not valid, so every notice reads Cannot determine. Record the reviewed basis again.",
  unreadable:
    "The saved basis could not be read right now. Reload before recording it; every notice reads Cannot determine meanwhile.",
};

/**
 * S125 (F04) Admin surface: records which target date and which counting rule the thirty-day
 * notice timing comparison uses, with a note naming who confirmed it. It records the app's own
 * reviewed configuration; it never decides law, fees or balances and never sends anything.
 */
export function MoveOutTimingBasisAdminPanel({
  initial,
  note,
}: Readonly<{ initial: MoveOutTimingBasisAdminRead; note?: string }>) {
  const [saved, setSaved] = useState<MoveOutTimingBasisRecord | null>(initial.record);
  const [readState, setReadState] = useState(initial.state);
  const [targetKind, setTargetKind] = useState<MoveOutTimingTargetKind>(
    initial.record?.target_kind ?? "expected_move_out",
  );
  const [countingRule, setCountingRule] = useState<MoveOutTimingCountingRule>(
    initial.record?.counting_rule ?? MOVE_OUT_TIMING_COUNTING_RULES[0],
  );
  const [thresholdDays, setThresholdDays] = useState<number>(
    initial.record?.threshold_days ?? MOVE_OUT_TIMING_THRESHOLD_DAYS_DEFAULT,
  );
  const [reviewedNote, setReviewedNote] = useState(initial.record?.reviewed_note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  async function save() {
    setPending(true);
    setError("");
    setOk(false);
    try {
      const response = await fetch("/api/admin/move-out-timing-basis", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetKind,
          countingRule,
          thresholdDays,
          reviewedNote: reviewedNote.trim(),
          expectedVersion: saved?.version ?? 0,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        timingBasis?: { state: "saved"; record: MoveOutTimingBasisRecord };
        error?: string;
      };
      if (response.ok && payload.timingBasis?.record) {
        setSaved(payload.timingBasis.record);
        setReadState("saved");
        setOk(true);
      } else {
        setError(payload.error ?? "Could not record the notice timing basis.");
      }
    } catch {
      setError("Could not record the notice timing basis.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="panel ui-stack" data-move-out-timing-basis-state={readState}>
      <div>
        <h2>Notice Timing Basis</h2>
        <p className="muted">
          Which date a move-out notice is compared against, and how the days are counted,
          for the thirty-day timing indicator on the renewal desk. It is an operational
          review cue: it never decides law, fees or balances and never sends anything.
        </p>
        {saved ? (
          <p className="muted">
            Current saved version: {saved.version}, recorded {saved.updated_at}.
          </p>
        ) : null}
      </div>
      {note ? <p className="muted">{note}</p> : null}
      {readState !== "saved" ? (
        <div className="notice notice-warning" role="status">
          <strong>Notice timing basis is not reviewed.</strong>
          <p>{UNSAVED_NOTES[readState]}</p>
        </div>
      ) : null}

      <form
        className="ui-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="Compare the notice against" htmlFor="move-out-timing-target">
          <select
            id="move-out-timing-target"
            onChange={(event) => {
              setTargetKind(event.target.value as MoveOutTimingTargetKind);
              setOk(false);
            }}
            value={targetKind}
          >
            {MOVE_OUT_TIMING_TARGET_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {MOVE_OUT_TIMING_TARGET_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Counting rule" htmlFor="move-out-timing-rule">
          <select
            id="move-out-timing-rule"
            onChange={(event) => {
              setCountingRule(event.target.value as MoveOutTimingCountingRule);
              setOk(false);
            }}
            value={countingRule}
          >
            {MOVE_OUT_TIMING_COUNTING_RULES.map((rule) => (
              <option key={rule} value={rule}>
                {MOVE_OUT_TIMING_COUNTING_RULE_LABELS[rule]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Threshold in calendar days" htmlFor="move-out-timing-threshold">
          <input
            id="move-out-timing-threshold"
            max={365}
            min={1}
            onChange={(event) => {
              setThresholdDays(Number(event.target.value));
              setOk(false);
            }}
            required
            type="number"
            value={thresholdDays}
          />
        </Field>
        <Field
          label="Who confirmed this basis, and where"
          htmlFor="move-out-timing-reviewed-note"
        >
          <input
            id="move-out-timing-reviewed-note"
            maxLength={500}
            onChange={(event) => {
              setReviewedNote(event.target.value);
              setOk(false);
            }}
            placeholder="For example: confirmed by the owner in the 2026-09 review"
            required
            type="text"
            value={reviewedNote}
          />
        </Field>
        <div className="ui-actions">
          <Button disabled={pending} size="large" type="submit">
            {pending ? "Recording…" : "Record reviewed basis"}
          </Button>
          {ok ? (
            <span className="muted" role="status">
              Recorded. Every desk read now uses version {saved?.version}.
            </span>
          ) : null}
          {error ? (
            <span className="form-error" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      </form>
    </article>
  );
}
