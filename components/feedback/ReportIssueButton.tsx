"use client";

// Global "Report an issue" affordance (TIX-1/2/5/9). A persistent bottom-right button on every
// signed-in page opens a lightweight dialog that auto-captures the page context (route, viewport,
// and the last element the user interacted with — identity only, never input values) and an OPTIONAL
// free-text description, then POSTs an AI-ready report to /api/report-issue. Zero required fields, so
// one click still submits a context-rich report. The transactional email send is owner-configured
// (TIX-6); this component only assembles + submits the report.

import { useEffect, useRef, useState } from "react";
import { Button, Field } from "@/components/ui";

type ElementHint = { tag: string; role?: string; name?: string; testId?: string };
type SubmitStatus = "idle" | "sending" | "sent" | "error";

// Identity of a DOM element for the "which button?" inference — NEVER the value of an input.
function describeElement(node: EventTarget | null): ElementHint | undefined {
  if (!(node instanceof HTMLElement)) return undefined;
  const ariaLabel = node.getAttribute("aria-label") ?? undefined;
  const text = (node.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  return {
    tag: node.tagName.toLowerCase(),
    role: node.getAttribute("role") ?? undefined,
    name: ariaLabel ?? (text || undefined),
    testId: node.getAttribute("data-testid") ?? undefined,
  };
}

export function ReportIssueButton() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [message, setMessage] = useState("");
  const lastElementRef = useRef<ElementHint | undefined>(undefined);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Remember the last element the user meaningfully interacted with, app-wide. Interactions with the
  // report widget itself are ignored so it never reports on its own controls.
  useEffect(() => {
    function remember(event: Event) {
      const target = event.target;
      if (target instanceof Node) {
        if (dialogRef.current?.contains(target) || triggerRef.current?.contains(target)) {
          return;
        }
      }
      const hint = describeElement(event.target);
      if (hint) lastElementRef.current = hint;
    }
    document.addEventListener("pointerdown", remember, true);
    document.addEventListener("focusin", remember, true);
    return () => {
      document.removeEventListener("pointerdown", remember, true);
      document.removeEventListener("focusin", remember, true);
    };
  }, []);

  // Escape closes the dialog and restores focus to the trigger.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    setDescription("");
    triggerRef.current?.focus();
  }

  async function submit() {
    setStatus("sending");
    setMessage("");
    const context = {
      route: window.location.pathname + window.location.search,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      userAgent: navigator.userAgent,
      element: lastElementRef.current,
    };
    try {
      const response = await fetch("/api/report-issue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: description.trim() || undefined,
          context,
        }),
      });
      if (response.ok) {
        setStatus("sent");
        setMessage("Thanks. Your report was captured with the page details.");
      } else {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setStatus("error");
        setMessage(payload.error ?? "Could not send the report. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Please try again.");
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        aria-haspopup="dialog"
        className="report-issue-trigger"
        onClick={() => {
          setStatus("idle");
          setMessage("");
          setOpen(true);
        }}
        type="button"
      >
        Report an issue
      </button>

      {open ? (
        <div
          className="ui-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            ref={dialogRef}
            aria-labelledby="report-issue-title"
            aria-modal="true"
            className="panel report-issue-dialog"
            role="dialog"
          >
            <h2 id="report-issue-title">Report an issue</h2>

            {status === "sent" ? (
              <>
                <p className="muted">{message}</p>
                <Button onClick={close} type="button">
                  Close
                </Button>
              </>
            ) : (
              <>
                <p className="muted">
                  Be as descriptive as possible so we can help the best way. We include
                  the page you are on automatically, so you do not have to.
                </p>
                <Field
                  hint="Optional. For example: the Save button on this page does nothing when I click it."
                  htmlFor="report-issue-description"
                  label="What went wrong?"
                >
                  <textarea
                    id="report-issue-description"
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Describe what you expected and what happened."
                    rows={4}
                    value={description}
                  />
                </Field>
                {status === "error" ? <p className="auth-message">{message}</p> : null}
                <div className="report-issue-actions">
                  <Button
                    disabled={status === "sending"}
                    onClick={() => void submit()}
                    type="button"
                  >
                    {status === "sending" ? "Sending" : "Send report"}
                  </Button>
                  <Button onClick={close} type="button" variant="secondary">
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
