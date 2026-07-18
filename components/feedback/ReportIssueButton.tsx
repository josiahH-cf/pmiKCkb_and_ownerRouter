"use client";

// Global "Report an issue" affordance (TIX-1/2/5/9). A persistent bottom-right button on every
// signed-in page opens a lightweight dialog that auto-captures the page context (route + viewport +
// the IDENTITY of the last control the user interacted with) and an OPTIONAL free-text description,
// then POSTs an AI-ready report to /api/report-issue. Zero required fields, so one click still
// submits a context-rich report. The transactional email send is owner-configured (TIX-6).
//
// PRIVACY (TIX-8): the element hint is stable identity attributes ONLY (tag/role/type/id/data-testid).
// aria-label and textContent are deliberately NOT captured — in this app they embed customer/staff
// data (emails, ticket summaries, tenant names/addresses), so emitting them would leak PII. The route
// is captured as the pathname only (no query string), for the same reason.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Field } from "@/components/ui";

type ElementHint = {
  tag: string;
  role?: string;
  type?: string;
  id?: string;
  testId?: string;
};
type SubmitStatus = "idle" | "sending" | "sent" | "error";

// Identity ONLY — never aria-label or textContent (both carry rendered app data in this codebase).
function describeElement(node: EventTarget | null): ElementHint | undefined {
  if (!(node instanceof HTMLElement)) return undefined;
  return {
    tag: node.tagName.toLowerCase(),
    role: node.getAttribute("role") ?? undefined,
    type: node.getAttribute("type") ?? undefined,
    id: node.id || undefined,
    testId: node.getAttribute("data-testid") ?? undefined,
  };
}

export function ReportIssueButton() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [message, setMessage] = useState("");
  const lastElementRef = useRef<ElementHint | undefined>(undefined);
  const openRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setDescription("");
    triggerRef.current?.focus();
  }, []);

  // Remember the last control the user meaningfully interacted with, app-wide. Never tracks while the
  // dialog is open (so a backdrop/dialog click can't make the report describe the widget itself), and
  // ignores the trigger itself (the click that opens the dialog).
  useEffect(() => {
    function remember(event: Event) {
      if (openRef.current) return;
      const target = event.target;
      if (target instanceof Node && triggerRef.current?.contains(target)) return;
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

  // On open: move focus into the dialog (textarea) and let Escape close it. On send: move focus to the
  // Close button so keyboard users are never stranded.
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLElement>("textarea, button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (status === "sent") {
      dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    }
  }, [status]);

  // Trap Tab within the dialog while it is open (aria-modal contract).
  function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button, textarea, input, select, a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute("disabled"));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function submit() {
    setStatus("sending");
    setMessage("");
    const context = {
      route: window.location.pathname,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      userAgent: navigator.userAgent.slice(0, 400),
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
            onKeyDown={trapFocus}
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
