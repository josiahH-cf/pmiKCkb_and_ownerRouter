"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  ExternalActionReadiness,
  ProcessDefinitionActionReference,
  ProcessDefinitionRecord,
  ProcessDefinitionSourceLink,
  ProcessDefinitionStep,
  WorkflowRunRecord,
} from "@/lib/firestore/types";

const READINESS_VALUES: ExternalActionReadiness[] = [
  "Planned",
  "Needs Connection",
  "Needs Permission",
  "Ready for Test",
  "Approved for Execution",
  "Disabled",
];

interface ProcessDefinitionDetailClientProps {
  canEdit: boolean;
  canManageAdmin: boolean;
  initialDefinition: ProcessDefinitionRecord;
  initialRuns: WorkflowRunRecord[];
}

export function ProcessDefinitionDetailClient({
  canEdit,
  initialDefinition,
  initialRuns,
}: Readonly<ProcessDefinitionDetailClientProps>) {
  const [definition, setDefinition] = useState(initialDefinition);
  const [runs, setRuns] = useState(initialRuns);
  const [message, setMessage] = useState("Process definition loaded.");
  const [isBusy, setIsBusy] = useState(false);
  const [form, setForm] = useState(() => definitionToForm(initialDefinition));
  const [publicationNote, setPublicationNote] = useState("");
  const [testRunForm, setTestRunForm] = useState({ due_date: "", note: "" });
  const canMutate =
    canEdit && !isBusy && !["Pending Approval", "Retired"].includes(definition.status);

  async function saveDefinition() {
    if (!canMutate) {
      return;
    }

    await runMutation("Saving process definition.", async () => {
      const { definition: updated, runs: updatedRuns } = await fetchWorkflow<{
        definition: ProcessDefinitionRecord;
        runs: WorkflowRunRecord[];
      }>(`/api/process-definitions/${definition.id}`, {
        body: JSON.stringify(formToDefinitionInput(form)),
        method: "PATCH",
      });

      setDefinition(updated);
      setRuns(updatedRuns);
      setForm(definitionToForm(updated));
      setMessage("Process definition saved.");
    });
  }

  async function publishDefinition() {
    if (!canEdit || isBusy) {
      return;
    }

    await runMutation("Running publication validation.", async () => {
      const { definition: updated, runs: updatedRuns } = await fetchWorkflow<{
        definition: ProcessDefinitionRecord;
        runs: WorkflowRunRecord[];
      }>(`/api/process-definitions/${definition.id}/publish`, {
        body: JSON.stringify({ note: publicationNote }),
        method: "POST",
      });

      setDefinition(updated);
      setRuns(updatedRuns);
      setForm(definitionToForm(updated));
      setPublicationNote("");
      setMessage("Validated process version published and active.");
    });
  }

  async function startTestRun() {
    if (!canEdit || isBusy) {
      return;
    }

    await runMutation("Starting a test run.", async () => {
      const { run } = await fetchWorkflow<{ run: WorkflowRunRecord }>(
        `/api/process-definitions/${definition.id}/test-runs`,
        {
          body: JSON.stringify({
            due_date: testRunForm.due_date || undefined,
            note: testRunForm.note || undefined,
          }),
          method: "POST",
        },
      );

      window.location.assign(`/workflow-runs/${run.id}`);
    });
  }

  async function runMutation(label: string, operation: () => Promise<void>) {
    setIsBusy(true);
    setMessage(label);

    try {
      await operation();
    } catch (error) {
      setMessage(readErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="workflow-detail-layout">
      <section className="panel workflow-definition-editor">
        <div className="panel-heading">
          <div>
            <h2>{definition.name}</h2>
            <p className="muted">{message}</p>
          </div>
          <span className="queue-pill" data-value={definition.status}>
            {definition.status}
          </span>
        </div>

        <fieldset disabled={!canMutate}>
          <div className="workflow-two-column-fields">
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
          </div>
          <label>
            Trigger or manual start
            <textarea
              onChange={(event) => setForm({ ...form, trigger: event.target.value })}
              rows={2}
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
            Source links
            <textarea
              onChange={(event) => setForm({ ...form, source_links: event.target.value })}
              rows={3}
              value={form.source_links}
            />
          </label>
          <label>
            Required starting inputs
            <textarea
              onChange={(event) =>
                setForm({ ...form, required_starting_inputs: event.target.value })
              }
              rows={3}
              value={form.required_starting_inputs}
            />
          </label>
          <label>
            Steps
            <textarea
              onChange={(event) => setForm({ ...form, steps: event.target.value })}
              rows={5}
              value={form.steps}
            />
          </label>
          <label>
            Pending or future action references
            <textarea
              onChange={(event) =>
                setForm({ ...form, action_references: event.target.value })
              }
              rows={4}
              value={form.action_references}
            />
            <span className="muted">
              One per line: label | system | action | readiness | missing setup | approval
              owner | rollback note | Action Registry key
            </span>
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
          <div className="workflow-two-column-fields">
            <label>
              Stop condition
              <textarea
                onChange={(event) =>
                  setForm({ ...form, stop_condition: event.target.value })
                }
                rows={3}
                value={form.stop_condition}
              />
            </label>
            <label>
              Escalation condition
              <textarea
                onChange={(event) =>
                  setForm({ ...form, escalation_condition: event.target.value })
                }
                rows={3}
                value={form.escalation_condition}
              />
            </label>
          </div>
        </fieldset>

        <div className="action-row">
          <button
            className="primary-button"
            disabled={!canMutate}
            onClick={saveDefinition}
            type="button"
          >
            Save
          </button>
          <button
            className="secondary-button"
            disabled={!canEdit || isBusy || definition.status === "Retired"}
            onClick={publishDefinition}
            type="button"
          >
            Publish
          </button>
        </div>
        <label className="workflow-note-field">
          Publication note
          <textarea
            disabled={!canEdit || isBusy}
            onChange={(event) => setPublicationNote(event.target.value)}
            rows={2}
            value={publicationNote}
          />
        </label>
      </section>

      <aside className="workflow-side">
        <section className="panel">
          <h2>Publication</h2>
          <p>
            <strong>Active immutable version:</strong>{" "}
            <code>{definition.active_version_id ?? "Not published"}</code>
          </p>
          {!definition.active_version_id ? (
            <p className="muted">
              Test runs started now follow the current mutable draft and track its edits
              until you publish an immutable version.
            </p>
          ) : null}
          <p className="muted">
            A version becomes Active immediately only after root, scope, type, size,
            malware, sensitivity, source, graph, and action-reference checks pass.
          </p>
          <p className="muted">
            Publication does not enable an external action or widen any role.
          </p>
        </section>

        <section className="panel">
          <h2>Test run</h2>
          <p className="muted">
            Test runs created here are not live and excluded from production metrics.
          </p>
          <label>
            Due date
            <input
              disabled={!canEdit || isBusy}
              onChange={(event) =>
                setTestRunForm({ ...testRunForm, due_date: event.target.value })
              }
              type="date"
              value={testRunForm.due_date}
            />
          </label>
          <label className="workflow-note-field">
            Start note
            <textarea
              disabled={!canEdit || isBusy}
              onChange={(event) =>
                setTestRunForm({ ...testRunForm, note: event.target.value })
              }
              rows={3}
              value={testRunForm.note}
            />
          </label>
          <button
            className="secondary-button"
            disabled={!canEdit || isBusy || definition.status === "Retired"}
            onClick={startTestRun}
            type="button"
          >
            Start Test Run
          </button>
        </section>

        <section className="panel">
          <h2>Recent Runs</h2>
          {runs.length === 0 ? (
            <p className="muted">No workflow runs exist for this process.</p>
          ) : (
            runs.map((run) => (
              <article className="compact-record" key={run.id}>
                <Link className="text-link" href={`/workflow-runs/${run.id}`}>
                  {run.process_name}
                </Link>
                <p className="muted">
                  {run.status} - Due {run.due_date}
                  {run.is_test_run ? " - Test" : ""}
                </p>
                <p className="muted">
                  Definition version: {run.definition_version_id ?? "Not pinned (draft)"}
                </p>
              </article>
            ))
          )}
        </section>
      </aside>
    </div>
  );
}

interface DefinitionFormState {
  action_references: string;
  default_approver_uid: string;
  escalation_condition: string;
  name: string;
  owner_uid: string;
  required_starting_inputs: string;
  short_outcome: string;
  source_links: string;
  steps: string;
  stop_condition: string;
  success_condition: string;
  trigger: string;
}

function definitionToForm(definition: ProcessDefinitionRecord): DefinitionFormState {
  return {
    action_references: formatActionReferences(definition.action_references),
    default_approver_uid: definition.default_approver_uid,
    escalation_condition: definition.escalation_condition ?? "",
    name: definition.name,
    owner_uid: definition.owner_uid,
    required_starting_inputs: definition.required_starting_inputs.join("\n"),
    short_outcome: definition.short_outcome,
    source_links: definition.source_links
      .map((link) => `${link.label} | ${link.url}`)
      .join("\n"),
    steps: definition.steps
      .map((step) =>
        step.description ? `${step.title} | ${step.description}` : step.title,
      )
      .join("\n"),
    stop_condition: definition.stop_condition ?? "",
    success_condition: definition.success_condition,
    trigger: definition.trigger,
  };
}

function formToDefinitionInput(form: DefinitionFormState) {
  return {
    action_references: parseActionReferences(form.action_references),
    default_approver_uid: form.default_approver_uid,
    escalation_condition: form.escalation_condition || undefined,
    name: form.name,
    owner_uid: form.owner_uid,
    required_starting_inputs: lines(form.required_starting_inputs),
    short_outcome: form.short_outcome,
    source_links: parseSourceLinks(form.source_links),
    steps: parseSteps(form.steps),
    stop_condition: form.stop_condition || undefined,
    success_condition: form.success_condition,
    trigger: form.trigger,
  };
}

function parseSourceLinks(value: string): ProcessDefinitionSourceLink[] {
  return lines(value).map((line, index) => {
    const [label, url] = splitFields(line);
    return {
      label: label || `Source ${index + 1}`,
      url: url || label,
    };
  });
}

function parseSteps(value: string): ProcessDefinitionStep[] {
  return lines(value).map((line, index) => {
    const [title, description] = splitFields(line);
    return {
      id: `step-${index + 1}`,
      title,
      ...(description ? { description } : {}),
    };
  });
}

function parseActionReferences(value: string): ProcessDefinitionActionReference[] {
  return lines(value).map((line, index) => {
    const [
      label,
      targetSystem,
      expectedAction,
      readiness,
      missingConnectionOrPermission,
      approvalOwnerUid,
      rollbackOrCorrectionNote,
      actionRegistryKey,
    ] = splitFields(line);

    return {
      id: `action-${index + 1}`,
      label,
      target_system: targetSystem || "Future system",
      expected_action: expectedAction || "Pending future automation.",
      readiness: isReadiness(readiness) ? readiness : "Planned",
      ...(missingConnectionOrPermission
        ? { missing_connection_or_permission: missingConnectionOrPermission }
        : {}),
      ...(approvalOwnerUid ? { approval_owner_uid: approvalOwnerUid } : {}),
      ...(rollbackOrCorrectionNote
        ? { rollback_or_correction_note: rollbackOrCorrectionNote }
        : {}),
      ...(actionRegistryKey ? { action_registry_key: actionRegistryKey } : {}),
    };
  });
}

function formatActionReferences(actions: ProcessDefinitionActionReference[]) {
  return actions
    .map((action) =>
      [
        action.label,
        action.target_system,
        action.expected_action,
        action.readiness,
        action.missing_connection_or_permission ?? "",
        action.approval_owner_uid ?? "",
        action.rollback_or_correction_note ?? "",
        action.action_registry_key ?? "",
      ].join(" | "),
    )
    .join("\n");
}

function splitFields(line: string) {
  return line.split("|").map((field) => field.trim());
}

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isReadiness(value: string | undefined): value is ExternalActionReadiness {
  return Boolean(value && READINESS_VALUES.includes(value as ExternalActionReadiness));
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
