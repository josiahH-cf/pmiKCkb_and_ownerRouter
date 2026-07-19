"use client";

import { useState } from "react";

import { LEASE_EXECUTION_DEFINITION_MAP } from "@/lib/lease-renewal/execution/matrix";
import {
  LEASE_TEST_ACTIONS,
  LEASE_TEST_ACTION_TARGETS,
  LEASE_TEST_ALIASES,
  LEASE_TEST_BUSINESS_ACTIONS,
  LEASE_TEST_BUSINESS_ACTION_EFFECTS,
  LEASE_TEST_BUSINESS_ACTION_LABELS,
  LEASE_TEST_BUSINESS_CONFIRMATION,
  LEASE_TEST_CONFIRMATION,
  LEASE_TEST_RUN_STATUSES,
  LEASE_TEST_RUN_STATUS_LABELS,
  leaseTestCompletionBoundary,
  leaseTestActionDependencies,
  leaseTestBusinessActionAvailability,
  leaseTestBusinessActionBlocker,
  nextLeaseTestRunStatus,
  type LeaseTestActionAttempt,
  type LeaseTestActionReceipt,
  type LeaseTestBusinessAction,
  type LeaseTestBusinessEvent,
  type LeaseTestRunRecord,
} from "@/lib/lease-renewal/test-workflow";

