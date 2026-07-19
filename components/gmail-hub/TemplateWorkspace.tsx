"use client";

import { useState } from "react";

import {
  GMAIL_DRAFT_CATEGORIES,
  GMAIL_INBOX_ZERO_PHASES,
  type GmailDraftCategoryId,
} from "@/lib/gmail-inbox-zero/constants";
import { buildReplyDraft } from "@/lib/gmail-inbox-zero/drafts";
import {
  evaluateInboxTriage,
  type GmailInboxZeroPhase,
  type TriageResult,
} from "@/lib/gmail-inbox-zero/rules";
import {
  SAMPLE_LABEL_RULES,
  SAMPLE_REPLY_TEMPLATES,
} from "@/lib/gmail-inbox-zero/sample-hub";

interface DraftPreview {
  ok: boolean;
  draft?: string;
  errors: string[];
}

/**
 * Template + triage workspace. Runs the governed engines — evaluateInboxTriage and buildReplyDraft —
 * client-side over PASTED, sanitized TriageMessageFacts. Only Approved rules produce a suggestion; only
 * Approved templates produce a draft; hard-excluded categories are label-only; the Shadow rollout phase
 * suggests but applies nothing. It reads no live mailbox and has no send control.
 */
export function TemplateWorkspace() {
  const [sender, setSender] = useState("vendor@example.com");
  const [subject, setSubject] = useState("Re: invoice question");
  const [category, setCategory] = useState<GmailDraftCategoryId>("vendor");
  const [phase, setPhase] = useState<GmailInboxZeroPhase>("Suggest");
  const [templateId, setTemplateId] = useState(SAMPLE_REPLY_TEMPLATES[0]?.id ?? "");
  const [missingFactsText, setMissingFactsText] = useState("");
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [draft, setDraft] = useState<DraftPreview | null>(null);

  const template = SAMPLE_REPLY_TEMPLATES.find((t) => t.id === templateId);

  function evaluate() {
    const message = {
      sender,
      subject,
      category,
    };
    setTriage(evaluateInboxTriage([...SAMPLE_LABEL_RULES], message, phase));

    if (template) {
      const missingFacts = missingFactsText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const result = buildReplyDraft({
        template,
        missingFacts,
        category,
      });
      setDraft({ ok: result.ok, draft: result.draft, errors: result.errors });
    }
  }

  return (
    <section className="gmail-template-workspace ui-stack">
      <div>
        <h2 className="section-title">Template &amp; triage workspace</h2>
        <p className="muted">
          Evaluate a message against the Admin-approved rule and reply-pattern sets over
          pasted, sanitized facts. Approved rules only; Shadow phase applies nothing;
          hard-excluded categories are label-only; every draft carries the
          review-before-sending banner. No mailbox is read and nothing here can send.
        </p>
      </div>

      <div className="grid two">
        <article className="panel ui-stack">
          <h3>Label rules</h3>
          <ul className="compact-list">
            {SAMPLE_LABEL_RULES.map((rule) => (
              <li key={rule.id}>
                <strong>{rule.label}</strong> · {rule.plain_english}{" "}
                <span className="queue-pill" data-value={rule.status}>
                  {rule.status}
                </span>
              </li>
            ))}
          </ul>
        </article>
        <article className="panel ui-stack">
          <h3>Reply patterns</h3>
          <ul className="compact-list">
            {SAMPLE_REPLY_TEMPLATES.map((t) => (
              <li key={t.id}>
                {t.name}{" "}
                <span className="queue-pill" data-value={t.status}>
                  {t.status}
                </span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article className="panel ui-stack">
        <h3>Paste sanitized facts</h3>
        <div className="grid two">
          <label className="field">
            <span>Sender</span>
            <input value={sender} onChange={(event) => setSender(event.target.value)} />
          </label>
          <label className="field">
            <span>Category</span>
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as GmailDraftCategoryId)
              }
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
        <div className="grid two">
          <label className="field">
            <span>Rollout phase</span>
            <select
              value={phase}
              onChange={(event) => setPhase(event.target.value as GmailInboxZeroPhase)}
            >
              {GMAIL_INBOX_ZERO_PHASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Reply pattern</span>
            <select
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              {SAMPLE_REPLY_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.status}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Facts to verify (one per line)</span>
          <textarea
            rows={2}
            value={missingFactsText}
            onChange={(event) => setMissingFactsText(event.target.value)}
          />
        </label>
        <button className="secondary-button" onClick={evaluate} type="button">
          Evaluate
        </button>
      </article>

      {triage ? (
        <article className="panel ui-stack">
          <h3>Suggested labels</h3>
          {triage.suggestions.length > 0 ? (
            <ul className="compact-list">
              {triage.suggestions.map((suggestion) => (
                <li key={suggestion.rule_id}>
                  <strong>{suggestion.label}</strong> · {suggestion.reason}
                  {triage.auto_apply.some((a) => a.rule_id === suggestion.rule_id)
                    ? " (auto-apply eligible)"
                    : " (suggest only)"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No approved rule matched these facts.</p>
          )}
          {draft ? (
            draft.ok && draft.draft ? (
              <>
                <h3>Draft preview</h3>
                <div className="draft-box">{draft.draft}</div>
              </>
            ) : (
              <p className="muted">Draft refused: {draft.errors.join(" ")}</p>
            )
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
