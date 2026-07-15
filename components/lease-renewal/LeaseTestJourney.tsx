"use client";

import { useState } from "react";

import { LEASE_EXECUTION_DEFINITION_MAP } from "@/lib/lease-renewal/execution/matrix";
import {
  LEASE_TEST_ACTIONS,
  LEASE_TEST_ACTION_TARGETS,
  LEASE_TEST_CONFIRMATION,
  LEASE_TEST_RUN_STATUSES,
  leaseTestActionDependencies,
  nextLeaseTestRunStatus,
  type LeaseTestActionAttempt,
  type LeaseTestActionReceipt,
  type LeaseTestRunRecord,
} from "@/lib/lease-renewal/test-workflow";

export function LeaseTestJourney({
  initialRun,
  initialReceipts,
  initialAttempts,
}: Readonly<{
  initialRun: LeaseTestRunRecord;
  initialReceipts: LeaseTestActionReceipt[];
  initialAttempts: LeaseTestActionAttempt[];
}>) {
  const [run, setRun] = useState(initialRun);
  const [receipts, setReceipts] = useState(initialReceipts);
  const [attempts, setAttempts] = useState(initialAttempts);
  const [actionKey, setActionKey] = useState(
    () =>
      LEASE_TEST_ACTIONS.find(
        (key) => !initialReceipts.some((receipt) => receipt.action_key === key),
      ) ?? LEASE_TEST_ACTIONS[0],
  );
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<"status" | "action" | null>(null);
  const [message, setMessage] = useState("");

  const nextStatus = nextLeaseTestRunStatus(run.status);
  const completedKeys = new Set(receipts.map((receipt) => receipt.action_key));
  const dependencies = leaseTestActionDependencies(actionKey);
  const missingDependencies = dependencies.filter((key) => !completedKeys.has(key));
  const completedReceipt = receipts.find((receipt) => receipt.action_key === actionKey);
  const canRunAction =
    run.status === "Executing" && missingDependencies.length === 0 && !completedReceipt;
  const doneBlocked =
    nextStatus === "Done" && completedKeys.size !== LEASE_TEST_ACTIONS.length;

  async function advanceStatus() {
    if (!nextStatus || doneBlocked || pending) return;
    setPending("status");
    setMessage("");
    try {
      const response = await fetch(
        `/api/lease-renewal/test-runs/${encodeURIComponent(run.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nextStatus }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        run?: LeaseTestRunRecord;
        error?: string;
      };
      if (response.ok && payload.run) {
        setRun(payload.run);
        setMessage(
          payload.run.status === "Done"
            ? "Lease Test journey is Done. All evidence is internal and not Live proof."
            : `App status moved to ${payload.run.status}.`,
        );
      } else {
        setMessage(payload.error ?? "Could not move the Lease Test run.");
      }
    } catch {
      setMessage("Could not reach the Lease Test run service.");
    } finally {
      setPending(null);
    }
  }

  async function simulateAction() {
    if (!confirmed || !canRunAction || pending) return;
    setPending("action");
    setMessage("");
    try {
      const response = await fetch(
        `/api/lease-renewal/test-runs/${encodeURIComponent(run.id)}/test-actions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            actionKey,
            confirmation: LEASE_TEST_CONFIRMATION,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        receipt?: LeaseTestActionReceipt;
        attempt?: LeaseTestActionAttempt;
        error?: string;
      };
      if (response.ok && payload.receipt && payload.attempt) {
        const nextReceipts = [
          ...receipts.filter((receipt) => receipt.id !== payload.receipt!.id),
          payload.receipt,
        ];
        setReceipts(nextReceipts);
        setAttempts((previous) => [
          ...previous.filter((attempt) => attempt.id !== payload.attempt!.id),
          payload.attempt!,
        ]);
        setConfirmed(false);
        setMessage(
          "Bodyless Test attempt and receipt recorded. Provider contacted: No. Live proof eligible: No.",
        );
        const nextAction = LEASE_TEST_ACTIONS.find(
          (key) => !nextReceipts.some((receipt) => receipt.action_key === key),
        );
        if (nextAction) setActionKey(nextAction);
      } else {
        setMessage(payload.error ?? "Could not record the Lease Test action.");
      }
    } catch {
      setMessage("Could not reach the Lease Test action service.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="panel ui-stack" aria-label="Persistent Lease Test journey">
      <div className="ui-spread">
        <div>
          <h2 className="section-subtitle">Production Test Lease journey</h2>
          <p>
            <span className="queue-pill" data-value="Needs Attention">
              TEST DATA
            </span>{" "}
            <strong>{run.property_label}</strong>
          </p>
          <p className="muted">
            {run.resident_label} ({run.resident_email}) · invented aliases only
          </p>
        </div>
        <span
          className="queue-pill"
          data-value={run.status === "Done" ? "Completed" : "Scheduled"}
        >
          {run.status}
        </span>
      </div>

      <ol className="ui-row" aria-label="Lease Test status progression">
        {LEASE_TEST_RUN_STATUSES.map((status) => (
          <li key={status}>
            {status === run.status ? <strong>{status}</strong> : status}
          </li>
        ))}
      </ol>
      <p className="muted">
        {completedKeys.size} of {LEASE_TEST_ACTIONS.length} Test actions complete ·{" "}
        {attempts.length} bodyless attempt{attempts.length === 1 ? "" : "s"} · zero
        Live-provider calls
      </p>
      {nextStatus ? (
        <div>
          <button
            className="secondary-button"
            disabled={pending !== null || doneBlocked}
            onClick={() => void advanceStatus()}
            type="button"
          >
            {pending === "status" ? "Saving…" : `Move to ${nextStatus}`}
          </button>
          {doneBlocked ? (
            <p className="muted">
              Done unlocks after all {LEASE_TEST_ACTIONS.length} explicit Test actions
              have one receipt.
            </p>
          ) : null}
        </div>
      ) : (
        <p>
          <strong>Done:</strong> this Test run is complete inside the app. It is not Live
          provider evidence.
        </p>
      )}

      <section
        className="ui-callout ui-stack"
        aria-label="Lease Test external action simulator"
      >
        <h3 className="section-subtitle">Explicit Test action</h3>
        <label className="select-field" htmlFor={`lease-test-action-${run.id}`}>
          Action
          <select
            id={`lease-test-action-${run.id}`}
            onChange={(event) => {
              setActionKey(event.target.value as (typeof LEASE_TEST_ACTIONS)[number]);
              setConfirmed(false);
              setMessage("");
            }}
            value={actionKey}
          >
            {LEASE_TEST_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
                {completedKeys.has(action) ? " — recorded" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="queue-detail-grid">
          <PreviewField label="Action" value={actionKey} />
          <PreviewField label="Target" value={LEASE_TEST_ACTION_TARGETS[actionKey]} />
          <PreviewField
            label="Risk"
            value={LEASE_EXECUTION_DEFINITION_MAP.get(actionKey)?.risk ?? "Unknown"}
          />
          <PreviewField label="Effect" value="Internal simulated-success receipt only" />
        </div>
        <p className="muted">
          Provider contacted: No · Live proof eligible: No · no message body or provider
          payload is stored.
        </p>
        {dependencies.length > 0 ? (
          <p className="muted">
            Requires: {dependencies.join(", ")}
            {missingDependencies.length > 0
              ? ` (complete first: ${missingDependencies.join(", ")})`
              : " (complete)"}
          </p>
        ) : null}
        {run.status !== "Executing" && run.status !== "Done" ? (
          <p className="muted">Move the run to Executing to enable Test actions.</p>
        ) : null}
        <label className="ui-row">
          <input
            checked={confirmed}
            disabled={!canRunAction}
            onChange={(event) => setConfirmed(event.target.checked)}
            type="checkbox"
          />
          I confirm this exact Test action and target.
        </label>
        <button
          className="secondary-button"
          disabled={!confirmed || !canRunAction || pending !== null}
          onClick={() => void simulateAction()}
          type="button"
        >
          {completedReceipt
            ? "Test action recorded"
            : pending === "action"
              ? "Recording…"
              : "Run Test action"}
        </button>
        {completedReceipt ? (
          <p className="muted">
            This exact run/action has one idempotent attempt and receipt. A retry returns
            the same evidence and cannot create another simulated effect.
          </p>
        ) : null}
      </section>

      {message ? <p className="muted">{message}</p> : null}
      {receipts.length > 0 ? (
        <details>
          <summary>Bodyless Test evidence ({receipts.length})</summary>
          <ul>
            {receipts.map((receipt) => (
              <li key={receipt.id}>
                {receipt.action_key} → {receipt.target_label} — attempt 1 succeeded;
                simulated receipt; no provider contacted; not Live proof
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function PreviewField({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="queue-detail-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
