"use client";

// Root error boundary (F-SUPP-4). Next renders this only when the ROOT layout itself throws, so it
// replaces the layout entirely and must define its own <html>/<body>. The app's global CSS and
// components are not guaranteed here, so this is deliberately self-contained with inline styles and
// its own minimal report call — the one place a crash can leave the user with no shell at all still
// offers a working path to file the problem to the support queue.

import { useState, type CSSProperties } from "react";

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
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f4f5f7",
          color: "#1b1b1f",
        }}
      >
        <main
          style={{
            maxWidth: "32rem",
            padding: "2rem",
            margin: "1rem",
            background: "#ffffff",
            borderRadius: "0.75rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
          }}
        >
          <h1 style={{ marginTop: 0, fontSize: "1.25rem" }}>The app hit an error</h1>
          <p style={{ color: "#55565b" }}>
            Something went wrong while loading the app. You can try again, or file a
            report so the team can look into it.
          </p>
          {error.digest ? (
            <p style={{ color: "#55565b", fontSize: "0.875rem" }}>
              Error reference: {error.digest}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              onClick={() => reset()}
              style={buttonStyle("#1b1b1f", "#ffffff")}
              type="button"
            >
              Try again
            </button>
            <button
              disabled={status === "sending" || status === "sent"}
              onClick={() => void report()}
              style={buttonStyle("#ffffff", "#1b1b1f", "#c9cbd1")}
              type="button"
            >
              {status === "sent" ? "Report filed" : "Report this problem"}
            </button>
          </div>
          {status === "sent" ? (
            <p style={{ color: "#55565b", marginTop: "1rem" }} role="status">
              Thanks. Your report was filed to the support queue for review.
            </p>
          ) : null}
          {status === "failed" ? (
            <p style={{ color: "#b3261e", marginTop: "1rem" }}>
              We could not file the report automatically. Please try again, or let the
              team know directly.
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}

function buttonStyle(
  background: string,
  color: string,
  border = background,
): CSSProperties {
  return {
    background,
    color,
    border: `1px solid ${border}`,
    borderRadius: "0.5rem",
    padding: "0.5rem 1rem",
    fontSize: "0.9375rem",
    cursor: "pointer",
  };
}
