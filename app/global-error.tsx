"use client";

// Root error boundary (F-SUPP-4). It replaces the ordinary layout, so its palette and controls are
// deliberately self-contained. It follows the device scheme but never reads or writes preference
// storage; the ordinary theme controller may be unavailable precisely when this renders.

import { useState } from "react";

type ReportStatus = "idle" | "sending" | "sent" | "failed";

export default function GlobalError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const [status, setStatus] = useState<ReportStatus>("idle");

  async function report() {
    setStatus("sending");
    try {
      const response = await fetch("/api/report-issue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          origin: "error_boundary",
          errorDigest: error.digest,
          context: {
            route: window.location.pathname,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            userAgent: navigator.userAgent.slice(0, 400),
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        delivered?: boolean;
      };
      setStatus(response.ok && payload.delivered ? "sent" : "failed");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <html lang="en">
      <head>
        <style>{GLOBAL_ERROR_CSS}</style>
      </head>
      <body className="global-error-body">
        <main className="global-error-card">
          <h1>The app hit an error</h1>
          <p>
            Something went wrong while loading the app. You can try again, or file a
            report so the team can look into it.
          </p>
          {error.digest ? (
            <p className="global-error-reference">Error reference: {error.digest}</p>
          ) : null}
          <div className="global-error-actions">
            <button
              className="global-error-primary"
              onClick={() => reset()}
              type="button"
            >
              Try again
            </button>
            <button
              className="global-error-secondary"
              disabled={status === "sending" || status === "sent"}
              onClick={() => void report()}
              type="button"
            >
              {status === "sent" ? "Report filed" : "Report this problem"}
            </button>
          </div>
          {status === "sent" ? (
            <p className="global-error-reference" role="status">
              Thanks. Your report was filed to the support queue for review.
            </p>
          ) : null}
          {status === "failed" ? (
            <p className="global-error-failure" role="alert">
              We could not file the report automatically. Please try again, or let the
              team know directly.
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}

const GLOBAL_ERROR_CSS = `
  :root {
    color-scheme: light;
    --error-canvas: #f5f5f4;
    --error-surface: #ffffff;
    --error-text: #171717;
    --error-muted: #475569;
    --error-border: #64748b;
    --error-action: #c2410c;
    --error-action-hover: #9a3412;
    --error-on-action: #ffffff;
    --error-danger: #9f1239;
    --error-disabled: #e2e8f0;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --error-canvas: #09090b;
      --error-surface: #18181b;
      --error-text: #f8fafc;
      --error-muted: #cbd5e1;
      --error-border: #a1a1aa;
      --error-action: #fb923c;
      --error-action-hover: #fdba74;
      --error-on-action: #171717;
      --error-danger: #fda4af;
      --error-disabled: #27272a;
    }
  }
  * { box-sizing: border-box; }
  .global-error-body {
    align-items: center;
    background: var(--error-canvas);
    color: var(--error-text);
    display: flex;
    font-family: system-ui, sans-serif;
    justify-content: center;
    margin: 0;
    min-height: 100vh;
  }
  .global-error-card {
    background: var(--error-surface);
    border: 1px solid var(--error-border);
    border-radius: 0.75rem;
    margin: 1rem;
    max-width: 32rem;
    padding: 2rem;
  }
  .global-error-card h1 { font-size: 1.25rem; margin-top: 0; }
  .global-error-card p { color: var(--error-muted); }
  .global-error-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem; }
  .global-error-actions button {
    border-radius: 0.5rem;
    cursor: pointer;
    font: inherit;
    min-height: 44px;
    padding: 0.5rem 1rem;
  }
  .global-error-primary {
    background: var(--error-action);
    border: 1px solid var(--error-action);
    color: var(--error-on-action);
  }
  .global-error-primary:hover { background: var(--error-action-hover); }
  .global-error-secondary {
    background: var(--error-surface);
    border: 1px solid var(--error-border);
    color: var(--error-text);
  }
  .global-error-secondary:disabled {
    background: var(--error-disabled);
    color: var(--error-muted);
    cursor: not-allowed;
  }
  .global-error-failure { color: var(--error-danger) !important; }
  .global-error-reference { margin-top: 1rem; }
  :focus-visible { outline: 3px solid var(--error-action); outline-offset: 2px; }
  @media (forced-colors: active) {
    .global-error-card, .global-error-actions button { border-color: ButtonBorder; }
    :focus-visible { outline-color: Highlight; }
  }
`;
