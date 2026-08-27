"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, Field } from "@/components/ui";
import { OperationalPageRenderer } from "@/components/operational-pages/OperationalPageRenderer";
import type {
  OperationalPageHead,
  OperationalPageReceipt,
  OperationalPageVersion,
} from "@/lib/firestore/operational-pages";
import {
  OPERATIONAL_PAGE_APPROVAL_CONFIRMATION,
  OPERATIONAL_PAGE_PUBLICATION_CONFIRMATION,
  OPERATIONAL_PAGE_ROLLBACK_CONFIRMATION,
  type OperationalPageComponent,
  type OperationalPageDefinition,
} from "@/lib/operational-pages/schema";

interface EditorBlock {
  type: OperationalPageComponent["type"];
  primary: string;
  secondary: string;
  choice: string;
}

interface CatalogSpace {
  id: string;
  name: string;
}

const EMPTY_BLOCK: EditorBlock = {
  type: "text",
  primary: "",
  secondary: "",
  choice: "",
};

export function OperationalPageBuilderPanel({
  spaces,
}: Readonly<{ spaces: CatalogSpace[] }>) {
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [blocks, setBlocks] = useState<EditorBlock[]>([]);
  const [version, setVersion] = useState<OperationalPageVersion | null>(null);
  const [approved, setApproved] = useState(false);
  const [approveConfirmed, setApproveConfirmed] = useState(false);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [receipt, setReceipt] = useState<OperationalPageReceipt | null>(null);
  const [heads, setHeads] = useState<OperationalPageHead[]>([]);
  const [versions, setVersions] = useState<OperationalPageVersion[]>([]);
  const [rollbackVersionId, setRollbackVersionId] = useState("");
  const [rollbackConfirmed, setRollbackConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadState = useCallback(async () => {
    const data = await fetchOperationalPageState();
    setHeads(data.heads ?? []);
    setVersions(data.versions ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    void fetchOperationalPageState()
      .then((data) => {
        if (!active) return;
        setHeads(data.heads ?? []);
        setVersions(data.versions ?? []);
      })
      .catch((error) => {
        if (active) {
          setMessage(
            error instanceof Error ? error.message : "Page history is unavailable.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const definition = useMemo(() => {
    try {
      return buildDefinition({ spaceId, slug, title, blocks });
    } catch {
      return null;
    }
  }, [blocks, slug, spaceId, title]);

  const rollbackTarget = versions.find((item) => item.id === rollbackVersionId);
  const rollbackHead = rollbackTarget
    ? heads.find((head) => head.id === rollbackTarget.pageId)
    : undefined;

  function resetReview() {
    setVersion(null);
    setApproved(false);
    setApproveConfirmed(false);
    setPublishConfirmed(false);
    setReceipt(null);
  }

  function updateBlock(index: number, patch: Partial<EditorBlock>) {
    setBlocks((current) =>
      current.map((block, candidate) =>
        candidate === index ? { ...block, ...patch } : block,
      ),
    );
    resetReview();
  }

  async function runAction(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/operational-pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The page action was refused.");
      return data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The page action was refused.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createDraft() {
    if (!definition || !reason.trim()) return;
    const data = await runAction({
      operation: "draft",
      definition,
      reason: reason.trim(),
    });
    if (!data?.version) return;
    setVersion(data.version);
    setMessage("Immutable draft saved. Review the exact preview and hash below.");
    await loadState();
  }

  async function approveDraft() {
    if (!version || !approveConfirmed) return;
    const data = await runAction({
      operation: "approve",
      versionId: version.id,
      previewHash: version.previewHash,
      confirmation: OPERATIONAL_PAGE_APPROVAL_CONFIRMATION,
    });
    if (!data?.approval) return;
    setApproved(true);
    setApproveConfirmed(false);
    setMessage("Exact version approved. Nothing is published yet.");
  }

  async function publishDraft() {
    if (!version || !approved || !publishConfirmed) return;
    const data = await runAction({
      operation: "publish",
      versionId: version.id,
      previewHash: version.previewHash,
      confirmation: OPERATIONAL_PAGE_PUBLICATION_CONFIRMATION,
    });
    if (!data?.receipt) return;
    setReceipt(data.receipt);
    setPublishConfirmed(false);
    setMessage("Published and read back. The page remains read-only.");
    await loadState();
  }

  async function rollback() {
    if (!rollbackTarget || !rollbackHead || !rollbackConfirmed) return;
    const data = await runAction({
      operation: "rollback",
      pageId: rollbackHead.id,
      targetVersionId: rollbackTarget.id,
      previewHash: rollbackTarget.previewHash,
      confirmation: OPERATIONAL_PAGE_ROLLBACK_CONFIRMATION,
    });
    if (!data?.receipt) return;
    setRollbackConfirmed(false);
    setRollbackVersionId("");
    setMessage("Prior approved version restored and read back.");
    await loadState();
  }

  return (
    <article className="panel ui-stack">
      <div>
        <h2>Read-only Operational Page Builder</h2>
        <p className="muted">
          Build only headings, text, callouts, checklists, and approved internal links.
          There is no HTML, script, style, embed, action, provider, auth, role, prompt, or
          secret field.
        </p>
      </div>
      <div className="grid two">
        <label className="select-field">
          Existing Space
          <select
            onChange={(event) => {
              setSpaceId(event.target.value);
              resetReview();
            }}
            value={spaceId}
          >
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
        <Field htmlFor="operational-page-slug" label="Page address slug">
          <input
            id="operational-page-slug"
            onChange={(event) => {
              setSlug(event.target.value);
              resetReview();
            }}
            placeholder="renewal-review-process"
            value={slug}
          />
        </Field>
        <Field htmlFor="operational-page-title" label="Page title">
          <input
            id="operational-page-title"
            onChange={(event) => {
              setTitle(event.target.value);
              resetReview();
            }}
            value={title}
          />
        </Field>
        <Field htmlFor="operational-page-reason" label="Reason for this version">
          <input
            id="operational-page-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </Field>
      </div>

      <section className="ui-stack" aria-label="Approved component catalog">
        <div className="ui-spread">
          <h3>Page components</h3>
          <div className="button-row">
            {(["heading", "text", "callout", "checklist", "internal_link"] as const).map(
              (type) => (
                <button
                  className="secondary-button"
                  key={type}
                  onClick={() => {
                    setBlocks((current) => [...current, { ...EMPTY_BLOCK, type }]);
                    resetReview();
                  }}
                  type="button"
                >
                  Add {type.replaceAll("_", " ")}
                </button>
              ),
            )}
          </div>
        </div>
        {blocks.length === 0 ? (
          <p className="muted">Add at least one allowlisted component.</p>
        ) : null}
        {blocks.map((block, index) => (
          <fieldset className="panel ui-stack-tight" key={`${index}:${block.type}`}>
            <legend>
              {index + 1}. {block.type.replaceAll("_", " ")}
            </legend>
            {block.type === "heading" ? (
              <label className="select-field">
                Heading level
                <select
                  onChange={(event) => updateBlock(index, { choice: event.target.value })}
                  value={block.choice || "2"}
                >
                  <option value="2">Section heading</option>
                  <option value="3">Subheading</option>
                </select>
              </label>
            ) : null}
            {block.type === "callout" ? (
              <label className="select-field">
                Callout tone
                <select
                  onChange={(event) => updateBlock(index, { choice: event.target.value })}
                  value={block.choice || "info"}
                >
                  <option value="info">Information</option>
                  <option value="warning">Warning</option>
                </select>
              </label>
            ) : null}
            <Field
              htmlFor={`operational-block-${index}-primary`}
              label={primaryLabel(block.type)}
            >
              {block.type === "text" ? (
                <textarea
                  id={`operational-block-${index}-primary`}
                  onChange={(event) =>
                    updateBlock(index, { primary: event.target.value })
                  }
                  rows={4}
                  value={block.primary}
                />
              ) : (
                <input
                  id={`operational-block-${index}-primary`}
                  onChange={(event) =>
                    updateBlock(index, { primary: event.target.value })
                  }
                  value={block.primary}
                />
              )}
            </Field>
            {block.type === "callout" ||
            block.type === "checklist" ||
            block.type === "internal_link" ? (
              <Field
                htmlFor={`operational-block-${index}-secondary`}
                label={secondaryLabel(block.type)}
              >
                <textarea
                  id={`operational-block-${index}-secondary`}
                  onChange={(event) =>
                    updateBlock(index, { secondary: event.target.value })
                  }
                  rows={block.type === "checklist" ? 4 : 2}
                  value={block.secondary}
                />
              </Field>
            ) : null}
            <button
              className="secondary-button"
              onClick={() => {
                setBlocks((current) => current.filter((_, item) => item !== index));
                resetReview();
              }}
              type="button"
            >
              Remove component
            </button>
          </fieldset>
        ))}
      </section>

      <Button
        disabled={busy || !definition || !reason.trim()}
        onClick={() => void createDraft()}
        type="button"
      >
        Save immutable draft and preview
      </Button>
      {version ? (
        <section className="ui-stack" aria-label="Exact operational page preview">
          <OperationalPageRenderer definition={version.definition} preview />
          <p className="muted">Exact preview hash: {version.previewHash}</p>
          {!approved ? (
            <>
              <label className="queue-toggle">
                <input
                  checked={approveConfirmed}
                  onChange={(event) => setApproveConfirmed(event.target.checked)}
                  type="checkbox"
                />
                {OPERATIONAL_PAGE_APPROVAL_CONFIRMATION}
              </label>
              <Button
                disabled={busy || !approveConfirmed}
                onClick={() => void approveDraft()}
                type="button"
              >
                Approve exact version
              </Button>
            </>
          ) : !receipt ? (
            <>
              <label className="queue-toggle">
                <input
                  checked={publishConfirmed}
                  onChange={(event) => setPublishConfirmed(event.target.checked)}
                  type="checkbox"
                />
                {OPERATIONAL_PAGE_PUBLICATION_CONFIRMATION}
              </label>
              <Button
                disabled={busy || !publishConfirmed}
                onClick={() => void publishDraft()}
                type="button"
              >
                Publish approved version
              </Button>
            </>
          ) : (
            <p>
              <a
                href={`/spaces/${version.definition.spaceId}/pages/${version.definition.slug}`}
              >
                Open published page
              </a>{" "}
              · receipt {receipt.id}
            </p>
          )}
        </section>
      ) : null}

      <section className="ui-stack" aria-label="Operational page rollback">
        <h3>Restore a prior approved version</h3>
        <label className="select-field">
          Exact prior version
          <select
            onChange={(event) => {
              setRollbackVersionId(event.target.value);
              setRollbackConfirmed(false);
            }}
            value={rollbackVersionId}
          >
            <option value="">Select a version…</option>
            {versions
              .filter((item) => {
                const head = heads.find((candidate) => candidate.id === item.pageId);
                return (
                  Boolean(head?.publishedVersionId) &&
                  head?.publishedVersionId !== item.id
                );
              })
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.definition.title} · version {item.versionNumber}
                </option>
              ))}
          </select>
        </label>
        {rollbackTarget ? (
          <>
            <OperationalPageRenderer definition={rollbackTarget.definition} preview />
            <p className="muted">Exact preview hash: {rollbackTarget.previewHash}</p>
            <label className="queue-toggle">
              <input
                checked={rollbackConfirmed}
                onChange={(event) => setRollbackConfirmed(event.target.checked)}
                type="checkbox"
              />
              {OPERATIONAL_PAGE_ROLLBACK_CONFIRMATION}
            </label>
            <Button
              disabled={busy || !rollbackConfirmed}
              onClick={() => void rollback()}
              type="button"
            >
              Restore exact prior version
            </Button>
          </>
        ) : null}
      </section>
      {message ? <p role="status">{message}</p> : null}
    </article>
  );
}

async function fetchOperationalPageState(): Promise<{
  heads?: OperationalPageHead[];
  versions?: OperationalPageVersion[];
}> {
  const response = await fetch("/api/admin/operational-pages");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Page history could not be loaded.");
  return data;
}

function buildDefinition(input: {
  spaceId: string;
  slug: string;
  title: string;
  blocks: EditorBlock[];
}): OperationalPageDefinition {
  if (
    !input.spaceId ||
    !input.slug.trim() ||
    !input.title.trim() ||
    !input.blocks.length
  ) {
    throw new Error("Incomplete page.");
  }
  const components = input.blocks.map<OperationalPageComponent>((block) => {
    switch (block.type) {
      case "heading":
        return {
          type: "heading",
          text: required(block.primary),
          level: block.choice === "3" ? "3" : "2",
        };
      case "text":
        return { type: "text", text: required(block.primary) };
      case "callout":
        return {
          type: "callout",
          tone: block.choice === "warning" ? "warning" : "info",
          title: required(block.primary),
          text: required(block.secondary),
        };
      case "checklist":
        return {
          type: "checklist",
          title: required(block.primary),
          items: block.secondary
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean),
        };
      case "internal_link":
        return {
          type: "internal_link",
          label: required(block.primary),
          href: required(block.secondary),
        };
    }
  });
  return {
    pageType: "operational_process",
    spaceId: input.spaceId,
    slug: input.slug.trim(),
    title: input.title.trim(),
    components,
  };
}

function required(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Missing component value.");
  return trimmed;
}

function primaryLabel(type: EditorBlock["type"]): string {
  switch (type) {
    case "heading":
      return "Heading text";
    case "text":
      return "Paragraph text";
    case "callout":
    case "checklist":
      return "Title";
    case "internal_link":
      return "Link label";
  }
}

function secondaryLabel(type: EditorBlock["type"]): string {
  switch (type) {
    case "callout":
      return "Callout text";
    case "checklist":
      return "Checklist items, one per line";
    case "internal_link":
      return "Approved internal path";
    default:
      return "Value";
  }
}
