"use client";

import { useId, useState } from "react";

import { Button, Field } from "@/components/ui";

// Owner transactional/notice destination editor (D-1 support; wired live by S39.3). Admin-only surface to
// view and change the INTERNAL staff destination the feedback notice is auto-sent to. It PATCHes
// /api/admin/transactional-destination (which enforces the internal-domain lock) and shows
// save/success/error state. It records the recipient only; the send itself is the gated internal
// transactional executor, and tenant/owner-of-record notices never resolve their recipient from here.
export function TransactionalDestinationPanel({
  initialEmail,
  note,
}: Readonly<{ initialEmail: string; note?: string }>) {
  const fieldId = useId();
  const [email, setEmail] = useState(initialEmail);
  const [saved, setSaved] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const dirty = email.trim().toLowerCase() !== saved.trim().toLowerCase();

  async function save() {
    setPending(true);
    setError("");
    setOk(false);
    try {
      const response = await fetch("/api/admin/transactional-destination", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ destination_email: email }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        destination?: { destination_email?: string };
        error?: string;
      };
      if (response.ok && payload.destination?.destination_email) {
        setSaved(payload.destination.destination_email);
        setEmail(payload.destination.destination_email);
        setOk(true);
      } else {
        setError(payload.error ?? "Could not save the destination address.");
      }
    } catch {
      setError("Could not save the destination address.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="panel">
      <h2>Owner Notification Destination</h2>
      <p className="muted">
        The internal staff address the app auto-sends a feedback notice to when a teammate
        files feedback (metadata only; the full note stays in the feedback queue for Admin
        review). It must be an internal address. Tenant and owner-of-record notices are
        never sent from here; they resolve their recipient from verified sources and stay
        human-confirmed.
      </p>
      {note ? <p className="muted">{note}</p> : null}
      <form
        className="ui-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field
          error={error || undefined}
          hint="A valid email address for the internal owner destination."
          htmlFor={fieldId}
          label="Destination email"
          required
        >
          <input
            autoComplete="email"
            name="owner-destination-email"
            onChange={(event) => {
              setEmail(event.target.value);
              setOk(false);
            }}
            type="email"
            value={email}
          />
        </Field>
        <div className="ui-stack">
          <Button disabled={pending || !dirty} size="large" type="submit">
            {pending ? "Saving…" : "Save destination"}
          </Button>
          {ok && !dirty ? (
            <span className="muted" role="status">
              Saved.
            </span>
          ) : null}
        </div>
      </form>
    </article>
  );
}
