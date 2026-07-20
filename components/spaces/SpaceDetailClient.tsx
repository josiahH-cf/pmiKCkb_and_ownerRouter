"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ChangeLogRecord,
  PlaceholderRecord,
  SopRecord,
  TemplateRecord,
  ToolRecord,
} from "@/lib/firestore/types";

type EditableSop = Pick<
  SopRecord,
  | "body_md"
  | "id"
  | "owner_uid"
  | "sensitivity"
  | "source_state_hint"
  | "space_id"
  | "status"
  | "title"
  | "updated_at"
>;
type EditableTemplate = Pick<
  TemplateRecord,
  | "approved_by_uid"
  | "audience"
  | "body"
  | "channel"
  | "id"
  | "last_reviewed_at"
  | "name"
  | "owner_uid"
  | "space_id"
  | "status"
>;
type EditablePlaceholder = Pick<
  PlaceholderRecord,
  | "due_date"
  | "id"
  | "missing_detail"
  | "owner_uid"
  | "priority"
  | "resolution"
  | "space_id"
  | "status"
>;
type EditableTool = Pick<
  ToolRecord,
  | "id"
  | "integration_status"
  | "name"
  | "primary_owner_uid"
  | "purpose"
  | "sensitivity"
  | "url"
>;
type EditableChangeLog = Pick<
  ChangeLogRecord,
  "action" | "created_at" | "editor_uid" | "entity_id" | "entity_type" | "id" | "note"
>;

interface EditableSeed {
  placeholders: EditablePlaceholder[];
  sops: EditableSop[];
  templates: EditableTemplate[];
  tools: EditableTool[];
}

type DataMode = "loading" | "api" | "seed";

