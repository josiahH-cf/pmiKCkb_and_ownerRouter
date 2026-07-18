"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  ProcessDefinitionStep,
  WorkflowRunRecord,
  WorkflowRunStepCheckRecord,
  WorkflowRunTimelineRecord,
} from "@/lib/firestore/types";

interface WorkflowRunClientProps {
  canEdit: boolean;
  initialChecks: WorkflowRunStepCheckRecord[];
  initialRun: WorkflowRunRecord;
  initialSteps: ProcessDefinitionStep[];
  initialTimeline: WorkflowRunTimelineRecord[];
}

export function WorkflowRunClient({
  canEdit,
  initialChecks,
  initialRun,
  initialSteps,
  initialTimeline,
}: Readonly<WorkflowRunClientProps>) {
  const [run, setRun] = useState(initialRun);
  const [timeline, setTimeline] = useState(initialTimeline);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("Workflow run loaded.");
  const [isBusy, setIsBusy] = useState(false);
  const isClosed = ["Completed", "Cancelled", "Failed"].includes(run.status);
  const checksByStep = new Map(initialChecks.map((check) => [check.step_id, check]));
  const incompleteSteps = initialSteps.filter((step) => {
    const status = checksByStep.get(step.id)?.status;
    return status !== "Checked" && status !== "Skipped";
  });
  const checklistComplete = initialSteps.length > 0 && incompleteSteps.length === 0;
  const canUpdate =
    canEdit && run.is_test_run && run.simulation_only && !isClosed && !isBusy;
  const canComplete = canUpdate && checklistComplete;

  async function updateOutcome(action: "complete_test" | "fail_test") {
    if (!canUpdate) {
      return;
    }

    setIsBusy(true);
    setMessage(action === "complete_test" ? "Completing test run." : "Failing test run.");

    try {
      const result = await fetchWorkflow<{
        run: WorkflowRunRecord;
        timeline: WorkflowRunTimelineRecord[];
      }>(`/api/workflow-runs/${run.id}`, {
        body: JSON.stringify({ action, notes }),
        method: "PATCH",
      });

      setRun(result.run);
      setTimeline(result.timeline);
      setNotes("");
      setMessage(action === "complete_test" ? "Test run completed." : "Test run failed.");
    } catch (error) {
      setMessage(readErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="workflow-run-layout">
      <section className="panel">
        {run.is_test_run ? (
          <div className="workflow-test-banner">
            Test run only. No external write, send, Gmail action, or live system update
            happens from this run.
          </div>
        ) : null}
        <div className="panel-heading">
          <div>
            <h2>{run.process_name}</h2>
            <p className="muted">{message}</p>
          </div>
          <span className="queue-pill" data-value={run.status}>
            {run.status}
          </span>
        </div>
        <div className="queue-detail-grid">
          <div className="queue-detail-field">
            <span>Owner</span>
            <strong>{run.owner_uid}</strong>
          </div>
          <div className="queue-detail-field">
            <span>Next Action</span>
            <strong>{run.next_action}</strong>
          </div>
          <div className="queue-detail-field">
            <span>Due Date</span>
            <strong>{run.due_date}</strong>
          </div>
          <div className="queue-detail-field">
            <span>Metrics</span>
            <strong>{run.production_metrics_included ? "Included" : "Excluded"}</strong>
          </div>
          <div className="queue-detail-field">
            <span>Test run</span>
            <strong>{run.simulation_only ? "Yes" : "No"}</strong>
          </div>
          <div className="queue-detail-field">
            <span>Started By</span>
            <strong>{run.started_by_uid}</strong>
          </div>
          <div className="queue-detail-field">
            <span>Definition version</span>
            <strong>{run.definition_version_id ?? "Not pinned (draft)"}</strong>
          </div>
        </div>
        {run.blocker ? (
          <article className="workflow-blocker">
            <strong>Blocker</strong>
            <p>{run.blocker}</p>
          </article>
        ) : null}
        {run.outcome_notes ? (
          <article className="workflow-blocker">
            <strong>Outcome Notes</strong>
            <p>{run.outcome_notes}</p>
          </article>
        ) : null}
        <div className="action-row">
          <Link className="secondary-button" href={`/processes/${run.definition_id}`}>
            Open Process
          </Link>
        </div>
      </section>

      <aside className="panel">
        <h2>Test Outcome</h2>
        <p className="muted">
          Checklist: {initialSteps.length - incompleteSteps.length} of{" "}
          {initialSteps.length} complete. Every step must be Checked or Skipped with a
          reason before completion.
        </p>
        {incompleteSteps.length > 0 ? (
          <p className="form-error">
            Incomplete: {incompleteSteps.map((step) => step.title).join(", ")}.
          </p>
        ) : null}
        <label className="workflow-note-field">
          Notes
          <textarea
            disabled={!canUpdate}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            value={notes}
          />
        </label>
        <div className="action-row">
          <button
            className="primary-button"
            disabled={!canComplete}
            onClick={() => updateOutcome("complete_test")}
            type="button"
          >
            Complete Test
          </button>
          <button
            className="secondary-button"
            disabled={!canUpdate}
            onClick={() => updateOutcome("fail_test")}
            type="button"
          >
            Fail Test
          </button>
        </div>
      </aside>

      <section className="panel workflow-timeline-panel">
        <h2>Timeline</h2>
        {timeline.length === 0 ? (
          <p className="muted">No timeline entries exist for this run.</p>
        ) : (
          timeline.map((entry) => (
            <article className="compact-record" key={entry.id}>
              <strong>{entry.summary}</strong>
              <p className="muted">
                {entry.event_type} by {entry.actor_uid} on {entry.created_at}
                {entry.new_status ? ` - ${entry.new_status}` : ""}
              </p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

async function fetchWorkflow<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  const response = await fetch(path, { ...init, headers });
  const payload = (await response.json().catch(() => ({}))) as T | { error?: string };

  if (!response.ok) {
    throw new Error(readApiError(payload));
  }

  return payload as T;
}

function readApiError(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.trim().length > 0
  ) {
    return payload.error;
  }

  return "Workflow request failed.";
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Workflow request failed.";
}
