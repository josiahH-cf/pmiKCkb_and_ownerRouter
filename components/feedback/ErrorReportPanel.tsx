"use client";

// Report affordance for the route-segment error boundary (F-SUPP-4). When a page throws, the user is
// exactly the person who most needs to report it, so this offers a one-click path to file the crash
// (route + error digest, origin "error_boundary") to the same support queue as the global button,
// plus a "Try again" that re-runs the failed render. Uses app CSS classes: the root layout still
// renders around a segment error, so the design system is present here (unlike the global boundary).

import { useState } from "react";
import { Button } from "@/components/ui";

type ReportStatus = "idle" | "sending" | "sent" | "failed";

export function ErrorReportPanel({
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
    <section className="content">
      <article className="panel">
        <h1>Something went wrong on this page</h1>
        <p className="muted">
          The page hit an unexpected error. You can try again, or file a report so the
          team can look into it.
        </p>
        {error.digest ? <p className="muted">Error reference: {error.digest}</p> : null}
        <div className="report-issue-actions">
          <Button onClick={() => reset()} type="button">
            Try again
          </Button>
          <Button
            disabled={status === "sending" || status === "sent"}
            onClick={() => void report()}
            type="button"
            variant="secondary"
          >
            {status === "sent" ? "Report filed" : "Report this problem"}
          </Button>
        </div>
        {status === "sent" ? (
          <p className="muted" role="status">
            Thanks. Your report was filed to the support queue for review.
          </p>
        ) : null}
        {status === "failed" ? (
          <p className="auth-message">
            We could not file the report automatically. Please try again, or let the team
            know directly.
          </p>
        ) : null}
      </article>
    </section>
  );
}
