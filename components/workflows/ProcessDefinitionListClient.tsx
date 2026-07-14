"use client";

import { useState } from "react";
import Link from "next/link";
import type { ProcessDefinitionRecord, WorkflowRunRecord } from "@/lib/firestore/types";

interface ProcessDefinitionListClientProps {
  availableSpaces?: readonly { id: string; name: string }[];
  canEdit: boolean;
  currentUserUid: string;
  initialDefinitions: ProcessDefinitionRecord[];
  initialError?: string;
  initialRecentRuns: WorkflowRunRecord[];
  initialRunsError?: string;
}

export function ProcessDefinitionListClient({
  availableSpaces = [],
  canEdit,
  currentUserUid,
  initialDefinitions,
  initialError,
  initialRecentRuns,
  initialRunsError,
}: Readonly<ProcessDefinitionListClientProps>) {
  const [definitions, setDefinitions] = useState(initialDefinitions);
  const [recentRuns] = useState(initialRecentRuns);
  const [message, setMessage] = useState(
    initialError ?? "Workflow process definitions are ready.",
  );
  const recentRunsMessage = initialRunsError ?? "Recent test runs are ready.";
  const [isBusy, setIsBusy] = useState(false);
  const [form, setForm] = useState({
    default_approver_uid: currentUserUid,
    name: "",
    owner_uid: currentUserUid,
    short_outcome: "",
    space_id: availableSpaces[0]?.id ?? "",
    steps: "",
    success_condition: "",
    trigger: "",
  });

  async function createDefinition() {
    if (!canEdit || isBusy) {
      return;
    }

    const steps = lines(form.steps).map((title) => ({ title }));

    if (steps.length === 0) {
      setMessage("Add at least one step before creating the process definition.");
      return;
    }

    setIsBusy(true);
    setMessage("Creating process definition.");

    try {
      const { definition } = await fetchWorkflow<{ definition: ProcessDefinitionRecord }>(
        "/api/process-definitions",
        {
          body: JSON.stringify({
            action_references: [],
            default_approver_uid: form.default_approver_uid,
            name: form.name,
            owner_uid: form.owner_uid,
            required_starting_inputs: [],
            short_outcome: form.short_outcome,
            space_id: form.space_id,
            source_links: [],
            steps,
            success_condition: form.success_condition,
            trigger: form.trigger,
          }),
          method: "POST",
        },
      );

      setDefinitions((records) => [definition, ...records]);
      setForm({
        default_approver_uid: currentUserUid,
        name: "",
        owner_uid: currentUserUid,
        short_outcome: "",
        space_id: availableSpaces[0]?.id ?? "",
        steps: "",
        success_condition: "",
        trigger: "",
      });
      setMessage("Process definition created.");
    } catch (error) {
      setMessage(readErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="workflow-list-layout">
      <div className="workflow-main-column">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Process Definitions</h2>
              <p className="muted">{message}</p>
            </div>
          </div>
          {definitions.length === 0 ? (
            <p className="muted">No process definitions exist yet.</p>
          ) : (
            <div className="workflow-record-list">
              {definitions.map((definition) => (
                <article className="compact-record" key={definition.id}>
                  <div className="workflow-record-heading">
                    <div>
                      <Link className="text-link" href={`/processes/${definition.id}`}>
                        {definition.name}
                      </Link>
                      <p className="muted">{definition.short_outcome}</p>
                    </div>
                    <span className="queue-pill" data-value={definition.status}>
                      {definition.status}
                    </span>
                  </div>
                  <p className="muted">
                    Owner: {definition.owner_uid} - Approver:{" "}
                    {definition.default_approver_uid}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel workflow-run-index">
          <div className="panel-heading">
            <div>
              <h2>Recent test runs</h2>
              <p className="muted">{recentRunsMessage}</p>
            </div>
          </div>
          {recentRuns.length === 0 ? (
            <p className="muted">No test runs yet.</p>
          ) : (
            <div className="workflow-record-list">
              {recentRuns.map((run) => (
                <article className="compact-record" key={run.id}>
                  <div className="workflow-record-heading">
                    <div>
                      <Link className="text-link" href={`/workflow-runs/${run.id}`}>
                        {run.process_name}
                      </Link>
                      <p className="muted">
                        Due {run.due_date} - Owner {run.owner_uid}
                      </p>
                    </div>
                    <div className="workflow-pill-group">
                      <span className="queue-pill" data-value={run.status}>
                        {run.status}
                      </span>
                      <span className="review-pill">Test run</span>
                    </div>
                  </div>
                  <p className="muted">
                    Test run. No production metrics or external actions.
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="panel workflow-create-panel">
        <h2>Create Process</h2>
        <fieldset disabled={!canEdit || isBusy}>
          <label>
            Space
            <select
              onChange={(event) => setForm({ ...form, space_id: event.target.value })}
              value={form.space_id}
            >
              {availableSpaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              value={form.name}
            />
          </label>
          <label>
            Short outcome
            <input
              onChange={(event) =>
                setForm({ ...form, short_outcome: event.target.value })
              }
              value={form.short_outcome}
            />
          </label>
          <label>
            Trigger or manual start
            <input
              onChange={(event) => setForm({ ...form, trigger: event.target.value })}
              value={form.trigger}
            />
          </label>
          <div className="workflow-two-column-fields">
            <label>
              Owner UID
              <input
                onChange={(event) => setForm({ ...form, owner_uid: event.target.value })}
                value={form.owner_uid}
              />
            </label>
            <label>
              Approver UID
              <input
                onChange={(event) =>
                  setForm({ ...form, default_approver_uid: event.target.value })
                }
                value={form.default_approver_uid}
              />
            </label>
          </div>
          <label>
            Initial steps
            <textarea
              onChange={(event) => setForm({ ...form, steps: event.target.value })}
              rows={4}
              value={form.steps}
            />
          </label>
          <label>
            Success condition
            <textarea
              onChange={(event) =>
                setForm({ ...form, success_condition: event.target.value })
              }
              rows={3}
              value={form.success_condition}
            />
          </label>
        </fieldset>
        <button
          className="primary-button"
          disabled={!canEdit || isBusy}
          onClick={createDefinition}
          type="button"
        >
          Create
        </button>
      </aside>
    </div>
  );
}

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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
