"use client";

import { useState } from "react";

import { Button, Card } from "@/components/ui";

// Compose an UNSENT maintenance owner-notice Gmail draft for one persisted ticket, in two steps: Preview,
// then Create. The recipient (property owner) and the property facts come from the LIVE RentVine record
// (server-side, never from this control); the body is composed from the ticket. The control can never send:
// it posts to the gated draft route, which returns an unsent draft id, and a human presses Send in Gmail. A
// blocked result lists the exact reasons (unverified owner, unmatched unit) and never invents a recipient.

interface Recipient {
  to: string;
  sourceRef?: string;
}
type Outcome =
  | { status: "blocked"; reasons: string[] }
  | { status: "preview"; recipient: Recipient; subject: string; body: string }
  | { status: "created"; recipient: Recipient; subject: string; draftId: string };

export function MaintenanceOwnerNoticeDraftComposer({
  ticketRef,
}: Readonly<{ ticketRef: string }>) {
  const [pending, setPending] = useState<null | "preview" | "create">(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState("");

  async function submit(confirm: boolean) {
    setPending(confirm ? "create" : "preview");
    setError("");
    if (!confirm) setOutcome(null);
    try {
      const response = await fetch("/api/maintenance/owner-notice-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketRef, confirm }),
      });
      const payload = (await response.json().catch(() => ({}))) as Outcome & {
        error?: string;
      };
      if (response.ok) {
        setOutcome(payload);
      } else {
        setError(payload.error ?? "Could not compose the draft.");
      }
    } catch {
      setError("Could not reach the draft service.");
    } finally {
      setPending(null);
    }
  }

  const canCreate = outcome?.status === "preview";

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
            onClick={() => void submit(false)}
            type="button"
          >
            {pending === "preview" ? "Previewing…" : "Preview draft"}
          </Button>
          <Button
            disabled={!canCreate || pending !== null}
            onClick={() => void submit(true)}
            type="button"
            variant="secondary"
          >
            {pending === "create" ? "Creating…" : "Create Gmail draft"}
          </Button>
        </div>

        {error ? <p className="muted">{error}</p> : null}

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

        {outcome?.status === "preview" ? (
          <div className="ui-stack">
            <p className="muted">
              Preview only. Review it, then choose “Create Gmail draft”.
            </p>
            <p className="muted">
              To: {outcome.recipient.to} · Subject: {outcome.subject}
            </p>
            <div className="draft-box">{outcome.body}</div>
          </div>
        ) : null}

        {outcome?.status === "created" ? (
          <p className="muted">
            Unsent Gmail draft created (id {outcome.draftId}). Open Gmail to review and
            send it to {outcome.recipient.to} yourself.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
