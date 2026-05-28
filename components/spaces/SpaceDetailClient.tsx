"use client";

import { useMemo, useState } from "react";
import type {
  PlaceholderRecord,
  SopRecord,
  TemplateRecord,
  ToolRecord,
} from "@/lib/firestore/types";

type EditableSop = Pick<
  SopRecord,
  "body_md" | "id" | "source_state_hint" | "status" | "title" | "updated_at"
>;
type EditableTemplate = Pick<
  TemplateRecord,
  "audience" | "body" | "channel" | "id" | "name" | "status"
>;
type EditablePlaceholder = Pick<
  PlaceholderRecord,
  "due_date" | "id" | "missing_detail" | "priority" | "status"
>;
type EditableTool = Pick<
  ToolRecord,
  "id" | "integration_status" | "name" | "purpose" | "url"
>;

export function SpaceDetailClient({
  canApprove,
  readOnly,
  seed,
}: Readonly<{
  canApprove: boolean;
  readOnly?: boolean;
  seed: {
    placeholders: EditablePlaceholder[];
    sops: EditableSop[];
    templates: EditableTemplate[];
    tools: EditableTool[];
  };
}>) {
  const [sops, setSops] = useState(seed.sops);
  const [templates] = useState(seed.templates);
  const [placeholders, setPlaceholders] = useState(seed.placeholders);
  const [tools] = useState(seed.tools);
  const currentSop = sops[0] ?? null;
  const reviewCount = useMemo(
    () =>
      sops.filter((sop) => sop.status === "In Review").length +
      templates.filter((template) => template.status === "In Review").length +
      placeholders.filter((placeholder) => placeholder.status === "In Review").length,
    [placeholders, sops, templates],
  );

  function updateSopBody(body: string) {
    setSops((records) =>
      records.map((record, index) =>
        index === 0
          ? {
              ...record,
              body_md: body,
              updated_at: new Date().toISOString(),
            }
          : record,
      ),
    );
  }

  function approveSop() {
    setSops((records) =>
      records.map((record, index) =>
        index === 0
          ? {
              ...record,
              status: "Approved",
              updated_at: new Date().toISOString(),
            }
          : record,
      ),
    );
  }

  function resolvePlaceholder(placeholderId: string) {
    setPlaceholders((records) =>
      records.map((record) =>
        record.id === placeholderId ? { ...record, status: "Resolved" } : record,
      ),
    );
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
                : "Create an SOP when the editable API is connected."}
            </p>
          </div>
          {reviewCount > 0 ? (
            <span className="review-pill">{reviewCount} in review</span>
          ) : null}
        </div>

        {currentSop ? (
          <>
            <label className="editor-label" htmlFor="sop-body">
              SOP body
            </label>
            <textarea
              className="sop-editor"
              disabled={readOnly}
              id="sop-body"
              onChange={(event) => updateSopBody(event.target.value)}
              rows={12}
              value={currentSop.body_md}
            />
            <div className="action-row">
              <button className="secondary-button" disabled={readOnly} type="button">
                Save local demo changes
              </button>
              <button
                className="primary-button"
                disabled={readOnly || !canApprove || currentSop.status === "Approved"}
                onClick={approveSop}
                type="button"
              >
                Mark Approved
              </button>
            </div>
          </>
        ) : null}
      </section>

      <aside className="space-side">
        <section className="panel">
          <h2>Templates</h2>
          {templates.map((template) => (
            <article className="compact-record" key={template.id}>
              <strong>{template.name}</strong>
              <p className="muted">
                {template.audience} - {template.channel} - {template.status}
              </p>
            </article>
          ))}
        </section>

        <section className="panel">
          <h2>Tools</h2>
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
          <h2>Placeholders</h2>
          {placeholders.map((placeholder) => (
            <article className="compact-record" key={placeholder.id}>
              <strong>{placeholder.missing_detail}</strong>
              <p className="muted">
                {placeholder.priority} - {placeholder.status}
                {placeholder.due_date ? ` - Due ${placeholder.due_date}` : ""}
              </p>
              <button
                className="secondary-button compact-button"
                disabled={readOnly || !canApprove || placeholder.status === "Resolved"}
                onClick={() => resolvePlaceholder(placeholder.id)}
                type="button"
              >
                Resolve
              </button>
            </article>
          ))}
        </section>
      </aside>
    </div>
  );
}
