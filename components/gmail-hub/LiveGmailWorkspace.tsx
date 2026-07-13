"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import type {
  GmailOutgoingMessage,
  GmailThreadListItem,
  GmailThreadView,
} from "@/lib/gmail-runtime/types";
import { WAITING_ON_GMAIL } from "@/lib/notifications/families";

interface LiveGmailWorkspaceProps {
  authenticatedEmail: string;
  canCompose: boolean;
  canSend: boolean;
  canLabel?: boolean;
}

interface ConfirmationPreview {
  confirmationToken: string;
  expiresAt: string;
  payload: GmailOutgoingMessage;
}

export function LiveGmailWorkspace({
  authenticatedEmail,
  canCompose,
  canSend,
  canLabel = false,
}: LiveGmailWorkspaceProps) {
  const hasAuthenticatedMailbox = /^[^@\s]+@[^@\s]+$/.test(authenticatedEmail);
  const [connection, setConnection] = useState<
    "checking" | "gated" | "connected" | "degraded"
  >(hasAuthenticatedMailbox ? "checking" : "gated");
  const [connectionMessage, setConnectionMessage] = useState(WAITING_ON_GMAIL);
  const [connectedEmail, setConnectedEmail] = useState(authenticatedEmail);
  const [syncMessage, setSyncMessage] = useState("Manual refresh only");
  const [threads, setThreads] = useState<GmailThreadListItem[]>([]);
  const [selectedThread, setSelectedThread] = useState<GmailThreadView | null>(null);
  const [threadError, setThreadError] = useState("");
  const [mode, setMode] = useState<"new" | "reply">("new");
  const [to, setTo] = useState(authenticatedEmail);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [label, setLabel] = useState("PMI KC/Handled");
  const [preview, setPreview] = useState<ConfirmationPreview | null>(null);
  const [result, setResult] = useState("");
  const [ambiguous, setAmbiguous] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadRecentThreads = useCallback(async () => {
    const listResponse = await fetch("/api/gmail-hub/threads");
    const list = await listResponse.json();
    if (!listResponse.ok) {
      throw new Error(list.error ?? "Recent Gmail threads could not be loaded.");
    }
    return (list.threads ?? []) as GmailThreadListItem[];
  }, []);

  useEffect(() => {
    if (!hasAuthenticatedMailbox) return;
    let active = true;
    void fetch("/api/gmail-hub/connection")
      .then(async (response) => ({ response, data: await response.json() }))
      .then(async ({ response, data }) => {
        if (!active) return;
        if (response.ok && data.status === "connected") {
          setConnection("connected");
          setConnectionMessage(`Connected as ${data.mailboxEmail}`);
          setConnectedEmail(data.mailboxEmail);
          setSyncMessage(
            data.sync?.health === "watching" && data.sync?.lastSuccessfulSyncMs
              ? `Push sync healthy; last processed ${new Date(data.sync.lastSuccessfulSyncMs).toLocaleString()}`
              : "On-demand refresh is active; push watch is not yet healthy.",
          );
          try {
            const recentThreads = await loadRecentThreads();
            if (active) setThreads(recentThreads);
          } catch {
            if (!active) return;
            setConnection("degraded");
            setConnectionMessage(
              "Gmail connected, but recent threads could not be loaded.",
            );
          }
          return;
        }
        setConnection(
          response.status === 503 || data.status === "gated" ? "gated" : "degraded",
        );
        setConnectionMessage(data.reason ?? data.error ?? WAITING_ON_GMAIL);
      })
      .catch(() => {
        if (active) {
          setConnection("degraded");
          setConnectionMessage("Gmail connection health could not be checked.");
        }
      });
    return () => {
      active = false;
    };
  }, [hasAuthenticatedMailbox, loadRecentThreads]);

  async function openThread(threadId: string) {
    setThreadError("");
    const response = await fetch(
      `/api/gmail-hub/threads/${encodeURIComponent(threadId)}`,
    );
    const data = await response.json();
    if (!response.ok) {
      setThreadError(data.error ?? "The Gmail thread could not be loaded.");
      return;
    }
    setSelectedThread(data);
    setPreview(null);
    setResult("");
  }

  async function refreshThreads() {
    setThreadError("");
    try {
      setThreads(await loadRecentThreads());
      setSyncMessage(`Inbox refreshed ${new Date().toLocaleTimeString()}.`);
    } catch (error) {
      setThreadError(
        error instanceof Error
          ? error.message
          : "Recent Gmail threads could not be loaded.",
      );
    }
  }

  async function startPushWatch() {
    if (!liveEnabled || busy) return;
    setBusy(true);
    setThreadError("");
    try {
      const response = await fetch("/api/gmail-hub/watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) {
        setThreadError(data.error ?? "The Gmail push watch could not be started.");
        return;
      }
      const expirationMs = Number(data.expiration);
      setSyncMessage(
        Number.isFinite(expirationMs)
          ? `Push watch active until ${new Date(expirationMs).toLocaleString()}.`
          : "Push watch active.",
      );
    } catch {
      setThreadError("The Gmail push watch could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function applyLabel() {
    if (!selectedThread || !canLabel || busy) return;
    setBusy(true);
    setThreadError("");
    try {
      const response = await fetch(
        `/api/gmail-hub/threads/${encodeURIComponent(selectedThread.id)}/labels`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ label }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setThreadError(data.error ?? "The Gmail label could not be applied.");
        return;
      }
      setResult(`Applied Gmail label ${data.labelName}.`);
    } catch {
      setThreadError("The Gmail label could not be applied.");
    } finally {
      setBusy(false);
    }
  }

  function startReply() {
    if (!selectedThread) return;
    setMode("reply");
    setSubject(selectedThread.messages.at(-1)?.subject ?? "");
    setPreview(null);
    setResult("");
  }

  async function reviewMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend || !body.trim()) return;
    setBusy(true);
    setResult("");
    setPreview(null);
    const input =
      mode === "reply" && selectedThread
        ? { kind: "reply", threadId: selectedThread.id, body }
        : {
            kind: "new",
            to: parseRecipientList(to),
            cc: parseRecipientList(cc),
            bcc: parseRecipientList(bcc),
            subject,
            body,
          };
    try {
      const response = await fetch("/api/gmail-hub/send-confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) {
        setResult(data.error ?? "The exact message could not be prepared for review.");
        return;
      }
      setPreview(data);
    } catch {
      setResult("The exact message could not be prepared for review.");
    } finally {
      setBusy(false);
    }
  }

  async function createDraft() {
    if (!canCompose || !body.trim()) return;
    setBusy(true);
    setResult("");
    const input =
      mode === "reply" && selectedThread
        ? { kind: "reply", threadId: selectedThread.id, body }
        : {
            kind: "new",
            to: parseRecipientList(to),
            cc: parseRecipientList(cc),
            bcc: parseRecipientList(bcc),
            subject,
            body,
          };
    try {
      const response = await fetch("/api/gmail-hub/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      setResult(
        response.ok
          ? `Unsent Gmail draft created (${data.draftId}).`
          : (data.error ?? "The unsent Gmail draft could not be created."),
      );
    } catch {
      setResult("The unsent Gmail draft could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function sendConfirmed() {
    if (!preview || busy) return;
    setBusy(true);
    setResult("");
    try {
      const response = await fetch("/api/gmail-hub/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmationToken: preview.confirmationToken,
          payload: preview.payload,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setAmbiguous(data.status === "ambiguous");
        setResult(data.error ?? "Gmail did not confirm delivery.");
        return;
      }
      setAmbiguous(false);
      setResult(
        `Sent once. Gmail message ${data.result.messageId} is in thread ${data.result.threadId}.`,
      );
    } catch {
      setAmbiguous(true);
      setResult("The send result is unclear. Reconcile before trying anything else.");
    } finally {
      setBusy(false);
    }
  }

  async function reconcile() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/gmail-hub/send/reconcile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmationToken: preview.confirmationToken }),
      });
      const data = await response.json();
      if (response.ok && data.status === "sent") {
        setAmbiguous(false);
        setResult(
          `Delivery reconciled. Gmail message ${data.result.messageId} is in thread ${data.result.threadId}.`,
        );
      } else {
        setResult(data.reason ?? data.error ?? "No matching sent message was found.");
      }
    } catch {
      setResult("Delivery reconciliation could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  const liveEnabled = connection === "connected";
  return (
    <article className="panel ui-stack live-gmail-workspace">
      <div className="ui-spread">
        <div>
          <h2>Live Gmail</h2>
          <p className="muted">
            Your signed-in mailbox only. Mail is never sent without your exact-message
            confirmation.
          </p>
        </div>
        <span
          className="queue-pill"
          data-value={liveEnabled ? "Available" : "Action Required"}
        >
          {connection === "checking" ? "Checking connection" : connectionMessage}
        </span>
      </div>

      <div className="gmail-live-identity">
        <span className="muted">Authenticated mailbox</span>
        <strong>{connectedEmail}</strong>
        <span className="muted">{syncMessage}</span>
        {liveEnabled ? (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void startPushWatch()}
            type="button"
          >
            Start or renew push watch
          </button>
        ) : null}
      </div>

      {!liveEnabled ? (
        <div className="notice notice-warning" role="status">
          <strong>
            {connection === "degraded" ? "Gmail is degraded" : WAITING_ON_GMAIL}
          </strong>
          <p>{connectionMessage}</p>
        </div>
      ) : (
        <div className="gmail-live-grid">
          <section className="ui-stack" aria-label="Recent Gmail threads">
            <div className="ui-spread">
              <h3>Recent inbox threads</h3>
              <button
                className="secondary-button"
                onClick={() => void refreshThreads()}
                type="button"
              >
                Refresh inbox
              </button>
            </div>
            {threads.length === 0 ? (
              <p className="muted">
                No threads were returned by the bounded inbox query.
              </p>
            ) : (
              <ul className="compact-list gmail-thread-list">
                {threads.map((thread) => (
                  <li key={thread.id}>
                    <button
                      className="secondary-button gmail-thread-button"
                      onClick={() => void openThread(thread.id)}
                      type="button"
                    >
                      {thread.snippet || `Thread ${thread.id}`}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {threadError ? <p className="error-text">{threadError}</p> : null}
          </section>

          <section className="ui-stack" aria-label="Selected Gmail thread">
            <h3>Thread detail</h3>
            {!selectedThread ? (
              <p className="muted">
                Choose a recent thread to read its bounded text view.
              </p>
            ) : (
              <>
                <ol className="gmail-message-list">
                  {selectedThread.messages.map((message) => (
                    <li key={message.id}>
                      <strong>{message.from || "Unknown sender"}</strong>
                      <span className="muted">{message.subject || "No subject"}</span>
                      <p>{message.bodyText || "No inline text body."}</p>
                    </li>
                  ))}
                </ol>
                <button
                  className="secondary-button"
                  disabled={!canSend}
                  onClick={startReply}
                  type="button"
                >
                  Reply to this thread
                </button>
                <div className="simulated-thread-actions">
                  <label className="field">
                    <span>Apply Gmail label</span>
                    <input
                      disabled={!canLabel || busy}
                      maxLength={225}
                      onChange={(event) => setLabel(event.target.value)}
                      value={label}
                    />
                  </label>
                  <button
                    className="secondary-button"
                    disabled={!canLabel || !label.trim() || busy}
                    onClick={() => void applyLabel()}
                    type="button"
                  >
                    Apply label
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <form className="ui-stack" onSubmit={reviewMessage}>
        <div className="ui-spread">
          <h3>{mode === "reply" ? "Reply editor" : "Compose message"}</h3>
          {mode === "reply" ? (
            <button
              className="text-link"
              onClick={() => {
                setMode("new");
                setSubject("");
                setPreview(null);
              }}
              type="button"
            >
              Start a new message
            </button>
          ) : null}
        </div>
        <dl className="gmail-exact-addresses">
          <div>
            <dt>From</dt>
            <dd>{authenticatedEmail}</dd>
          </div>
          <div>
            <dt>To</dt>
            <dd>{mode === "reply" ? "Resolved from the selected thread" : to}</dd>
          </div>
          <div>
            <dt>Cc / Bcc</dt>
            <dd>None</dd>
          </div>
        </dl>
        {mode === "new" ? (
          <>
            <label className="field">
              <span>To</span>
              <input
                maxLength={2_540}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPreview(null);
                }}
                placeholder="name@example.com, teammate@example.com"
                required
                value={to}
              />
            </label>
            <label className="field">
              <span>Cc (optional)</span>
              <input
                maxLength={2_540}
                onChange={(event) => {
                  setCc(event.target.value);
                  setPreview(null);
                }}
                value={cc}
              />
            </label>
            <label className="field">
              <span>Bcc (optional)</span>
              <input
                maxLength={2_540}
                onChange={(event) => {
                  setBcc(event.target.value);
                  setPreview(null);
                }}
                value={bcc}
              />
            </label>
          </>
        ) : null}
        <label className="field">
          <span>Subject</span>
          <input
            disabled={mode === "reply"}
            maxLength={998}
            onChange={(event) => {
              setSubject(event.target.value);
              setPreview(null);
            }}
            required
            value={subject}
          />
        </label>
        <label className="field">
          <span>Message</span>
          <textarea
            maxLength={50_000}
            onChange={(event) => {
              setBody(event.target.value);
              setPreview(null);
            }}
            required
            rows={6}
            value={body}
          />
        </label>
        <div className="simulated-thread-actions">
          <button
            className="secondary-button"
            disabled={!liveEnabled || !canCompose || !body.trim() || busy}
            onClick={() => void createDraft()}
            type="button"
          >
            Create unsent draft
          </button>
          <button
            className="primary-button"
            disabled={
              !liveEnabled ||
              !canSend ||
              !body.trim() ||
              (mode === "new" && !subject.trim()) ||
              (mode === "new" && parseRecipientList(to).length === 0) ||
              busy
            }
            type="submit"
          >
            Review exact message
          </button>
        </div>
      </form>

      {preview ? (
        <section
          className="notice gmail-send-preview"
          aria-label="Exact Gmail send preview"
        >
          <h3>Exact message confirmation</h3>
          <p className="muted">Confirmation expires {preview.expiresAt}.</p>
          <dl className="gmail-exact-addresses">
            <div>
              <dt>From</dt>
              <dd>{preview.payload.from}</dd>
            </div>
            <div>
              <dt>To</dt>
              <dd>{preview.payload.to.join(", ")}</dd>
            </div>
            <div>
              <dt>Cc</dt>
              <dd>{preview.payload.cc.join(", ") || "None"}</dd>
            </div>
            <div>
              <dt>Bcc</dt>
              <dd>{preview.payload.bcc.join(", ") || "None"}</dd>
            </div>
            <div>
              <dt>Subject</dt>
              <dd>{preview.payload.subject}</dd>
            </div>
            <div>
              <dt>Thread</dt>
              <dd>{preview.payload.threadId ?? "New thread"}</dd>
            </div>
          </dl>
          <pre className="draft-preview">{preview.payload.body}</pre>
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => void sendConfirmed()}
            type="button"
          >
            Send this exact message
          </button>
          {ambiguous ? (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void reconcile()}
              type="button"
            >
              Reconcile delivery by Message-ID
            </button>
          ) : null}
        </section>
      ) : null}
      <p aria-live="polite" className="muted">
        {result}
      </p>
    </article>
  );
}

function parseRecipientList(value: string): string[] {
  return value
    .split(/[;,]/)
    .map((recipient) => recipient.trim().toLowerCase())
    .filter(Boolean);
}
