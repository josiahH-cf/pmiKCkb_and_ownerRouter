"use client";

// SpaceDeskRunPanel — the only interactive island on the desk (space-teeth E2c). Starts a run by
// POSTing the EXISTING test-runs route, then lets the operator mark each process step
// Unchecked / Checked / Skipped by POSTing the step-checks route. The server pre-loads the run + its
// checks; this hydrates from props and refreshes the server tree after each write. No system-of-record
// write, no send — both endpoints are app-plane Firestore CRUD gated at `edit`.

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Card, StatusPill } from "@/components/ui";
import type {
  ProcessDefinitionStep,
  WorkflowRunRecord,
  WorkflowRunStepCheckRecord,
  WorkflowRunStepCheckStatus,
} from "@/lib/firestore/types";

interface SpaceDeskRunPanelProps {
  definitionId: string;
  run: WorkflowRunRecord | null;
  steps: readonly ProcessDefinitionStep[];
  initialChecks: readonly WorkflowRunStepCheckRecord[];
  canEdit?: boolean;
}

const STATUS_PILL: Record<WorkflowRunStepCheckStatus, string> = {
  Unchecked: "To do",
  Checked: "Done",
  Skipped: "Skipped",
};

export function SpaceDeskRunPanel({
  definitionId,
  run,
  steps,
  initialChecks,
  canEdit = false,
}: Readonly<SpaceDeskRunPanelProps>) {
  const router = useRouter();
  const [checks, setChecks] = useState<Record<string, WorkflowRunStepCheckRecord>>(() =>
    Object.fromEntries(initialChecks.map((check) => [check.step_id, check])),
  );
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isTerminal = run
    ? ["Completed", "Cancelled", "Failed"].includes(run.status)
    : false;
  const canMutateChecklist = canEdit && !isTerminal;

  async function startRun() {
    setError(null);
    setPending("__start__");
    try {
      const response = await fetch(`/api/process-definitions/${definitionId}/test-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        setError("Could not start a run.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the run endpoint.");
    } finally {
      setPending(null);
    }
  }

  async function setStatus(stepId: string, status: WorkflowRunStepCheckStatus) {
    if (!run) return;
    setError(null);
    const reason = reasons[stepId]?.trim();
    if (status === "Skipped" && !reason) {
      setError("A reason is required to skip a step.");
      return;
    }
    setPending(stepId);
    try {
      const response = await fetch(`/api/workflow-runs/${run.id}/step-checks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step_id: stepId,
          status,
          ...(status === "Skipped" ? { reason } : {}),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Could not save the step.");
        return;
      }
      const body = (await response.json()) as { check: WorkflowRunStepCheckRecord };
      setChecks((previous) => ({ ...previous, [stepId]: body.check }));
      router.refresh();
    } catch {
      setError("Could not reach the step-checks endpoint.");
    } finally {
      setPending(null);
    }
  }

  if (!run) {
    return (
      <Card title="Run">
        <p className="muted">
          No run yet. Start a run to walk this process as a checklist you can work across
          visits.
        </p>
        {canEdit ? (
          <button
            className="secondary-button"
            disabled={pending === "__start__"}
            onClick={startRun}
            type="button"
          >
            {pending === "__start__" ? "Starting…" : "Start a run"}
          </button>
        ) : (
          <p className="muted">You have read-only access to this Space.</p>
        )}
        {error ? <p className="form-error">{error}</p> : null}
      </Card>
    );
  }

  return (
    <Card title="Checklist">
      {error ? <p className="form-error">{error}</p> : null}
      {isTerminal ? (
        <p className="muted">This run is closed. Its checklist is read-only.</p>
      ) : null}
      <ul className="ui-rows">
        {steps.map((step) => {
          const status = checks[step.id]?.status ?? "Unchecked";
          const busy = pending === step.id;
          return (
            <li className="ui-stack" key={step.id}>
              <div className="ui-spread">
                <span>{step.title}</span>
                <StatusPill value={STATUS_PILL[status]} />
              </div>
              {canMutateChecklist ? (
                <div className="ui-row">
                  <button
                    className="secondary-button"
                    disabled={busy || status === "Checked"}
                    onClick={() => setStatus(step.id, "Checked")}
                    type="button"
                  >
                    Check
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setStatus(step.id, "Skipped")}
                    type="button"
                  >
                    Skip
                  </button>
                  {status !== "Unchecked" ? (
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => setStatus(step.id, "Unchecked")}
                      type="button"
                    >
                      Clear
                    </button>
                  ) : null}
                  <input
                    aria-label={`Reason to skip ${step.title}`}
                    className="ui-input"
                    onChange={(event) =>
                      setReasons((previous) => ({
                        ...previous,
                        [step.id]: event.target.value,
                      }))
                    }
                    placeholder="Reason (required to skip)"
                    type="text"
                    value={reasons[step.id] ?? ""}
                  />
                </div>
              ) : null}
              {checks[step.id]?.reason ? (
                <p className="muted">Reason: {checks[step.id]?.reason}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
