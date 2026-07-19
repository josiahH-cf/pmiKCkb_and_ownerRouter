"use client";

import { useState } from "react";

import { GMAIL_INBOX_ZERO_LABELS } from "@/lib/gmail-inbox-zero/constants";
import {
  GMAIL_MANUAL_LABEL_RULE_REF,
  type GovernedArtifactRef,
} from "@/lib/gmail-hub/governed-artifacts";
import type {
  WorkflowCommunicationContext,
  WorkflowCommunicationEntityType,
  WorkflowCommunicationLane,
  WorkflowCommunicationLink,
  WorkflowCommunicationPurpose,
} from "@/lib/gmail-hub/workflow-context";
import type {
  GmailOutgoingMessage,
  GmailSendResult,
  GmailThreadView,
} from "@/lib/gmail-runtime/types";

interface WorkflowAiReply {
  ok: boolean;
  reviewState: string;
  policyRef: string;
  artifactRef: string;
  proposal: string;
  diff: { added: string[]; removed: string[] };
  sources: { ref: string; label: string }[];
  errors: string[];
}

interface ExactReplyPreview {
  context: WorkflowCommunicationContext;
  confirmationToken: string;
  expiresAt: string;
  payload: GmailOutgoingMessage;
}

interface ExactReplyReceipt {
  result: GmailSendResult;
  duplicate: boolean;
  reconciled: boolean;
}

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
  const [currentDraft, setCurrentDraft] = useState("");
  const [analysis, setAnalysis] = useState<{
    review_state: string;
    refusedBeforeModel?: boolean;
    proposal?: { summary: string; waiting_on: string; suggested_next_action: string };
    errors?: string[];
  } | null>(null);
  const [aiReply, setAiReply] = useState<WorkflowAiReply | null>(null);
  const [exactReplyPreview, setExactReplyPreview] = useState<ExactReplyPreview | null>(
    null,
  );
  const [exactReplyConfirmed, setExactReplyConfirmed] = useState(false);
  const [exactReplyReceipt, setExactReplyReceipt] = useState<ExactReplyReceipt | null>(
    null,
  );
  const [sendNeedsReconciliation, setSendNeedsReconciliation] = useState(false);
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

  function clearExactReply() {
    setExactReplyPreview(null);
    setExactReplyConfirmed(false);
    setExactReplyReceipt(null);
    setSendNeedsReconciliation(false);
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
      setAnalysis(null);
      setAiReply(null);
      clearExactReply();
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

  async function draftReply() {
    if (!selected?.gmail_thread_id) return;
    setBusy(true);
    setStatus("");
    setAiReply(null);
    clearExactReply();
    try {
      const response = await fetch("/api/gmail-hub/workflow-reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artifactRef: artifactRefForPurpose(purpose),
          category: analysisCategory,
          context: context("gmail.mailbox.read"),
          currentText: currentDraft,
          threadId: selected.gmail_thread_id,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "AI reply is unavailable.");
      setAiReply(data);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI reply is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  async function prepareExactReply() {
    if (!selected?.gmail_thread_id || !aiReply?.ok) return;
    setBusy(true);
    setStatus("");
    clearExactReply();
    try {
      const replyContext: WorkflowCommunicationContext = {
        ...context("gmail.thread.reply"),
        templateRef: aiReply.artifactRef,
        replyPolicyRef: aiReply.policyRef,
        sourceRefs: [
          ...new Set([
            `${entityType}:${entityId}`,
            ...aiReply.sources.map((source) => source.ref),
          ]),
        ],
      };
      const response = await fetch("/api/gmail-hub/send-confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          context: replyContext,
          message: {
            kind: "reply",
            threadId: selected.gmail_thread_id,
            body: aiReply.proposal,
          },
        }),
      });
      const data = (await response.json()) as ExactReplyPreview & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "The exact Gmail reply could not be prepared.");
      }
      setExactReplyPreview(data);
      setStatus(
        "Exact reply prepared. Review every displayed field; nothing has been sent.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The exact Gmail reply could not be prepared.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendExactReply() {
    if (!exactReplyPreview || !exactReplyConfirmed || sendNeedsReconciliation) return;
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/gmail-hub/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          context: exactReplyPreview.context,
          confirmationToken: exactReplyPreview.confirmationToken,
          payload: exactReplyPreview.payload,
        }),
      });
      const data = (await response.json()) as {
        status?: string;
        result?: GmailSendResult;
        duplicate?: boolean;
        error?: string;
      };
      if (!response.ok) {
        if (data.status === "ambiguous") {
          setSendNeedsReconciliation(true);
          setExactReplyConfirmed(false);
          setStatus(
            data.error ??
              "Gmail returned an ambiguous outcome. Do not retry; reconcile it first.",
          );
          return;
        }
        clearExactReply();
        throw new Error(
          data.error ??
            "Gmail did not accept the exact reply. A new preview is required.",
        );
      }
      if (data.status !== "sent" || !data.result) {
        clearExactReply();
        throw new Error("Gmail returned an invalid send receipt.");
      }
      setExactReplyReceipt({
        result: data.result,
        duplicate: Boolean(data.duplicate),
        reconciled: false,
      });
      setExactReplyPreview(null);
      setExactReplyConfirmed(false);
      setSendNeedsReconciliation(false);
      setStatus(
        data.duplicate
          ? "This exact reply had already been sent; the existing receipt was returned."
          : "The exact linked reply was sent once.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "The exact Gmail reply was not sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reconcileExactReply() {
    if (!exactReplyPreview || !sendNeedsReconciliation) return;
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/gmail-hub/send/reconcile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          context: exactReplyPreview.context,
          confirmationToken: exactReplyPreview.confirmationToken,
        }),
      });
      const data = (await response.json()) as {
        status?: "sent" | "not_found";
        result?: GmailSendResult;
        reason?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "The Gmail send could not be reconciled.");
      }
      if (data.status === "not_found") {
        setStatus(
          data.reason ??
            "No matching Gmail message was found. This reply remains blocked; do not retry.",
        );
        return;
      }
      if (data.status !== "sent" || !data.result) {
        throw new Error("Gmail returned an invalid reconciliation result.");
      }
      setExactReplyReceipt({
        result: data.result,
        duplicate: false,
        reconciled: true,
      });
      setExactReplyPreview(null);
      setExactReplyConfirmed(false);
      setSendNeedsReconciliation(false);
      setStatus("The prior Gmail outcome was reconciled as sent; no retry occurred.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The Gmail send could not be reconciled.",
      );
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
                Open {link.purpose.replaceAll("_", " ")} ·{" "}
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
                  onChange={(event) => {
                    setAnalysisCategory(event.target.value);
                    setAnalysis(null);
                    setAiReply(null);
                    clearExactReply();
                  }}
                  value={analysisCategory}
                >
                  <option value="general_question">General question</option>
                  <option value="scheduling">Scheduling</option>
                  <option value="vendor">Vendor</option>
                  <option value="owner_money">Owner money (label only)</option>
                  <option value="legal_notices">Legal/notices (label only)</option>
                  <option value="tenant_disputes">Tenant dispute (label only)</option>
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
              <label className="field">
                <span>Human draft to improve (optional)</span>
                <textarea
                  maxLength={50_000}
                  onChange={(event) => {
                    setCurrentDraft(event.target.value);
                    setAiReply(null);
                    clearExactReply();
                  }}
                  rows={6}
                  value={currentDraft}
                />
              </label>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void draftReply()}
                type="button"
              >
                Request source-backed reply proposal
              </button>
              {aiReply ? (
                <div className="notice ui-stack" role="status">
                  <strong>{aiReply.reviewState}</strong>
                  <p className="muted">
                    {aiReply.artifactRef} · {aiReply.policyRef}
                  </p>
                  {aiReply.ok ? <pre>{aiReply.proposal}</pre> : null}
                  {aiReply.errors.length > 0 ? <p>{aiReply.errors.join(" ")}</p> : null}
                  <details>
                    <summary>Sources and changes</summary>
                    <ul className="compact-list">
                      {aiReply.sources.map((source) => (
                        <li key={source.ref}>
                          {source.label} · {source.ref}
                        </li>
                      ))}
                    </ul>
                    <p>Added: {aiReply.diff.added.join(" / ") || "None"}</p>
                    <p>Removed: {aiReply.diff.removed.join(" / ") || "None"}</p>
                  </details>
                  <p className="muted">
                    Transient proposal only. Review every source and exact word, then
                    prepare the exact mailbox, recipient, subject, and body confirmation.
                  </p>
                  {aiReply.ok ? (
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void prepareExactReply()}
                      type="button"
                    >
                      Review exact linked reply
                    </button>
                  ) : null}
                </div>
              ) : null}
              {exactReplyPreview ? (
                <section
                  aria-label="Exact linked Gmail reply confirmation"
                  className="notice ui-stack"
                >
                  <h4>Exact linked reply: not yet sent</h4>
                  <p>
                    <strong>From:</strong> {exactReplyPreview.payload.from}
                  </p>
                  <p>
                    <strong>To:</strong> {exactReplyPreview.payload.to.join(", ")}
                  </p>
                  <p>
                    <strong>CC:</strong>{" "}
                    {exactReplyPreview.payload.cc.join(", ") || "None"}
                  </p>
                  <p>
                    <strong>BCC:</strong>{" "}
                    {exactReplyPreview.payload.bcc.join(", ") || "None"}
                  </p>
                  <p>
                    <strong>Subject:</strong> {exactReplyPreview.payload.subject}
                  </p>
                  <p>
                    <strong>Linked thread:</strong> {exactReplyPreview.payload.threadId}
                  </p>
                  <p>
                    <strong>Confirmation expires:</strong>{" "}
                    {new Date(exactReplyPreview.expiresAt).toLocaleString()}
                  </p>
                  <div>
                    <strong>Exact reply body:</strong>
                    <pre>{exactReplyPreview.payload.body}</pre>
                  </div>
                  {sendNeedsReconciliation ? (
                    <div className="ui-stack">
                      <p>
                        The prior send outcome is ambiguous. Sending again is disabled
                        until Gmail is checked for the unique message ID.
                      </p>
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => void reconcileExactReply()}
                        type="button"
                      >
                        Reconcile ambiguous reply
                      </button>
                    </div>
                  ) : (
                    <>
                      <label className="checkbox-field">
                        <input
                          checked={exactReplyConfirmed}
                          onChange={(event) =>
                            setExactReplyConfirmed(event.target.checked)
                          }
                          type="checkbox"
                        />
                        <span>
                          I reviewed the exact mailbox, recipient, subject, and reply
                          body.
                        </span>
                      </label>
                      <button
                        className="primary-button"
                        disabled={busy || !exactReplyConfirmed}
                        onClick={() => void sendExactReply()}
                        type="button"
                      >
                        Send exact linked reply
                      </button>
                    </>
                  )}
                </section>
              ) : null}
              {exactReplyReceipt ? (
                <section aria-label="Gmail reply receipt" className="notice ui-stack">
                  <h4>Bodyless Gmail receipt</h4>
                  <p>
                    <strong>Message ID:</strong> {exactReplyReceipt.result.messageId}
                  </p>
                  <p>
                    <strong>Thread ID:</strong> {exactReplyReceipt.result.threadId}
                  </p>
                  <p>
                    {exactReplyReceipt.reconciled
                      ? "Reconciled as sent; no retry occurred."
                      : exactReplyReceipt.duplicate
                        ? "Existing receipt returned; no duplicate provider call occurred."
                        : "Sent once after exact human confirmation."}
                  </p>
                </section>
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

function artifactRefForPurpose(
  purpose: WorkflowCommunicationPurpose,
): GovernedArtifactRef {
  switch (purpose) {
    case "renewal_owner":
      return "owner-renewal:v1.0";
    case "renewal_tenant":
      return "tenant-renewal:v1.0";
    case "maintenance_owner":
      return "maintenance-owner:v1.0";
  }
}
