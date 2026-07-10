"use client";

import { useState } from "react";

interface SummaryResponse {
  ok: boolean;
  usedModel: boolean;
  summary: string;
  waiting_on: string;
  suggested_next_action: string;
  errors: string[];
  error?: string;
}

/**
 * Thread-summary panel. The operator pastes sanitized thread text; the route summarizes it through the
 * model seam into summary / waiting-on / next-action. It reads no mailbox and has no send control.
 */
export function ThreadSummaryPanel() {
  const [threadText, setThreadText] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState("");

  async function summarize() {
    if (threadText.trim().length === 0) return;
    setPending(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/gmail-hub/thread-summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadText }),
      });
      const payload = (await response.json().catch(() => ({}))) as SummaryResponse;
      if (response.ok) {
        setResult(payload);
      } else {
        setError(payload.error ?? "Could not summarize the thread.");
      }
    } catch {
      setError("Could not summarize the thread.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="panel ui-stack">
      <h2>Thread summary</h2>
      <p className="muted">
        Paste sanitized thread text to get a summary, who it is waiting on, and a suggested next action.
        No mailbox is read and nothing here can send.
      </p>
      <label className="field">
        <span>Thread text</span>
        <textarea
          rows={5}
          value={threadText}
          onChange={(event) => setThreadText(event.target.value)}
        />
      </label>
      <button
        className="secondary-button"
        disabled={pending || threadText.trim().length === 0}
        onClick={() => void summarize()}
        type="button"
      >
        {pending ? "Summarizing…" : "Summarize thread"}
      </button>

      {error ? <p className="muted">{error}</p> : null}
      {result ? (
        result.summary ? (
          <dl className="summary-list">
            <dt>Summary</dt>
            <dd>{result.summary}</dd>
            <dt>Waiting on</dt>
            <dd>{result.waiting_on || "Unclear"}</dd>
            <dt>Suggested next action</dt>
            <dd>{result.suggested_next_action || "Unclear"}</dd>
          </dl>
        ) : (
          <p className="muted">
            {result.errors[0] ?? "No summary was produced. Try re-pasting the thread."}
          </p>
        )
      ) : null}
    </article>
  );
}
