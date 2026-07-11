"use client";

import { useState } from "react";

// Structural twin of PrepareOwnerEmailButton. It POSTs the lease id to the tenant-notice-draft route,
// which returns the addressed UNSENT draft (verbatim DRAFT_BANNER). The control can never send — a
// human presses Send in Gmail once the access model is approved. It exposes only Prepare + Copy.
interface DraftRequest {
  to: string;
  subject: string;
  body: string;
  missingInputs: string[];
}

interface DraftResponse {
  enabled: boolean;
  status: string;
  reason?: string;
  draftId?: string;
  request: DraftRequest;
  error?: string;
}

export function PrepareTenantEmailButton({ leaseId }: Readonly<{ leaseId: string }>) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DraftResponse | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function prepare() {
    setPending(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch("/api/lease-renewal/tenant-notice-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leaseId }),
      });
      const payload = (await response.json().catch(() => ({}))) as DraftResponse;
      if (response.ok) {
        setResult(payload);
      } else {
        setError(payload.error ?? "Could not prepare the draft.");
      }
    } catch {
      setError("Could not prepare the draft.");
    } finally {
      setPending(false);
    }
  }

  async function copyDraft(request: DraftRequest) {
    const text = `To: ${request.to}\nSubject: ${request.subject}\n\n${request.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="ui-stack">
      <button
        className="secondary-button"
        disabled={pending}
        onClick={() => void prepare()}
        type="button"
      >
        {pending ? "Preparing…" : "Prepare tenant email"}
      </button>
      {error ? <p className="muted">{error}</p> : null}
      {result ? (
        <div className="ui-stack">
          <p className="muted">
            {result.enabled
              ? "Unsent Gmail draft created. Open Gmail to review and send it yourself."
              : (result.reason ?? "Needs Gmail access.")}
          </p>
          <p className="muted">
            To: {result.request.to} · Subject: {result.request.subject}
          </p>
          <div className="draft-box">{result.request.body}</div>
          <button
            className="secondary-button"
            onClick={() => void copyDraft(result.request)}
            type="button"
          >
            {copied ? "Copied" : "Copy draft"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
