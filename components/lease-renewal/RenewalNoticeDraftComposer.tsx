"use client";

import { useId, useState } from "react";

import { Button, Card, Field } from "@/components/ui";

// Compose an UNSENT renewal-notice Gmail draft for one lease, in two steps: Preview, then Create.
// The recipient and lease facts come from the LIVE RentVine record (server-side, never from this form);
// the operator enters only the offer. The control can never send: it posts to the gated draft route,
// which returns an unsent draft id, and a human presses Send in Gmail. A blocked result lists the exact
// reasons (unverified recipient or missing inputs) and never invents a recipient.

type Channel = "tenant" | "owner";
type OwnerDecision = "keep_same" | "increase" | "custom";

interface Recipient {
  to: string;
  sourceRef?: string;
}
type Outcome =
  | { status: "blocked"; reasons: string[] }
  | { status: "preview"; recipient: Recipient; subject: string; body: string }
  | { status: "created"; recipient: Recipient; subject: string; draftId: string };

const OWNER_DECISIONS: { value: OwnerDecision; label: string }[] = [
  { value: "increase", label: "Increase rent" },
  { value: "keep_same", label: "Keep the same rent" },
  { value: "custom", label: "Custom" },
];

export function RenewalNoticeDraftComposer({ leaseId }: Readonly<{ leaseId: string }>) {
  const [channel, setChannel] = useState<Channel>("tenant");
  const [ownerDecision, setOwnerDecision] = useState<OwnerDecision>("increase");
  const [offeredRent, setOfferedRent] = useState("");
  const [specificNumber, setSpecificNumber] = useState("");
  const [rangeLow, setRangeLow] = useState("");
  const [rangeHigh, setRangeHigh] = useState("");
  const [compsRef, setCompsRef] = useState("");
  const [pending, setPending] = useState<null | "preview" | "create">(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState("");

  const id = {
    decision: useId(),
    rent: useId(),
    spec: useId(),
    low: useId(),
    high: useId(),
    comps: useId(),
  };

  const tenantReady = offeredRent.trim() !== "" && Number(offeredRent) > 0;
  const ownerReady =
    specificNumber.trim() !== "" &&
    rangeLow.trim() !== "" &&
    rangeHigh.trim() !== "" &&
    compsRef.trim() !== "";
  const formReady = channel === "tenant" ? tenantReady : ownerReady;

  function buildOffer() {
    if (channel === "tenant") {
      return { channel, ownerDecision, offeredRent: Number(offeredRent) };
    }
    return {
      channel,
      market: {
        specificNumber: Number(specificNumber),
        rangeLow: Number(rangeLow),
        rangeHigh: Number(rangeHigh),
        compsScreenshotRef: compsRef.trim(),
      },
    };
  }

  async function submit(confirm: boolean) {
    setPending(confirm ? "create" : "preview");
    setError("");
    if (!confirm) setOutcome(null);
    try {
      const response = await fetch("/api/lease-renewal/renewal-notice-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leaseId, confirm, offer: buildOffer() }),
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

  function selectChannel(next: Channel) {
    setChannel(next);
    setOutcome(null);
    setError("");
  }

  const canCreate = outcome?.status === "preview";

  return (
    <Card>
      <div className="ui-stack">
        <div>
          <h3 className="section-title">Renewal-notice draft</h3>
          <p className="muted">
            Composes an unsent Gmail draft from this lease’s live RentVine record. The
            recipient comes from RentVine; you enter the offer. Nothing is sent. You
            review and send it yourself in Gmail.
          </p>
        </div>

        <div className="ui-row" role="group" aria-label="Recipient channel">
          <Button
            aria-pressed={channel === "tenant"}
            onClick={() => selectChannel("tenant")}
            type="button"
            variant={channel === "tenant" ? "primary" : "secondary"}
          >
            Tenant offer
          </Button>
          <Button
            aria-pressed={channel === "owner"}
            onClick={() => selectChannel("owner")}
            type="button"
            variant={channel === "owner" ? "primary" : "secondary"}
          >
            Owner notice
          </Button>
        </div>

        {channel === "tenant" ? (
          <>
            <Field htmlFor={id.decision} label="Owner decision" required>
              <select
                id={id.decision}
                onChange={(event) =>
                  setOwnerDecision(event.target.value as OwnerDecision)
                }
                value={ownerDecision}
              >
                {OWNER_DECISIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              htmlFor={id.rent}
              hint="The owner-approved monthly rent to offer the tenant."
              label="Offered rent (monthly)"
              required
            >
              <input
                id={id.rent}
                inputMode="decimal"
                min="0"
                onChange={(event) => setOfferedRent(event.target.value)}
                type="number"
                value={offeredRent}
              />
            </Field>
          </>
        ) : (
          <>
            <Field
              htmlFor={id.spec}
              hint="The number from the PMI rental-analysis tool."
              label="Specific market number"
              required
            >
              <input
                id={id.spec}
                inputMode="decimal"
                min="0"
                onChange={(event) => setSpecificNumber(event.target.value)}
                type="number"
                value={specificNumber}
              />
            </Field>
            <div className="ui-row">
              <Field htmlFor={id.low} label="Comp range low" required>
                <input
                  id={id.low}
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setRangeLow(event.target.value)}
                  type="number"
                  value={rangeLow}
                />
              </Field>
              <Field htmlFor={id.high} label="Comp range high" required>
                <input
                  id={id.high}
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setRangeHigh(event.target.value)}
                  type="number"
                  value={rangeHigh}
                />
              </Field>
            </div>
            <Field
              htmlFor={id.comps}
              hint="A link/reference to the comps screenshot to attach."
              label="Comps screenshot reference"
              required
            >
              <input
                id={id.comps}
                onChange={(event) => setCompsRef(event.target.value)}
                type="text"
                value={compsRef}
              />
            </Field>
          </>
        )}

        <div className="ui-row">
          <Button
            disabled={!formReady || pending !== null}
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
