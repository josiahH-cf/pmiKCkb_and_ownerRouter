"use client";

import { useState } from "react";

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
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DraftResponse | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const template = templates.find((t) => t.id === templateId);

  async function compose() {
    if (!template) return;
    setPending(true);
    setError("");
    setCopied(false);
    setResult(null);
    const missingFacts = missingFactsText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    try {
      const response = await fetch("/api/gmail-hub/anticipatory-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
      const payload = (await response.json().catch(() => ({}))) as DraftResponse;
      if (response.ok) {
        setResult(payload);
      } else {
        setError(payload.error ?? "Could not compose the draft.");
      }
    } catch {
      setError("Could not compose the draft.");
    } finally {
      setPending(false);
    }
  }

  async function copyDraft(draft: string) {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="panel ui-stack">
      <h2>Anticipatory draft</h2>
      <p className="muted">
        Draft a reply from an Approved pattern over pasted, sanitized facts. Unapproved
        patterns and hard-excluded categories are refused before the model. Nothing here
        can send.
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

      {error ? <p className="muted">{error}</p> : null}
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
                onClick={() => void copyDraft(result.draft ?? "")}
                type="button"
              >
                {copied ? "Copied" : "Copy draft"}
              </button>
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
