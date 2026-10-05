"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

import { useLayoutEffect, useRef, useState } from "react";
import { BusyIndicator } from "@/components/ui/BusyIndicator";
import { useOperation } from "@/components/hooks/useOperation";
import { boundedLocalWait } from "@/lib/ui/local-lifetime";
import { formatBusinessTimestamp } from "@/lib/date-display";

import { GMAIL_INBOX_ZERO_LABELS } from "@/lib/gmail-inbox-zero/constants";
import {
  communicationStateOf,
  describeCommunicationState,
} from "@/lib/gmail-hub/communication-state";
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

type WorkflowCommunicationPanelProps = Readonly<{
  lane: WorkflowCommunicationLane;
  entityType: WorkflowCommunicationEntityType;
  entityId: string;
  purpose: WorkflowCommunicationPurpose;
  canLink: boolean;
}>;
export function WorkflowCommunicationPanel(props: WorkflowCommunicationPanelProps) {
  return (
    <OwnedWorkflowCommunicationPanel
      key={`${props.lane}:${props.entityType}:${props.entityId}:${props.purpose}`}
      {...props}
    />
  );
}
function OwnedWorkflowCommunicationPanel({
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
  const [linksRead, setLinksRead] = useState(false);
  const aiOperation = useOperation(`${entityType}:${entityId}:${purpose}`);
  const [threadId, setThreadId] = useState("");
  const [linkReason, setLinkReason] = useState("");
  const [selected, setSelected] = useState<WorkflowCommunicationLink | null>(null);
  const [thread, setThread] = useState<GmailThreadView | null>(null);
  const [label, setLabel] =
    useState<(typeof GMAIL_INBOX_ZERO_LABELS)[number]>("Waiting on Team");
  const [labelReason, setLabelReason] = useState("");
  const [analysisCategory, setAnalysisCategory] = useState("general_question");
  const [currentDraft, setCurrentDraft] = useState("");
  const currentDraftRef = useRef(currentDraft);
  useLayoutEffect(() => {
    currentDraftRef.current = currentDraft;
  }, [currentDraft]);
  const [replyBase, setReplyBase] = useState<string | null>(null);
  const [copyPending, setCopyPending] = useState(false);
  // S139: an instruction describing a change to the current draft; it never becomes reply text.
  const [instruction, setInstruction] = useState("");
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
      setLinksRead(true);
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

  /**
   * `apply` and its `restore` correction share one governed contract, so they share one caller.
   * Each is a separate one-attempt execution; repeating either returns the original evidence rather
   * than changing the thread again.
   */
  async function runLabelEffect(kind: "apply" | "restore") {
    if (!selected?.gmail_thread_id || !labelReason.trim()) return;
    setBusy(true);
    setStatus("");
    const thread = encodeURIComponent(selected.gmail_thread_id);
    try {
      const response = await fetch(
        kind === "apply"
          ? `/api/gmail-hub/threads/${thread}/labels`
          : `/api/gmail-hub/threads/${thread}/labels/restore`,
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
      if (!response.ok) throw new Error(data.error ?? labelFailureMessage(kind));
      setLabelReason("");
      setStatus(labelStatusMessage(kind, data));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : labelFailureMessage(kind));
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
    const submittedDraft = currentDraft;
    try {
      const result = await aiOperation.controller.run(
        "Refining linked reply",
        async (signal) => {
          const response = await fetch("/api/gmail-hub/workflow-reply", {
            method: "POST",
            signal,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              artifactRef: artifactRefForPurpose(purpose),
              category: analysisCategory,
              context: context("gmail.mailbox.read"),
              currentText: currentDraft,
              ...(instruction.trim() ? { instruction: instruction.trim() } : {}),
              threadId: selected.gmail_thread_id,
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "AI reply is unavailable.");
          if (
            typeof data.ok !== "boolean" ||
            !Array.isArray(data.errors) ||
            !Array.isArray(data.sources) ||
            typeof data.reviewState !== "string" ||
            (data.ok &&
              (typeof data.proposal !== "string" ||
                !data.diff ||
                !Array.isArray(data.diff.added) ||
                !Array.isArray(data.diff.removed)))
          )
            throw new Error(
              "The refinement response could not be validated. Your draft is kept.",
            );
          if (!data.ok) {
            data.proposal ??= "";
            data.diff ??= { added: [], removed: [] };
          }
          return data as WorkflowAiReply;
        },
      );
      if (result.outcome !== "succeeded") {
        setStatus(
          "Refinement did not finish. Your draft and instruction are kept; the server may still finish.",
        );
        return;
      }
      setAiReply(result.value);
      setReplyBase(submittedDraft);
      if (currentDraftRef.current !== submittedDraft)
        setStatus(
          "This revision is based on the earlier draft. Review it beside your current wording.",
        );
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
    let verifiedRefusal = false;
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
        verifiedRefusal = true;
        clearExactReply();
        throw new Error(
          data.error ??
            "Gmail did not accept the exact reply. A new preview is required.",
        );
      }
      if (data.status !== "sent" || !data.result) {
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
      if (!verifiedRefusal) {
        setSendNeedsReconciliation(true);
        setExactReplyConfirmed(false);
      }
      setStatus(
        verifiedRefusal
          ? error instanceof Error
            ? error.message
            : "The exact reply was refused."
          : "The reply outcome is unconfirmed. Recover this original attempt; do not send again.",
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
    <details
      className="ui-stack workflow-communication-panel"
      aria-busy={busy || copyPending || undefined}
    >
      <summary>Linked Gmail communication</summary>
      <p className="muted">Workflow-linked threads · Gmail holds the messages.</p>
      {busy ? (
        <BusyIndicator
          label={
            aiOperation.snapshot.phase === "pending"
              ? "Refining linked reply"
              : "Working on linked communication"
          }
        />
      ) : null}
      {aiOperation.snapshot.phase === "pending" ? (
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            aiOperation.controller.stop();
            setBusy(false);
            setStatus(
              "Stopped waiting locally. Your draft is kept; the server may still finish.",
            );
          }}
        >
          Stop waiting
        </button>
      ) : null}
      <button
        className="secondary-button"
        disabled={busy}
        onClick={() => void loadLinks()}
        type="button"
      >
        Load linked communication
      </button>

      {linksRead && links.length === 0 ? (
        <p className="muted">No Gmail thread is linked.</p>
      ) : null}
      {links.length > 0 ? (
        <ul className="compact-list">
          {links.map((link) => {
            const state = describeCommunicationState(
              communicationStateOf(link),
              formatBusinessTimestamp,
            );
            return (
              <li
                data-communication-state={
                  state.needsVerification ? "needs_verification" : link.status
                }
                key={link.id}
              >
                <button
                  className="secondary-button"
                  disabled={busy || !link.gmail_thread_id}
                  onClick={() => void openThread(link)}
                  type="button"
                >
                  Open {link.purpose.replaceAll("_", " ")} · {state.status}
                </button>
                <span className="muted"> {state.evidence}</span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {thread ? (
        <section className="ui-stack" aria-label="Linked Gmail thread detail">
          <h4>Selected thread</h4>
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
              <div className="ui-row">
                <button
                  className="secondary-button"
                  disabled={busy || !labelReason.trim()}
                  onClick={() => void runLabelEffect("apply")}
                  type="button"
                >
                  Apply approved label
                </button>
                <button
                  className="secondary-button"
                  disabled={busy || !labelReason.trim()}
                  onClick={() => void runLabelEffect("restore")}
                  type="button"
                >
                  Restore labels from before
                </button>
              </div>
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
                    Proposal only. This preview stays in the browser; workflows and
                    external systems change only when you act.
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
              <label className="field">
                <span>Refine with AI (optional)</span>
                <textarea
                  maxLength={1_000}
                  onChange={(event) => setInstruction(event.target.value)}
                  placeholder="For example: make this shorter and warmer."
                  rows={2}
                  value={instruction}
                />
                <span className="muted">
                  Describe the change you want. Your instruction is not added to the
                  reply.
                </span>
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
                  {aiReply.ok ? (
                    <>
                      <pre>{aiReply.proposal}</pre>
                      {replyBase !== currentDraft ? (
                        <p className="muted">
                          Revision from the earlier draft; your current wording is kept.
                        </p>
                      ) : null}
                      <div className="ui-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={copyPending}
                          aria-busy={copyPending || undefined}
                          onClick={async () => {
                            setCopyPending(true);
                            setStatus("Copying reply wording…");
                            try {
                              await boundedLocalWait(
                                navigator.clipboard.writeText(aiReply.proposal),
                              );
                              setStatus("Reply wording copied. Nothing was sent.");
                            } catch {
                              setStatus(
                                "Copy was not confirmed. Select the displayed wording and copy it yourself.",
                              );
                            } finally {
                              setCopyPending(false);
                            }
                          }}
                        >
                          Copy reply wording
                        </button>
                      </div>
                    </>
                  ) : null}
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
                    <>
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => {
                          // The next instruction refines this wording, and it stays editable.
                          setCurrentDraft(aiReply.proposal);
                          setAiReply(null);
                          clearExactReply();
                        }}
                        type="button"
                      >
                        Use as my draft
                      </button>
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => void prepareExactReply()}
                        type="button"
                      >
                        Review exact linked reply
                      </button>
                    </>
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
                    {formatBusinessTimestamp(exactReplyPreview.expiresAt)}
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

      {canLink ? (
        <details className="ui-stack">
          <summary>Link another existing thread</summary>
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
        </details>
      ) : (
        <p className="muted">
          Gmail linking is unavailable for this workflow. Gmail mutations remain on their
          separately gated surfaces.
        </p>
      )}

      {status ? (
        <p className="muted" role="status">
          {status}
        </p>
      ) : null}
    </details>
  );
}

/** Operator-facing outcome copy. It names what happened without restating any thread content. */
function labelStatusMessage(
  kind: "apply" | "restore",
  data: { labelName?: string; duplicate?: boolean; status?: string },
): string {
  const label = data.labelName ?? "the approved label";
  if (data.status === "needs_reconciliation") {
    return `The earlier ${label} change is still unconfirmed. Review the thread in Gmail before trying again.`;
  }
  if (data.duplicate) {
    return kind === "apply"
      ? `${label} is already applied. This shows the original result.`
      : `The earlier labels are already restored. This shows the original result.`;
  }
  return kind === "apply"
    ? `Applied ${label} after explicit human review.`
    : `Restored the labels this thread had before ${label} was applied.`;
}

function labelFailureMessage(kind: "apply" | "restore"): string {
  return kind === "apply"
    ? "The approved label was not applied."
    : "The earlier labels were not restored.";
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
