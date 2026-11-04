"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { formatCalendarDate } from "@/lib/date-display";

import { useState } from "react";
import Link from "next/link";
import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { InfoTip } from "@/components/ui/InfoTip";
import type { ProcessDefinitionPublicationRead } from "@/lib/publication/process-definition-readback";
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
  initialDefinition: ProcessDefinitionRecord;
  initialRuns: WorkflowRunRecord[];
  initialPublication?: ProcessDefinitionPublicationRead;
}

export function ProcessDefinitionDetailClient({
  canEdit,
  initialDefinition,
  initialRuns,
  initialPublication,
}: Readonly<ProcessDefinitionDetailClientProps>) {
  const [definition, setDefinition] = useState(initialDefinition);
  const [runs, setRuns] = useState(initialRuns);
  const [publication, setPublication] = useState(() =>
    publicationFor(initialDefinition, initialPublication),
  );
  const [message, setMessage] = useState("Process definition loaded.");
  const [isBusy, setIsBusy] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [form, setForm] = useState(() => definitionToForm(initialDefinition));
  const [publicationNote, setPublicationNote] = useState("");
  const [runForm, setRunForm] = useState({ due_date: "", note: "" });
  const hasCurrentPublishedVersion = publication.state === "verified";
  const canMutate =
    canEdit &&
    !isBusy &&
    !needsReload &&
    !["Pending Approval", "Retired"].includes(definition.status);

  async function saveDefinition() {
    if (!canMutate) {
      return;
    }

    await runMutation("Saving process definition.", async () => {
      try {
        const {
          definition: updated,
          runs: updatedRuns,
          publication: updatedPublication,
        } = await fetchWorkflow<{
          definition: ProcessDefinitionRecord;
          runs: WorkflowRunRecord[];
          publication?: ProcessDefinitionPublicationRead;
        }>(`/api/process-definitions/${definition.id}`, {
          body: JSON.stringify({
            ...formToDefinitionInput(form),
            expected_revision: definition.revision,
          }),
          method: "PATCH",
        });

        setDefinition(updated);
        setRuns(updatedRuns);
        setPublication(publicationFor(updated, updatedPublication));
        setForm(definitionToForm(updated));
        setMessage("Process definition saved.");
      } catch (error) {
        await reconcileDefinition(error);
      }
    });
  }

  async function publishDefinition() {
    if (!canEdit || isBusy || needsReload) {
      return;
    }

    if (
      JSON.stringify(formToDefinitionInput(form)) !==
      JSON.stringify(formToDefinitionInput(definitionToForm(definition)))
    ) {
      setMessage(
        "Save and read back your reviewed changes before publishing. Publication uses the saved definition.",
      );
      return;
    }
    if (definition.status === "Active" && definition.active_version_id) {
      setMessage(
        "This saved definition already has an active immutable version. No duplicate publication was attempted.",
      );
      return;
    }
    await runMutation("Running publication validation.", async () => {
      try {
        const {
          definition: updated,
          runs: updatedRuns,
          publication: updatedPublication,
        } = await fetchWorkflow<{
          definition: ProcessDefinitionRecord;
          runs: WorkflowRunRecord[];
          publication?: ProcessDefinitionPublicationRead;
        }>(`/api/process-definitions/${definition.id}/publish`, {
          body: JSON.stringify({
            note: publicationNote,
            expected_revision: definition.revision,
          }),
          method: "POST",
        });

        setDefinition(updated);
        setRuns(updatedRuns);
        const verified = publicationFor(updated, updatedPublication);
        setPublication(verified);
        setForm(definitionToForm(updated));
        setPublicationNote("");
        setMessage(
          verified.state === "verified"
            ? "Validated process version published and active."
            : "The publication response was received, but the published version could not be verified. Read the current publication before any further attempt; no retry was sent.",
        );
      } catch (error) {
        await reconcileDefinition(error);
      }
    });
  }

  async function reconcileDefinition(error: unknown) {
    try {
      const current = await fetchWorkflow<{
        definition: ProcessDefinitionRecord;
        runs: WorkflowRunRecord[];
        publication?: ProcessDefinitionPublicationRead;
      }>(`/api/process-definitions/${definition.id}`);
      setDefinition(current.definition);
      setRuns(current.runs);
      const verified = publicationFor(current.definition, current.publication);
      setPublication(verified);
      const matches =
        JSON.stringify(formToDefinitionInput(form)) ===
        JSON.stringify(formToDefinitionInput(definitionToForm(current.definition)));
      setNeedsReload(!matches);
      const outcome =
        error instanceof WorkflowRequestError && error.status < 500
          ? "The request was refused."
          : "The original response was not confirmed.";
      const publicationOutcome =
        verified.state === "verified"
          ? " and its matching immutable published version was verified"
          : current.definition.status === "Active"
            ? "; the published version could not be verified"
            : current.definition.active_version_id
              ? "; its prior immutable version is retained, but this saved content is not published"
              : "";
      setMessage(
        matches
          ? `${readErrorMessage(error)} ${outcome} The desired saved content is current${publicationOutcome}; that does not establish this request created it. No retry was sent.`
          : `${readErrorMessage(error)} Your edits remain below. Compare the saved version, then load it before editing again; no retry was sent.`,
      );
    } catch {
      setNeedsReload(true);
      setPublication({
        state: "unavailable",
        message:
          "Current immutable publication could not be read back. The prior displayed reference is not verified current state.",
      });
      setMessage(
        `${readErrorMessage(error)} Current state could not be read back. Your edits are retained; reload current content before retrying.`,
      );
    }
  }

  async function loadCurrentDefinition() {
    await runMutation("Reading the current saved process.", async () => {
      const current = await fetchWorkflow<{
        definition: ProcessDefinitionRecord;
        runs: WorkflowRunRecord[];
        publication?: ProcessDefinitionPublicationRead;
      }>(`/api/process-definitions/${definition.id}`);
      setDefinition(current.definition);
      setRuns(current.runs);
      const verified = publicationFor(current.definition, current.publication);
      setPublication(verified);
      setForm(definitionToForm(current.definition));
      setNeedsReload(false);
      setMessage(
        verified.state === "unavailable"
          ? "Current saved content loaded; its published version could not be verified. Review the publication diagnostic before relying on it."
          : "Current saved content loaded. Review your changes before saving.",
      );
    });
  }

  async function startRun() {
    if (!canEdit || isBusy) return;
    await runMutation("Starting a workflow run.", async () => {
      const { run } = await fetchWorkflow<{ run: WorkflowRunRecord }>(
        `/api/process-definitions/${definition.id}/runs`,
        {
          body: JSON.stringify({
            expected_revision: definition.revision,
            due_date: runForm.due_date || undefined,
            note: runForm.note || undefined,
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
        {needsReload ? (
          <div className="ui-stack">
            <p role="alert">
              Your unsaved edits are preserved. Review and copy them before loading the
              current saved definition.
            </p>
            <details>
              <summary>Compare saved process</summary>
              <p>Saved name: {definition.name}</p>
              <p>{definition.short_outcome}</p>
              <p>
                Saved sources:{" "}
                {definition.source_links.map((source) => source.label).join(", ") ||
                  "None recorded"}
              </p>
              <p>Saved success: {definition.success_condition}</p>
              <p>Saved stop: {definition.stop_condition || "None recorded"}</p>
              <p>
                Saved escalation: {definition.escalation_condition || "None recorded"}
              </p>
              <ol>
                {definition.steps.map((step) => (
                  <li key={step.id}>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </li>
                ))}
              </ol>
            </details>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void loadCurrentDefinition()}
            >
              Load current saved definition
            </button>
          </div>
        ) : null}

        {!canEdit ? (
          <p className="muted">
            Editing, publishing, or starting this process requires Editor access.{" "}
            <RequestAccessLink surface="process_definition.edit" />
          </p>
        ) : null}

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
            disabled={
              !canEdit || isBusy || needsReload || definition.status === "Retired"
            }
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
          <InfoTip
            label="Publication checks"
            content="A version becomes Active immediately only after root, scope, type, size, malware, sensitivity, source, graph, and action-reference checks pass."
          />
          <p>
            <strong>
              {hasCurrentPublishedVersion
                ? "Active immutable version:"
                : definition.active_version_id
                  ? definition.status === "Active"
                    ? "Unverified version reference:"
                    : "Prior immutable version:"
                  : "Immutable version:"}
            </strong>{" "}
            <code>{definition.active_version_id ?? "Not published"}</code>
          </p>
          {publication.state === "unavailable" ? (
            <p role="status" className="muted">
              {publication.message}
            </p>
          ) : null}
          {!hasCurrentPublishedVersion ? (
            <p className="muted">
              Publishing pins an immutable version for future runs. A Draft definition can
              still start an app-plane run, recorded as Not pinned (draft).
            </p>
          ) : null}
          <p className="muted">
            Only a validated version becomes Active. Publication grants no external action
            or role.
          </p>
        </section>

        <section className="panel">
          <h2>Start run</h2>
          <p className="muted">
            Creates an internal checklist. External changes use their separate
            confirmation controls.
          </p>
          <label>
            Due date
            <input
              disabled={!canEdit || isBusy}
              onChange={(event) =>
                setRunForm({ ...runForm, due_date: event.target.value })
              }
              type="date"
              value={runForm.due_date}
            />
            <span className="muted">
              {runForm.due_date ? formatCalendarDate(runForm.due_date) : "MM/DD/YYYY"}
            </span>
          </label>
          <label className="workflow-note-field">
            Start note
            <textarea
              disabled={!canEdit || isBusy}
              onChange={(event) => setRunForm({ ...runForm, note: event.target.value })}
              rows={3}
              value={runForm.note}
            />
          </label>
          <button
            className="secondary-button"
            disabled={!canEdit || isBusy || definition.status === "Retired"}
            onClick={startRun}
            type="button"
          >
            Start run
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
                  {run.status} - Due {formatCalendarDate(run.due_date)}
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

function publicationFor(
  definition: ProcessDefinitionRecord,
  evidence?: ProcessDefinitionPublicationRead,
): ProcessDefinitionPublicationRead {
  if (definition.status !== "Active")
    return {
      state: "not_published",
      ...(definition.active_version_id
        ? { priorVersionId: definition.active_version_id }
        : {}),
    };
  if (
    evidence?.state === "verified" &&
    evidence.definitionId === definition.id &&
    evidence.definitionRevision === definition.revision &&
    evidence.versionId === definition.active_version_id &&
    /^[a-f0-9]{64}$/.test(evidence.definitionRevision) &&
    /^[a-f0-9]{64}$/.test(evidence.contentHash) &&
    /^[a-f0-9]{64}$/.test(evidence.contentIdentityHash) &&
    Number.isSafeInteger(evidence.versionNumber) &&
    evidence.versionNumber > 0 &&
    Number.isSafeInteger(evidence.byteSize) &&
    evidence.byteSize > 0
  )
    return evidence;
  return evidence?.state === "unavailable"
    ? evidence
    : {
        state: "unavailable",
        message:
          "The immutable published version has not been verified against this saved content and revision.",
      };
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
    throw new WorkflowRequestError(readApiError(payload), response.status);
  }

  return payload as T;
}

class WorkflowRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
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