export function SpaceDetailClient({
  canApprove,
  canEdit,
  canSoftDelete = false,
  readOnly,
  seed,
  spaceId,
  spaceName,
}: Readonly<{
  canApprove: boolean;
  canEdit: boolean;
  canSoftDelete?: boolean;
  readOnly?: boolean;
  seed: EditableSeed;
  spaceId: string;
  spaceName: string;
}>) {
  const [mode, setMode] = useState<DataMode>("loading");
  const [sops, setSops] = useState(seed.sops);
  const [templates, setTemplates] = useState(seed.templates);
  const [placeholders, setPlaceholders] = useState(seed.placeholders);
  const [tools, setTools] = useState(seed.tools);
  const [changeLog, setChangeLog] = useState<EditableChangeLog[]>([]);
  const [draftBody, setDraftBody] = useState(seed.sops[0]?.body_md ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateDraftName, setTemplateDraftName] = useState("");
  const [templateDraftBody, setTemplateDraftBody] = useState("");
  const [message, setMessage] = useState("Loading editable records.");
  const [isBusy, setIsBusy] = useState(false);
  const currentSop = sops[0] ?? null;
  const canMutate = canEdit && !readOnly && !isBusy;
  const canDelete = canSoftDelete && !readOnly && !isBusy;
  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? null;
  const reviewCount = useMemo(
    () =>
      sops.filter((sop) => sop.status === "In Review").length +
      templates.filter((template) => template.status === "In Review").length +
      placeholders.filter(
        (placeholder) =>
          placeholder.status === "In Review" || placeholder.status === "Open",
      ).length,
    [placeholders, sops, templates],
  );

  useEffect(() => {
    let isCurrent = true;

    async function loadEditableRecords() {
      try {
        const [
          sopsResult,
          templatesResult,
          placeholdersResult,
          toolsResult,
          changeLogResult,
        ] = await Promise.all([
          fetchEditable<{ sops: EditableSop[] }>(`/api/spaces/${spaceId}/sops`),
          fetchEditable<{ templates: EditableTemplate[] }>(
            `/api/spaces/${spaceId}/templates`,
          ),
          fetchEditable<{ placeholders: EditablePlaceholder[] }>(
            `/api/spaces/${spaceId}/placeholders`,
          ),
          fetchEditable<{ tools: EditableTool[] }>("/api/tools"),
          fetchEditable<{ changeLog: EditableChangeLog[] }>(
            `/api/spaces/${spaceId}/change-log`,
          ),
        ]);

        if (!isCurrent) {
          return;
        }

        setSops(sopsResult.sops);
        setTemplates(templatesResult.templates);
        setPlaceholders(placeholdersResult.placeholders);
        setTools(toolsResult.tools);
        setChangeLog(changeLogResult.changeLog);
        setDraftBody(sopsResult.sops[0]?.body_md ?? "");
        setMode("api");
        setMessage("Editable API connected.");
      } catch {
        if (!isCurrent) {
          return;
        }

        setSops(seed.sops);
        setTemplates(seed.templates);
        setPlaceholders(seed.placeholders);
        setTools(seed.tools);
        setChangeLog([]);
        setDraftBody(seed.sops[0]?.body_md ?? "");
        setMode("seed");
        setMessage("Using local demo records until Firebase setup is complete.");
      }
    }

    loadEditableRecords();

    return () => {
      isCurrent = false;
    };
  }, [seed, spaceId]);

  async function saveSopBody() {
    if (!currentSop || !canMutate) {
      return;
    }

    if (mode !== "api") {
      setSops((records) =>
        records.map((record, index) =>
          index === 0
            ? {
                ...record,
                body_md: draftBody,
                updated_at: new Date().toISOString(),
              }
            : record,
        ),
      );
      setMessage("Saved local demo changes.");
      return;
    }

    await runMutation(async () => {
      const { sop } = await fetchEditable<{ sop: EditableSop }>(
        `/api/sops/${currentSop.id}`,
        {
          body: JSON.stringify({
            body_md: draftBody,
            note: `Saved from ${spaceName} Space.`,
          }),
          method: "PATCH",
        },
      );

      setSops((records) =>
        records.map((record) => (record.id === sop.id ? sop : record)),
      );
      setDraftBody(sop.body_md);
      setMessage("Saved to editable API.");
    });
  }

  async function approveSop() {
    if (!currentSop || !canMutate || !canApprove) {
      return;
    }

    if (mode !== "api") {
      const now = new Date().toISOString();
      setSops((records) =>
        records.map((record, index) =>
          index === 0 ? { ...record, status: "Approved", updated_at: now } : record,
        ),
      );
      setMessage("Marked approved in local demo records.");
      return;
    }

    await runMutation(async () => {
      const { sop } = await fetchEditable<{ sop: EditableSop }>(
        `/api/sops/${currentSop.id}`,
        {
          body: JSON.stringify({
            last_reviewed_at: new Date().toISOString(),
            note: `Approved from ${spaceName} Space.`,
            status: "Approved",
          }),
          method: "PATCH",
        },
      );

      setSops((records) =>
        records.map((record) => (record.id === sop.id ? sop : record)),
      );
      setDraftBody(sop.body_md);
      setMessage("Approved through editable API.");
    });
  }

  async function resolvePlaceholder(placeholderId: string) {
    if (!canMutate || !canApprove) {
      return;
    }

    if (mode !== "api") {
      setPlaceholders((records) =>
        records.map((record) =>
          record.id === placeholderId ? { ...record, status: "Resolved" } : record,
        ),
      );
      setMessage("Resolved placeholder in local demo records.");
      return;
    }

    await runMutation(async () => {
      const { placeholder } = await fetchEditable<{
        placeholder: EditablePlaceholder;
      }>(`/api/placeholders/${placeholderId}`, {
        body: JSON.stringify({
          note: `Resolved from ${spaceName} Space.`,
          resolution: `Resolved during ${spaceName} Space review.`,
          status: "Resolved",
        }),
        method: "PATCH",
      });

      setPlaceholders((records) =>
        records.map((record) => (record.id === placeholder.id ? placeholder : record)),
      );
      setMessage("Resolved through editable API.");
    });
  }

  async function createDemoSop() {
    const demoSop = seed.sops[0];

    if (!demoSop || !canMutate || mode !== "api") {
      return;
    }

    await runMutation(async () => {
      const { sop } = await fetchEditable<{ sop: EditableSop }>(
        `/api/spaces/${spaceId}/sops`,
        {
          body: JSON.stringify({
            body_md: demoSop.body_md,
            owner_uid: demoSop.owner_uid,
            sensitivity: demoSop.sensitivity,
            source_state_hint: demoSop.source_state_hint,
            status: demoSop.status,
            title: demoSop.title,
            note: `Created from safe ${spaceName} seed.`,
          }),
          method: "POST",
        },
      );

      setSops((records) => [sop, ...records]);
      setDraftBody(sop.body_md);
      setMessage("Created seed SOP through editable API.");
    });
  }

  async function createDemoTemplate() {
    const demoTemplate = seed.templates[0];

    if (!demoTemplate || !canMutate || mode !== "api") {
      return;
    }

    await runMutation(async () => {
      const { template } = await fetchEditable<{ template: EditableTemplate }>(
        `/api/spaces/${spaceId}/templates`,
        {
          body: JSON.stringify({
            audience: demoTemplate.audience,
            body: demoTemplate.body,
            channel: demoTemplate.channel,
            name: demoTemplate.name,
            status: demoTemplate.status,
            note: `Created from safe ${spaceName} seed.`,
          }),
          method: "POST",
        },
      );

      setTemplates((records) => [template, ...records]);
      setMessage("Created seed template through editable API.");
    });
  }

  // F-TMPL-1: the template editor mirrors the SOP edit loop (save -> submit for review -> approve ->
  // soft-delete), reusing runMutation + fetchEditable against the existing /api/templates routes.
  function selectTemplate(template: EditableTemplate) {
    setSelectedTemplateId(template.id);
    setTemplateDraftName(template.name);
    setTemplateDraftBody(template.body);
    setMessage(`Editing template "${template.name}".`);
  }

  async function saveTemplate() {
    if (!selectedTemplate || !canMutate) {
      return;
    }
    const name = templateDraftName.trim();
    const body = templateDraftBody.trim();
    if (name.length === 0 || body.length === 0) {
      return;
    }

    if (mode !== "api") {
      setTemplates((records) =>
        records.map((record) =>
          record.id === selectedTemplate.id ? { ...record, body, name } : record,
        ),
      );
      setMessage("Saved template changes in local demo records.");
      return;
    }

    await runMutation(async () => {
      const { template } = await fetchEditable<{ template: EditableTemplate }>(
        `/api/templates/${selectedTemplate.id}`,
        {
          body: JSON.stringify({
            body,
            name,
            note: `Saved template from ${spaceName} Space.`,
          }),
          method: "PATCH",
        },
      );

      setTemplates((records) =>
        records.map((record) => (record.id === template.id ? template : record)),
      );
      setTemplateDraftName(template.name);
      setTemplateDraftBody(template.body);
      setMessage("Saved template to editable API.");
    });
  }

  async function transitionTemplate(status: "In Review" | "Approved") {
    if (!selectedTemplate || !canMutate || (status === "Approved" && !canApprove)) {
      return;
    }

    if (mode !== "api") {
      setTemplates((records) =>
        records.map((record) =>
          record.id === selectedTemplate.id ? { ...record, status } : record,
        ),
      );
      setMessage(`Template marked ${status} in local demo records.`);
      return;
    }

    await runMutation(async () => {
      const { template } = await fetchEditable<{ template: EditableTemplate }>(
        `/api/templates/${selectedTemplate.id}`,
        {
          body: JSON.stringify({
            status,
            // The server stamps approved_by_uid on approval (F-TMPL-7); the client only supplies the
            // review timestamp, exactly like the SOP approve flow.
            ...(status === "Approved"
              ? { last_reviewed_at: new Date().toISOString() }
              : {}),
            note: `Template ${status} from ${spaceName} Space.`,
          }),
          method: "PATCH",
        },
      );

      setTemplates((records) =>
        records.map((record) => (record.id === template.id ? template : record)),
      );
      setMessage(`Template ${status} through editable API.`);
    });
  }

  async function softDeleteTemplateRecord() {
    if (!selectedTemplate || !canDelete) {
      return;
    }
    const removedId = selectedTemplate.id;

    if (mode !== "api") {
      setTemplates((records) => records.filter((record) => record.id !== removedId));
      setSelectedTemplateId(null);
      setMessage("Removed template from local demo records.");
      return;
    }

    await runMutation(async () => {
      await fetchEditable<{ ok?: boolean }>(`/api/templates/${removedId}`, {
        body: JSON.stringify({ note: `Retired from ${spaceName} Space.` }),
        method: "DELETE",
      });

      setTemplates((records) => records.filter((record) => record.id !== removedId));
      setSelectedTemplateId(null);
      setMessage("Retired template through editable API.");
    });
  }

  async function createDemoPlaceholder() {
    const demoPlaceholder = seed.placeholders[0];

    if (!demoPlaceholder || !canMutate || mode !== "api") {
      return;
    }

    await runMutation(async () => {
      const { placeholder } = await fetchEditable<{
        placeholder: EditablePlaceholder;
      }>(`/api/spaces/${spaceId}/placeholders`, {
        body: JSON.stringify({
          due_date: demoPlaceholder.due_date,
          missing_detail: demoPlaceholder.missing_detail,
          owner_uid: demoPlaceholder.owner_uid,
          priority: demoPlaceholder.priority,
          status: demoPlaceholder.status,
          note: `Created from safe ${spaceName} seed.`,
        }),
        method: "POST",
      });

      setPlaceholders((records) => [placeholder, ...records]);
      setMessage("Created seed placeholder through editable API.");
    });
  }

  async function createDemoTool() {
    const demoTool = seed.tools[0];

    if (!demoTool || !canMutate || mode !== "api") {
      return;
    }

    await runMutation(async () => {
      const { tool } = await fetchEditable<{ tool: EditableTool }>("/api/tools", {
        body: JSON.stringify({
          integration_status: demoTool.integration_status,
          name: demoTool.name,
          primary_owner_uid: demoTool.primary_owner_uid,
          purpose: demoTool.purpose,
          sensitivity: demoTool.sensitivity,
          url: demoTool.url,
          note: `Created from safe ${spaceName} seed.`,
        }),
        method: "POST",
      });

      setTools((records) => [tool, ...records]);
      setMessage("Created seed tool through editable API.");
    });
  }

  async function runMutation(operation: () => Promise<void>) {
    setIsBusy(true);
    setMessage("Saving.");

    try {
      await operation();
    } catch (error) {
      setMessage(readErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-detail-grid">
      <section className="panel space-main">
        <div className="panel-heading">
          <div>
            <h2>{currentSop?.title ?? "No SOP yet"}</h2>
            <p className="muted">
              {currentSop
                ? `${currentSop.status} - ${currentSop.source_state_hint}`
                : `Create an SOP from the safe ${spaceName} seed.`}
            </p>
          </div>
          {reviewCount > 0 ? (
            <span className="review-pill">{reviewCount} in review</span>
          ) : null}
        </div>
        <p className="muted">{message}</p>

        {currentSop ? (
          <>
            <label className="editor-label" htmlFor="sop-body">
              SOP body
            </label>
            <textarea
              className="sop-editor"
              disabled={!canMutate}
              id="sop-body"
              onChange={(event) => setDraftBody(event.target.value)}
              rows={12}
              value={draftBody}
            />
            <div className="action-row">
              <button
                className="secondary-button"
                disabled={!canMutate || draftBody.trim().length === 0}
                onClick={saveSopBody}
                type="button"
              >
                Save
              </button>
              <button
                className="primary-button"
                disabled={!canMutate || !canApprove || currentSop.status === "Approved"}
                onClick={approveSop}
                type="button"
              >
                Mark Approved
              </button>
            </div>
          </>
        ) : (
          <button
            className="primary-button"
            disabled={!canMutate || mode !== "api"}
            onClick={createDemoSop}
            type="button"
          >
            Create Seed SOP
          </button>
        )}
      </section>

      <aside className="space-side">
        <section className="panel">
          <div className="panel-heading compact-heading">
            <h2>Templates</h2>
            {templates.length === 0 ? (
              <button
                className="secondary-button compact-button"
                disabled={!canMutate || mode !== "api"}
                onClick={createDemoTemplate}
                type="button"
              >
                Create Seed
              </button>
            ) : null}
          </div>
          {templates.map((template) => (
            <article className="compact-record" key={template.id}>
              <strong>{template.name}</strong>
              <p className="muted">
                {template.audience} - {template.channel} - {template.status}
              </p>
              <button
                className="secondary-button compact-button"
                disabled={isBusy}
                onClick={() => selectTemplate(template)}
                type="button"
              >
                {template.id === selectedTemplateId ? "Editing" : "Edit"}
              </button>
            </article>
          ))}

          {selectedTemplate ? (
            <div className="template-editor">
              <p className="muted">
                Editing {selectedTemplate.name} - {selectedTemplate.status}
                {selectedTemplate.owner_uid
                  ? ` - owner ${selectedTemplate.owner_uid}`
                  : ""}
                {selectedTemplate.approved_by_uid
                  ? ` - approved by ${selectedTemplate.approved_by_uid}`
                  : ""}
              </p>
              <label className="editor-label" htmlFor="template-name">
                Template name
              </label>
              <input
                disabled={!canMutate}
                id="template-name"
                onChange={(event) => setTemplateDraftName(event.target.value)}
                value={templateDraftName}
              />
              <label className="editor-label" htmlFor="template-body">
                Template body
              </label>
              <textarea
                className="sop-editor"
                disabled={!canMutate}
                id="template-body"
                onChange={(event) => setTemplateDraftBody(event.target.value)}
                rows={8}
                value={templateDraftBody}
              />
              <div className="action-row">
                <button
                  className="secondary-button"
                  disabled={
                    !canMutate ||
                    templateDraftName.trim().length === 0 ||
                    templateDraftBody.trim().length === 0
                  }
                  onClick={saveTemplate}
                  type="button"
                >
                  Save
                </button>
                <button
                  className="secondary-button"
                  disabled={
                    !canMutate ||
                    selectedTemplate.status === "In Review" ||
                    selectedTemplate.status === "Approved"
                  }
                  onClick={() => transitionTemplate("In Review")}
                  type="button"
                >
                  Submit for review
                </button>
                <button
                  className="primary-button"
                  disabled={
                    !canMutate || !canApprove || selectedTemplate.status === "Approved"
                  }
                  onClick={() => transitionTemplate("Approved")}
                  type="button"
                >
                  Mark Approved
                </button>
                <button
                  className="secondary-button"
                  disabled={!canDelete}
                  onClick={softDeleteTemplateRecord}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel">
          <div className="panel-heading compact-heading">
            <h2>Tools</h2>
            {tools.length === 0 ? (
              <button
                className="secondary-button compact-button"
                disabled={!canMutate || mode !== "api"}
                onClick={createDemoTool}
                type="button"
              >
                Create Seed
              </button>
            ) : null}
          </div>
          {tools.map((tool) => (
            <article className="compact-record" key={tool.id}>
              <a href={tool.url} rel="noreferrer" target="_blank">
                {tool.name}
              </a>
              <p className="muted">
                {tool.integration_status}: {tool.purpose}
              </p>
            </article>
          ))}
        </section>

        <section className="panel">
          <div className="panel-heading compact-heading">
            <h2>Placeholders</h2>
            {placeholders.length === 0 ? (
              <button
                className="secondary-button compact-button"
                disabled={!canMutate || mode !== "api"}
                onClick={createDemoPlaceholder}
                type="button"
              >
                Create Seed
              </button>
            ) : null}
          </div>
          {placeholders.map((placeholder) => (
            <article className="compact-record" key={placeholder.id}>
              <strong>{placeholder.missing_detail}</strong>
              <p className="muted">
                {placeholder.priority} - {placeholder.status}
                {placeholder.due_date ? ` - Due ${placeholder.due_date}` : ""}
              </p>
              {placeholder.resolution ? (
                <p className="muted">Resolution: {placeholder.resolution}</p>
              ) : null}
              {placeholder.status === "Resolved" ? (
                <span aria-label="Placeholder resolved" className="ui-tag">
                  Resolved
                </span>
              ) : (
                <button
                  className="secondary-button compact-button"
                  disabled={!canMutate || !canApprove}
                  onClick={() => resolvePlaceholder(placeholder.id)}
                  type="button"
                >
                  Resolve
                </button>
              )}
            </article>
          ))}
        </section>

        <section className="panel">
          <h2>Change Log</h2>
          {changeLog.length === 0 ? (
            <p className="muted">No recent changes are available for this Space.</p>
          ) : (
            changeLog.map((entry) => (
              <article className="compact-record" key={entry.id}>
                <strong>
                  {entry.action} {entry.entity_type}
                </strong>
                <p className="muted">
                  {entry.editor_uid} - {entry.created_at}
                  {entry.note ? ` - ${entry.note}` : ""}
                </p>
              </article>
            ))
          )}
        </section>
      </aside>
    </div>
  );
}

async function fetchEditable<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  const response = await fetch(path, {
    ...init,
    headers,
  });

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

  return "Editable API request failed.";
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Editable API request failed.";
}
