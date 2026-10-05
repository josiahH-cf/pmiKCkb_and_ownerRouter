"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

import { useState } from "react";
import { useOperation } from "@/components/hooks/useOperation";
import { BusyIndicator } from "@/components/ui/BusyIndicator";

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
  const operation = useOperation("thread-summary");
  const pending = operation.snapshot.phase === "pending";
  const [result, setResult] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState("");

  async function summarize() {
    if (threadText.trim().length === 0) return;
    setError("");
    const response = await operation.controller.run(
      "Summarizing thread",
      async (signal) => {
        const response = await fetch("/api/gmail-hub/thread-summary", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadText }),
          signal,
        });
        const payload = (await response.json()) as SummaryResponse;
        if (
          !response.ok ||
          typeof payload.summary !== "string" ||
          typeof payload.waiting_on !== "string" ||
          typeof payload.suggested_next_action !== "string" ||
          !Array.isArray(payload.errors) ||
          payload.errors.some((value) => typeof value !== "string")
        )
          throw new Error("The summary response could not be validated.");
        return payload;
      },
    );
    if (response.outcome === "superseded") return;
    if (response.outcome === "succeeded") setResult(response.value);
    else
      setError(
        "Could not summarize the thread. Your text and previous summary are kept; retry when ready.",
      );
  }

  return (
    <article className="panel ui-stack" aria-busy={pending || undefined}>
      <h2>Thread summary</h2>
      <p className="muted">
        Summarizes pasted, sanitized thread text only. A person sends from Gmail.
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
      {pending ? <BusyIndicator label="Summarizing thread" /> : null}
      {result && (pending || error) ? (
        <p className="muted">Previous completed summary</p>
      ) : null}

      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
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