export function LeaseTestJourney({
  initialRun,
  initialReceipts,
  initialAttempts,
  initialBusinessEvents = [],
}: Readonly<{
  initialRun: LeaseTestRunRecord;
  initialReceipts: LeaseTestActionReceipt[];
  initialAttempts: LeaseTestActionAttempt[];
  initialBusinessEvents?: LeaseTestBusinessEvent[];
}>) {
  const [run, setRun] = useState(initialRun);
  const [receipts, setReceipts] = useState(initialReceipts);
  const [attempts, setAttempts] = useState(initialAttempts);
  const [businessEvents, setBusinessEvents] = useState(initialBusinessEvents);
  const [actionKey, setActionKey] = useState(
    () =>
      LEASE_TEST_ACTIONS.find(
        (key) => !initialReceipts.some((receipt) => receipt.action_key === key),
      ) ?? LEASE_TEST_ACTIONS[0],
  );
  const [confirmed, setConfirmed] = useState(false);
  const [businessAction, setBusinessAction] = useState<LeaseTestBusinessAction>(
    LEASE_TEST_BUSINESS_ACTIONS.find(
      (candidate) =>
        leaseTestBusinessActionAvailability(initialRun, initialReceipts, candidate)
          .available,
    ) ?? LEASE_TEST_BUSINESS_ACTIONS[0],
  );
  const [businessConfirmed, setBusinessConfirmed] = useState(false);
  const [pending, setPending] = useState<"status" | "action" | "business" | null>(null);
  const [message, setMessage] = useState("");

  const nextStatus = nextLeaseTestRunStatus(run.status);
  const completedKeys = new Set(receipts.map((receipt) => receipt.action_key));
  const dependencies = leaseTestActionDependencies(actionKey);
  const missingDependencies = dependencies.filter((key) => !completedKeys.has(key));
  const completedReceipt = receipts.find((receipt) => receipt.action_key === actionKey);
  const actionBusinessBlocker = leaseTestBusinessActionBlocker(run, actionKey);
  const businessAvailability = leaseTestBusinessActionAvailability(
    run,
    receipts,
    businessAction,
  );
  const completionBoundary = leaseTestCompletionBoundary(run, receipts);
  const canRunAction =
    run.status === "Executing" &&
    missingDependencies.length === 0 &&
    !completedReceipt &&
    !actionBusinessBlocker;
  const doneBlocked =
    nextStatus === "Done" &&
    (completedKeys.size !== LEASE_TEST_ACTIONS.length ||
      run.business_test_status !== "test_complete");

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
            ? "Lease App Test is complete. Business closeout remains not proven and is not Live proof."
            : `App status moved to ${LEASE_TEST_RUN_STATUS_LABELS[payload.run.status]}.`,
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

  async function recordBusinessMilestone() {
    if (!businessConfirmed || !businessAvailability.available || pending) return;
    setPending("business");
    setMessage("");
    try {
      const response = await fetch(
        `/api/lease-renewal/test-runs/${encodeURIComponent(run.id)}/business-events`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: businessAction,
            confirmation: LEASE_TEST_BUSINESS_CONFIRMATION,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        run?: LeaseTestRunRecord;
        event?: LeaseTestBusinessEvent;
        duplicate?: boolean;
        error?: string;
      };
      if (response.ok && payload.run && payload.event) {
        setRun(payload.run);
        setBusinessEvents((current) => [
          ...current.filter((event) => event.id !== payload.event!.id),
          payload.event!,
        ]);
        setBusinessConfirmed(false);
        const nextAction = LEASE_TEST_BUSINESS_ACTIONS.find(
          (candidate) =>
            leaseTestBusinessActionAvailability(payload.run!, receipts, candidate)
              .available,
        );
        if (nextAction) setBusinessAction(nextAction);
        setMessage(
          payload.run.status === "Moved to Move-Out"
            ? "Test Move-Out handoff started. Remaining renewal actions are disabled; no Live record was created."
            : payload.duplicate
              ? "No duplicate milestone was written; the original Test event remains authoritative."
              : "Bodyless Test business milestone recorded. This is not Live business proof.",
        );
      } else {
        setMessage(payload.error ?? "Could not record the Lease Test milestone.");
      }
    } catch {
      setMessage("Could not reach the Lease Test business service.");
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
          data-value={
            run.status === "Done" || run.status === "Moved to Move-Out"
              ? "Completed"
              : "Scheduled"
          }
        >
          {LEASE_TEST_RUN_STATUS_LABELS[run.status]}
        </span>
      </div>

      <ol className="ui-row" aria-label="Lease Test status progression">
        {LEASE_TEST_RUN_STATUSES.map((status) => (
          <li key={status}>
            {status === run.status ? (
              <strong>{LEASE_TEST_RUN_STATUS_LABELS[status]}</strong>
            ) : (
              LEASE_TEST_RUN_STATUS_LABELS[status]
            )}
          </li>
        ))}
      </ol>
      <p className="muted">
        {completedKeys.size} of {LEASE_TEST_ACTIONS.length} Test actions complete ·{" "}
        {attempts.length} bodyless attempt{attempts.length === 1 ? "" : "s"} · zero
        Live-provider calls
      </p>
      <section
        className="ui-callout ui-stack"
        aria-label="Lease Test business milestones"
      >
        <div>
          <h3 className="section-subtitle">Business-process Test milestones</h3>
          <p className="muted">
            These exact invented milestones enforce candidate cadence, owner-before-tenant
            direction, channel timing, tenant branch, conditional facts, signatures, and
            closeout. They exercise app workflow only and never prove a Live provider or
            real business completion.
          </p>
        </div>
        <div className="queue-detail-grid">
          <PreviewField
            label="Candidate cadence"
            value={`${LEASE_TEST_ALIASES.candidateReviewDate} review for ${LEASE_TEST_ALIASES.leaseEndDate} lease end`}
          />
          <PreviewField
            label="Tenant offer"
            value={`${LEASE_TEST_ALIASES.tenantOfferDueDate} · ${LEASE_TEST_ALIASES.signatureWindowDays}-day signature window`}
          />
          <PreviewField label="Owner terms" value={LEASE_TEST_ALIASES.ownerTermsLabel} />
          <PreviewField
            label="Conditional facts"
            value={LEASE_TEST_ALIASES.conditionalFactsLabel}
          />
        </div>
        <label className="select-field" htmlFor={`lease-test-business-${run.id}`}>
          Milestone
          <select
            id={`lease-test-business-${run.id}`}
            onChange={(event) => {
              setBusinessAction(event.target.value as LeaseTestBusinessAction);
              setBusinessConfirmed(false);
              setMessage("");
            }}
            value={businessAction}
          >
            {LEASE_TEST_BUSINESS_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {LEASE_TEST_BUSINESS_ACTION_LABELS[action]}
              </option>
            ))}
          </select>
        </label>
        <p>
          <strong>Exact Test effect:</strong>{" "}
          {LEASE_TEST_BUSINESS_ACTION_EFFECTS[businessAction]}
        </p>
        {!businessAvailability.available ? (
          <p className="muted">Blocked: {businessAvailability.reason}</p>
        ) : null}
        <label className="ui-row">
          <input
            checked={businessConfirmed}
            disabled={!businessAvailability.available}
            onChange={(event) => setBusinessConfirmed(event.target.checked)}
            type="checkbox"
          />
          I confirm this exact app-only Test milestone and consequence.
        </label>
        <button
          className="secondary-button"
          disabled={
            !businessConfirmed || !businessAvailability.available || pending !== null
          }
          onClick={() => void recordBusinessMilestone()}
          type="button"
        >
          {pending === "business" ? "Recording…" : "Record Test milestone"}
        </button>
        {run.move_out_handoff ? (
          <p>
            <strong>Move-Out handoff:</strong>{" "}
            <a href={run.move_out_handoff.direct_link}>
              Open the Test Move-Out owning Space
            </a>{" "}
            · next owner: {run.move_out_handoff.next_owner}
          </p>
        ) : null}
        {businessEvents.length > 0 ? (
          <ol className="compact-list" aria-label="Lease Test business event history">
            {businessEvents.map((event) => (
              <li key={event.id}>
                {LEASE_TEST_BUSINESS_ACTION_LABELS[event.action]} · {event.outcome} ·
                provider contacted: No · not Live proof
              </li>
            ))}
          </ol>
        ) : null}
      </section>
      {nextStatus ? (
        <div>
          <button
            className="secondary-button"
            disabled={pending !== null || doneBlocked}
            onClick={() => void advanceStatus()}
            type="button"
          >
            {pending === "status"
              ? "Saving…"
              : `Move to ${LEASE_TEST_RUN_STATUS_LABELS[nextStatus]}`}
          </button>
          {doneBlocked ? (
            <p className="muted">
              App Test completion unlocks after all {LEASE_TEST_ACTIONS.length} explicit
              Test actions have one receipt and the Test business journey is closed. This
              never marks Live business closeout.
            </p>
          ) : null}
        </div>
      ) : (
        <p>
          {run.status === "Done" ? (
            <>
              <strong>App Test complete:</strong> every internal simulation is recorded.
              Business closeout remains not proven; this is not Live provider evidence.
            </>
          ) : (
            <>
              <strong>Renewal branch closed:</strong> the Test tenant chose Move-Out and
              remaining renewal actions are disabled.
            </>
          )}
        </p>
      )}

      <section
        className="ui-callout ui-stack"
        aria-label="Business closeout evidence gates"
      >
        <div>
          <h3 className="section-subtitle">Business closeout evidence gates</h3>
          <p className="muted">
            App Test status and business completion are separate. This invented Test run
            can never become business-closeout eligible.
          </p>
        </div>
        <ul className="compact-list">
          {completionBoundary.gates.map((gate) => (
            <li key={gate.id}>
              <strong>{gate.label}</strong>:{" "}
              {gate.outcome === "internal_simulation_only"
                ? `Test milestone plus ${gate.internalTestReceiptCount} of ${gate.internalTestReceiptTotal} internal Test receipts; Live business proof not established.`
                : gate.outcome === "test_evidence_incomplete"
                  ? `${gate.internalTestReceiptCount} of ${gate.internalTestReceiptTotal} internal Test receipts; Test evidence incomplete and business proof not established.`
                  : "Owning Test milestone missing; Live business proof not established."}
            </li>
          ))}
        </ul>
        <p>
          <strong>Business closeout:</strong> Not proven · Live receipts, authoritative
          decisions, signatures, conditional facts, reconciliation, and exceptions remain
          on their owning records.
        </p>
      </section>

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
                {completedKeys.has(action) ? " (recorded)" : ""}
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
        {actionBusinessBlocker ? (
          <p className="muted">Business gate: {actionBusinessBlocker}</p>
        ) : null}
        {run.status !== "Executing" &&
        run.status !== "Done" &&
        run.status !== "Moved to Move-Out" ? (
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
                {receipt.action_key} → {receipt.target_label}: attempt 1 succeeded;
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
