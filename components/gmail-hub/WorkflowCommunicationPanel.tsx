"use client";

import { useState } from "react";

import { GMAIL_INBOX_ZERO_LABELS } from "@/lib/gmail-inbox-zero/constants";
import { GMAIL_MANUAL_LABEL_RULE_REF } from "@/lib/gmail-hub/governed-artifacts";
import type {
  WorkflowCommunicationContext,
  WorkflowCommunicationEntityType,
  WorkflowCommunicationLane,
  WorkflowCommunicationLink,
  WorkflowCommunicationPurpose,
} from "@/lib/gmail-hub/workflow-context";
import type { GmailThreadView } from "@/lib/gmail-runtime/types";

export function WorkflowCommunicationPanel({
  lane,
  entityType,
  entityId,
  purpose,
  canLink,
}: Readonly<{
  lane: WorkflowCommunicationLane;
  entityType: WorkflowCommunicationEntityType;
  entityId: string;
  purpose: WorkflowCommunicationPurpose;
  canLink: boolean;
}>) {
  const [links, setLinks] = useState<WorkflowCommunicationLink[]>([]);
  const [threadId, setThreadId] = useState("");
  const [linkReason, setLinkReason] = useState("");
  const [selected, setSelected] = useState<WorkflowCommunicationLink | null>(null);
  const [thread, setThread] = useState<GmailThreadView | null>(null);
  const [label, setLabel] =
    useState<(typeof GMAIL_INBOX_ZERO_LABELS)[number]>("Waiting on Team");
  const [labelReason, setLabelReason] = useState("");
  const [analysisCategory, setAnalysisCategory] = useState("general_question");
  const [analysis, setAnalysis] = useState<{
    review_state: string;
    refusedBeforeModel?: boolean;
    proposal?: { summary: string; waiting_on: string; suggested_next_action: string };
    errors?: string[];
  } | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  function context(actionKey: string): WorkflowCommunicationContext {
    return {
      lane,
      entityType,
      entityId,
      purpose,
      actionKey,
      sourceRefs: [`${entityType}:${entityId}`],
    };
  }

  async function loadLinks() {
    setBusy(true);
    setStatus("");
    try {
      const query = encodeURIComponent(JSON.stringify(context("gmail.mailbox.read")));
      const response = await fetch(`/api/gmail-hub/threads?context=${query}`);
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Linked communication is unavailable.");
      setLinks((data.communications ?? []) as WorkflowCommunicationLink[]);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Linked communication is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function linkThread() {
    if (!canLink || !threadId.trim() || !linkReason.trim()) return;
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/gmail-hub/communications/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          context: context("gmail.mailbox.read"),
          threadId: threadId.trim(),
          reason: linkReason.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "The Gmail thread could not be linked.");
      setThreadId("");
      setLinkReason("");
      setStatus("Gmail thread linked to this workflow. No message content was stored.");
      await loadLinks();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "The Gmail thread could not be linked.",
      );
      setBusy(false);
    }
  }

  async function openThread(link: WorkflowCommunicationLink) {
    if (!link.gmail_thread_id) return;
    setBusy(true);
    setStatus("");
    try {
      const query = encodeURIComponent(JSON.stringify(context("gmail.mailbox.read")));
      const response = await fetch(
        `/api/gmail-hub/threads/${encodeURIComponent(link.gmail_thread_id)}?context=${query}`,
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "The linked thread could not be read.");
      setSelected(link);
      setThread(data as GmailThreadView);
      if (link.status === "attention_required") {
        await fetch("/api/notifications/mark-read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "gmail_workflow", id: link.id }),
        });
      }
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "The linked thread could not be read.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function applyLabel() {
    if (!selected?.gmail_thread_id || !labelReason.trim()) return;
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(
        `/api/gmail-hub/threads/${encodeURIComponent(selected.gmail_thread_id)}/labels`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            context: context("gmail.label.apply"),
            label,
            reason: labelReason.trim(),
            ruleRef: GMAIL_MANUAL_LABEL_RULE_REF,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "The approved label was not applied.");
      setLabelReason("");
      setStatus(`Applied ${data.labelName} after explicit human review.`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "The approved label was not applied.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function analyzeThread() {
    if (!selected?.gmail_thread_id) return;
    setBusy(true);
    setStatus("");
    setAnalysis(null);
    try {
      const response = await fetch("/api/gmail-hub/workflow-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          context: context("gmail.mailbox.read"),
          threadId: selected.gmail_thread_id,
          category: analysisCategory,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "AI assistance is unavailable.");
      setAnalysis(data);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI assistance is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="ui-stack workflow-communication-panel">
      <summary>Linked Gmail communication</summary>
      <p className="muted">
        Only communication deliberately linked to this workflow is readable here. Gmail
        remains the message system of record.
      </p>
      <button
        className="secondary-button"
        disabled={busy}
        onClick={() => void loadLinks()}
        type="button"
      >
        Load linked communication
      </button>

      {links.length === 0 ? <p className="muted">No Gmail thread is linked.</p> : null}
      {links.length > 0 ? (
        <ul className="compact-list">
          {links.map((link) => (
            <li key={link.id}>
              <button
                className="secondary-button"
                disabled={busy || !link.gmail_thread_id}
                onClick={() => void openThread(link)}
                type="button"
              >
                Open {link.purpose.replaceAll("_", " ")} —{" "}
                {link.status.replaceAll("_", " ")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {canLink ? (
        <div className="ui-stack">
          <label className="field">
            <span>Existing Gmail thread ID</span>
            <input
              maxLength={200}
              onChange={(event) => setThreadId(event.target.value)}
              value={threadId}
            />
          </label>
          <label className="field">
            <span>Why this thread belongs to this workflow</span>
            <input
              maxLength={500}
              onChange={(event) => setLinkReason(event.target.value)}
              value={linkReason}
            />
          </label>
          <button
            className="secondary-button"
            disabled={busy || !threadId.trim() || !linkReason.trim()}
            onClick={() => void linkThread()}
            type="button"
          >
            Link this existing thread
          </button>
        </div>
      ) : (
        <p className="muted">
          This workflow is simulation-only; Gmail linking and mutations are disabled.
        </p>
      )}

      {thread ? (
        <section className="ui-stack" aria-label="Linked Gmail thread detail">
          <h4>Bounded thread detail</h4>
          <ol className="gmail-message-list">
            {thread.messages.map((message) => (
              <li key={message.id}>
                <strong>{message.from || "Unknown sender"}</strong>
                <span className="muted">{message.subject || "No subject"}</span>
                <p>{message.bodyText || "No inline text body."}</p>
              </li>
            ))}
          </ol>
          {canLink ? (
            <div className="ui-stack">
              <label className="select-field">
                Approved Gmail label
                <select
                  onChange={(event) =>
                    setLabel(
                      event.target.value as (typeof GMAIL_INBOX_ZERO_LABELS)[number],
                    )
                  }
                  value={label}
                >
                  {GMAIL_INBOX_ZERO_LABELS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Human review reason</span>
                <input
                  maxLength={500}
                  onChange={(event) => setLabelReason(event.target.value)}
                  value={labelReason}
                />
              </label>
              <button
                className="secondary-button"
                disabled={busy || !labelReason.trim()}
                onClick={() => void applyLabel()}
                type="button"
              >
                Apply approved label
              </button>
              <label className="select-field">
                Declared analysis category
                <select
                  onChange={(event) => setAnalysisCategory(event.target.value)}
                  value={analysisCategory}
                >
                  <option value="general_question">General question</option>
                  <option value="scheduling">Scheduling</option>
                  <option value="vendor">Vendor</option>
                  <option value="owner_money">Owner money — label only</option>
                  <option value="legal_notices">Legal/notices — label only</option>
                  <option value="tenant_disputes">Tenant dispute — label only</option>
                </select>
              </label>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void analyzeThread()}
                type="button"
              >
                Request AI-assisted understanding
              </button>
              {analysis ? (
                <div className="notice" role="status">
                  <strong>{analysis.review_state}</strong>
                  {analysis.refusedBeforeModel ? (
                    <p>{analysis.errors?.join(" ")}</p>
                  ) : (
                    <>
                      <p>{analysis.proposal?.summary || "No summary was produced."}</p>
                      <p>Waiting on: {analysis.proposal?.waiting_on || "Unclear"}</p>
                      <p>
                        Proposed next action:{" "}
                        {analysis.proposal?.suggested_next_action || "Unclear"}
                      </p>
                    </>
                  )}
                  <p className="muted">
                    Proposal only. Nothing was persisted and no workflow or external
                    system was changed.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {status ? (
        <p className="muted" role="status">
          {status}
        </p>
      ) : null}
    </details>
  );
}
