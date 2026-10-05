"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

import { useState } from "react";

import { RefineWithAi } from "@/components/email/RefineWithAi";
import { Button, Card, Field } from "@/components/ui";
import { GEMINI_IN_GMAIL_HINT } from "@/lib/email-refinement/hint";

// Compose an UNSENT maintenance owner-notice Gmail draft for one persisted ticket: Preview, review
// and optionally edit or refine the wording, then Create. The recipient (property owner) and the
// property facts come from the LIVE RentVine record (server-side, never from this control). The
// control can never send: the gated draft route returns an unsent draft, and a human sends it in
// Gmail. Create confirms the exact prepared execution and preview hash the person reviewed; the
// wording stays in this page until the draft exists, and a blocked result lists the exact reasons.

interface Recipient {
  to: string;
  sourceRef?: string;
}
type Outcome =
  | { status: "blocked"; reasons: string[] }
  | {
      status: "preview";
      recipient: Recipient;
      subject: string;
      body: string;
      editableBody: string;
      standardBody: string;
      earlierDraftExists: boolean;
      executionId: string;
      previewHash: string;
    }
  | {
      status: "created";
      recipient: Recipient;
      subject: string;
      draftId: string;
      executionId: string;
    }
  | { status: "needs_reconciliation"; executionId: string; reason: string };

export function MaintenanceOwnerNoticeDraftComposer({
  ticketRef,
}: Readonly<{ ticketRef: string }>) {
  const [pending, setPending] = useState<null | "preview" | "create">(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState("");
  // S139: the wording being reviewed. Null until the first preview supplies the standard body.
  const [body, setBody] = useState<string | null>(null);
  const [previewedBody, setPreviewedBody] = useState<string | null>(null);
  const [previousBody, setPreviousBody] = useState<string | null>(null);

  async function submit(kind: "preview" | "create") {
    setPending(kind);
    setError("");
    const confirm =
      kind === "create" && outcome?.status === "preview"
        ? { executionId: outcome.executionId, previewHash: outcome.previewHash }
        : undefined;
    const sentBody = body;
    try {
      const response = await fetch("/api/maintenance/owner-notice-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticketRef,
          ...(sentBody !== null ? { body: sentBody } : {}),
          ...(confirm ? { confirm } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as Outcome & {
        error?: string;
      };
      if (!response.ok) {
        setError(
          payload.error ?? "Could not compose the draft. Your wording is unchanged.",
        );
        return;
      }
      setOutcome(payload);
      if (payload.status === "preview") {
        setBody(payload.editableBody);
        setPreviewedBody(payload.editableBody);
      }
    } catch {
      setError("Could not reach the draft service. Your wording is unchanged.");
    } finally {
      setPending(null);
    }
  }

  function edit(next: string, remember = false) {
    if (remember) setPreviousBody(body);
    setBody(next);
  }

  // Create confirms exactly the previewed wording; any later edit needs a fresh preview first.
  const previewCurrent =
    outcome?.status === "preview" &&
    body !== null &&
    body.trim() === previewedBody?.trim();
  const created = outcome?.status === "created";

  return (
    <Card>
      <div className="ui-stack">
        <div>
          <h3 className="section-title">Owner notice: draft</h3>
          <p className="muted">
            Composes an unsent Gmail draft to this property’s owner from the live RentVine
            record. The owner recipient comes from RentVine; you review and send it
            yourself in Gmail.
          </p>
        </div>

        <div className="ui-row">
          <Button
            disabled={pending !== null}
            onClick={() => void submit("preview")}
            type="button"
          >
            {pending === "preview"
              ? "Previewing…"
              : body === null
                ? "Preview draft"
                : "Preview this wording"}
          </Button>
          <Button
            disabled={!previewCurrent || pending !== null || created}
            onClick={() => void submit("create")}
            type="button"
            variant="secondary"
          >
            {pending === "create" ? "Creating…" : "Create Gmail draft"}
          </Button>
        </div>

        {error ? (
          <p className="muted" role="status">
            {error}
          </p>
        ) : null}

        {outcome?.status === "blocked" ? (
          <div className="ui-stack">
            <p className="muted">This draft is not ready:</p>
            <ul>
              {outcome.reasons.map((reason) => (
                <li className="muted" key={reason}>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {body !== null && !created ? (
          <div className="ui-stack">
            {outcome?.status === "preview" ? (
              <p className="muted">
                To: {outcome.recipient.to} · Subject: {outcome.subject}
              </p>
            ) : null}
            <Field
              htmlFor={`owner-notice-body-${ticketRef}`}
              label="Email wording"
              hint="Edit it here or refine it with AI below. The review banner is added to the draft; the recipient and subject stay as shown."
            >
              <textarea
                id={`owner-notice-body-${ticketRef}`}
                onChange={(event) => edit(event.target.value)}
                rows={10}
                value={body}
              />
            </Field>
            <div className="ui-actions">
              {previousBody !== null ? (
                <Button
                  onClick={() => {
                    setBody(previousBody);
                    setPreviousBody(null);
                  }}
                  type="button"
                  variant="secondary"
                >
                  Undo the last refinement
                </Button>
              ) : null}
              {outcome?.status === "preview" && body !== outcome.standardBody ? (
                <Button
                  onClick={() => edit(outcome.standardBody, true)}
                  type="button"
                  variant="secondary"
                >
                  Return to the standard wording
                </Button>
              ) : null}
            </div>
            <RefineWithAi
              appliedNotice="Revision applied. Preview this wording before creating the draft."
              currentBody={body}
              disabledReason={null}
              onApply={(revision) => edit(revision.body, true)}
              request={{ surface: "maintenance_owner_notice", ticketRef }}
            />
            {outcome?.status === "preview" && !previewCurrent ? (
              <p className="muted">
                The wording changed after the preview. Preview this wording before
                creating the draft.
              </p>
            ) : null}
            {outcome?.status === "preview" &&
            previewCurrent &&
            outcome.earlierDraftExists ? (
              <p role="note">
                An unsent draft from different wording already exists for this ticket.
                Creating this one adds a second, separate draft; the app cannot replace
                the earlier one, so delete it in Gmail and send only one.
              </p>
            ) : null}
          </div>
        ) : null}

        {outcome?.status === "needs_reconciliation" ? (
          <p className="muted" role="status">
            {outcome.reason}
          </p>
        ) : null}

        {outcome?.status === "created" ? (
          <div className="ui-stack-tight">
            <p className="muted">
              Unsent Gmail draft created. Open Gmail to review and send it to{" "}
              {outcome.recipient.to} yourself.
            </p>
            <p className="muted">{GEMINI_IN_GMAIL_HINT}</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
