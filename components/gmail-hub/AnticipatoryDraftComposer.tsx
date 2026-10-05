"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

import { useState } from "react";
import { useOperation } from "@/components/hooks/useOperation";
import { BusyIndicator } from "@/components/ui/BusyIndicator";
import { boundedLocalWait } from "@/lib/ui/local-lifetime";

import type { ReplyTemplate } from "@/lib/gmail-inbox-zero/drafts";
import {
  GMAIL_DRAFT_CATEGORIES,
  type GmailDraftCategoryId,
} from "@/lib/gmail-inbox-zero/constants";
import { SAMPLE_REPLY_TEMPLATES } from "@/lib/gmail-inbox-zero/sample-hub";

// Mirrors the /api/gmail-hub/anticipatory-draft response (composeAnticipatoryReplyDraft result).
interface DraftResponse {
  ok: boolean;
  draft?: string;
  usedModel: boolean;
  refusedBeforeModel: boolean;
  errors: string[];
  error?: string;
}

/**
 * Anticipatory reply-draft composer. The operator picks an Approved reply template and pastes
 * sanitized message facts; the route runs the deterministic spine first (an unapproved template or a
 * hard-excluded category refuses BEFORE the model) and only then tailors the body through the model
 * seam. Every draft carries the review-before-sending banner. There is NO send control — a human opens
 * Gmail and presses Send. This component never touches a mailbox.
 */
export function AnticipatoryDraftComposer({
  templates = SAMPLE_REPLY_TEMPLATES,
}: Readonly<{ templates?: readonly ReplyTemplate[] }>) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [sender, setSender] = useState("vendor@example.com");
  const [subject, setSubject] = useState("Re: invoice question");
  const [category, setCategory] = useState<GmailDraftCategoryId>("vendor");
  const [missingFactsText, setMissingFactsText] = useState("");
  const operation = useOperation("anticipatory-draft");
  const pending = operation.snapshot.phase === "pending";
  const [result, setResult] = useState<DraftResponse | null>(null);
  const [error, setError] = useState("");
  const copyOperation = useOperation(result?.draft ?? "");
  const copied = copyOperation.snapshot.phase === "succeeded";
  const copying = copyOperation.snapshot.phase === "pending";
  const [copyError, setCopyError] = useState("");

  const template = templates.find((t) => t.id === templateId);

  async function compose() {
    if (!template) return;
    setError("");
    const missingFacts = missingFactsText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const outcome = await operation.controller.run("Composing draft", async (signal) => {
      const response = await fetch("/api/gmail-hub/anticipatory-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal,
        body: JSON.stringify({
          // F-TMPL-3: send only the id; the route resolves the body + status from the approved store.
          template_id: template.id,
          message: {
            sender,
            subject,
            category,
          },
          ...(missingFacts.length > 0 ? { missingFacts } : {}),
        }),
      });
      const payload = (await response.json()) as DraftResponse;
      if (
        !response.ok ||
        typeof payload.ok !== "boolean" ||
        !Array.isArray(payload.errors) ||
        payload.errors.some((value) => typeof value !== "string") ||
        (payload.ok && typeof payload.draft !== "string")
      )
        throw new Error("The draft response could not be validated.");
      return payload;
    });
    if (outcome.outcome === "superseded") return;
    if (outcome.outcome === "succeeded") {
      setResult(outcome.value);
      setCopyError("");
    } else
      setError(
        "Could not compose the draft. Your inputs and previous draft are kept; retry when ready.",
      );
  }

  async function copyDraft(draft: string) {
    if (copying) return;
    setCopyError("");
    const outcome = await copyOperation.controller.run(
      "Copying draft",
      () => boundedLocalWait(navigator.clipboard.writeText(draft)),
      { waitMs: 8_000 },
    );
    if (outcome.outcome === "superseded") return;
    if (outcome.outcome !== "succeeded")
      setCopyError(
        "Copy was not confirmed. Select and copy the displayed draft; its wording is kept.",
      );
  }

  return (
    <article className="panel ui-stack" aria-busy={pending || copying || undefined}>
      <h2>Anticipatory draft</h2>
      <p className="muted">
        Approved patterns only; excluded categories are refused. A person sends from
        Gmail.
      </p>

      <label className="field">
        <span>Reply pattern</span>
        <select
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.status}
            </option>
          ))}
        </select>
      </label>

      <div className="grid two">
        <label className="field">
          <span>Sender</span>
          <input value={sender} onChange={(event) => setSender(event.target.value)} />
        </label>
        <label className="field">
          <span>Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as GmailDraftCategoryId)}
          >
            {GMAIL_DRAFT_CATEGORIES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Subject</span>
        <input value={subject} onChange={(event) => setSubject(event.target.value)} />
      </label>
      <label className="field">
        <span>Facts to verify (one per line)</span>
        <textarea
          rows={2}
          value={missingFactsText}
          onChange={(event) => setMissingFactsText(event.target.value)}
        />
      </label>

      <button
        className="secondary-button"
        disabled={pending || !template}
        onClick={() => void compose()}
        type="button"
      >
        {pending ? "Composing…" : "Compose draft"}
      </button>
      {pending ? <BusyIndicator label="Composing draft" /> : null}
      {result && (pending || error) ? (
        <p className="muted">Previous completed draft</p>
      ) : null}

      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="ui-stack">
          {result.ok && result.draft ? (
            <>
              <p className="muted">
                {result.usedModel
                  ? "Model-tailored draft. Review before sending."
                  : "Deterministic draft. Review before sending."}
              </p>
              <div className="draft-box">{result.draft}</div>
              <button
                className="secondary-button"
                disabled={copying}
                onClick={() => void copyDraft(result.draft ?? "")}
                type="button"
              >
                {copying ? "Copying draft…" : copied ? "Copied" : "Copy draft"}
              </button>
              {copying ? <BusyIndicator label="Copying draft" /> : null}
              {copyError ? (
                <p role="alert" className="error-text">
                  {copyError}
                </p>
              ) : null}
            </>
          ) : (
            <p className="muted">
              Refused before the model:{" "}
              {result.errors.join(" ") || "not eligible for a draft."}
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}
