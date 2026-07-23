"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field } from "@/components/ui";

// Phase-A LIVE workspace controls that make the renewal flow move. They persist the operator's own
// forward progress through /api/lease-renewal/renewal-progress and refresh the server-rendered workspace.
// They change NO system of record: RentVine and the Sheet stay read-only; recording a decision here does
// not compose or send anything. The tenant offer is drafted only through the gated Gmail composer.

type OwnerDecision = "keep_same" | "increase" | "custom";

interface RecordedDecision {
  decision: OwnerDecision;
  offeredRent: number;
  charges?: { rbp?: number; insurance?: number };
  infoFormUrl?: string;
  market?: {
    zillowLow?: number;
    zillowHigh?: number;
    pmiNumber?: number;
    compsUrl?: string;
  };
}

const OWNER_DECISIONS: { value: OwnerDecision; label: string }[] = [
  { value: "increase", label: "Increase rent" },
  { value: "keep_same", label: "Keep the same rent" },
  { value: "custom", label: "Custom" },
];

/**
 * Record (or update) the owner's rent decision for a live lease. Recording advances the lease to the
 * Tenant-offer step and builds the tenant offer from these numbers. The decision + charges are the
 * operator's inputs; the recipient and lease facts stay sourced from RentVine on the draft side.
 */
export function OwnerDecisionForm({
  leaseId,
  current,
}: Readonly<{ leaseId: string; current: RecordedDecision | null }>) {
  const router = useRouter();
  const [decision, setDecision] = useState<OwnerDecision>(
    current?.decision ?? "increase",
  );
  const [offeredRent, setOfferedRent] = useState(
    current ? String(current.offeredRent) : "",
  );
  const [infoFormUrl, setInfoFormUrl] = useState(current?.infoFormUrl ?? "");
  const [rbp, setRbp] = useState(
    current?.charges?.rbp !== undefined ? String(current.charges.rbp) : "",
  );
  const [insurance, setInsurance] = useState(
    current?.charges?.insurance !== undefined ? String(current.charges.insurance) : "",
  );
  const [zillowLow, setZillowLow] = useState(
    current?.market?.zillowLow !== undefined ? String(current.market.zillowLow) : "",
  );
  const [zillowHigh, setZillowHigh] = useState(
    current?.market?.zillowHigh !== undefined ? String(current.market.zillowHigh) : "",
  );
  const [pmiNumber, setPmiNumber] = useState(
    current?.market?.pmiNumber !== undefined ? String(current.market.pmiNumber) : "",
  );
  const [compsUrl, setCompsUrl] = useState(current?.market?.compsUrl ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const id = {
    decision: useId(),
    rent: useId(),
    form: useId(),
    rbp: useId(),
    insurance: useId(),
    zillowLow: useId(),
    zillowHigh: useId(),
    pmiNumber: useId(),
    compsUrl: useId(),
  };

  const ready = offeredRent.trim() !== "" && Number(offeredRent) > 0;

  async function submit() {
    setPending(true);
    setError("");
    setSaved(false);
    const charges: { rbp?: number; insurance?: number } = {};
    if (rbp.trim() !== "") charges.rbp = Number(rbp);
    if (insurance.trim() !== "") charges.insurance = Number(insurance);
    const body: Record<string, unknown> = {
      action: "owner_decision",
      leaseId,
      decision,
      offeredRent: Number(offeredRent),
    };
    if (charges.rbp !== undefined || charges.insurance !== undefined) {
      body.charges = charges;
    }
    if (infoFormUrl.trim() !== "") body.infoFormUrl = infoFormUrl.trim();
    const market: Record<string, unknown> = {};
    if (zillowLow.trim() !== "") market.zillowLow = Number(zillowLow);
    if (zillowHigh.trim() !== "") market.zillowHigh = Number(zillowHigh);
    if (pmiNumber.trim() !== "") market.pmiNumber = Number(pmiNumber);
    if (compsUrl.trim() !== "") market.compsUrl = compsUrl.trim();
    if (Object.keys(market).length > 0) body.market = market;
    try {
      const response = await fetch("/api/lease-renewal/renewal-progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setSaved(true);
        router.refresh();
      } else {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Could not record the decision.");
      }
    } catch {
      setError("Could not reach the renewal service.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ui-stack">
      <Field htmlFor={id.decision} label="Owner decision" required>
        <select
          id={id.decision}
          onChange={(event) => setDecision(event.target.value as OwnerDecision)}
          value={decision}
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
      <div className="ui-row">
        <Field htmlFor={id.rbp} label="Resident benefit package (optional)">
          <input
            id={id.rbp}
            inputMode="decimal"
            min="0"
            onChange={(event) => setRbp(event.target.value)}
            type="number"
            value={rbp}
          />
        </Field>
        <Field htmlFor={id.insurance} label="Insurance (optional)">
          <input
            id={id.insurance}
            inputMode="decimal"
            min="0"
            onChange={(event) => setInsurance(event.target.value)}
            type="number"
            value={insurance}
          />
        </Field>
      </div>
      <Field htmlFor={id.form} label="Tenant info form URL (optional)">
        <input
          id={id.form}
          onChange={(event) => setInfoFormUrl(event.target.value)}
          type="url"
          value={infoFormUrl}
        />
      </Field>
      <p className="muted">
        Comp basis (optional). Your own numbers, shown source-tagged in the owner email. A
        separate comp-derived suggestion needs Admin approval before it enters a draft.
      </p>
      <div className="ui-row">
        <Field htmlFor={id.zillowLow} label="Zillow low (optional)">
          <input
            id={id.zillowLow}
            inputMode="decimal"
            min="0"
            onChange={(event) => setZillowLow(event.target.value)}
            type="number"
            value={zillowLow}
          />
        </Field>
        <Field htmlFor={id.zillowHigh} label="Zillow high (optional)">
          <input
            id={id.zillowHigh}
            inputMode="decimal"
            min="0"
            onChange={(event) => setZillowHigh(event.target.value)}
            type="number"
            value={zillowHigh}
          />
        </Field>
        <Field htmlFor={id.pmiNumber} label="PMI rental-analysis number (optional)">
          <input
            id={id.pmiNumber}
            inputMode="decimal"
            min="0"
            onChange={(event) => setPmiNumber(event.target.value)}
            type="number"
            value={pmiNumber}
          />
        </Field>
      </div>
      <Field
        htmlFor={id.compsUrl}
        label="Comps screenshot / Zillow search URL (optional)"
      >
        <input
          id={id.compsUrl}
          onChange={(event) => setCompsUrl(event.target.value)}
          type="url"
          value={compsUrl}
        />
      </Field>
      <div className="ui-row">
        <Button disabled={!ready || pending} onClick={() => void submit()} type="button">
          {pending
            ? "Saving…"
            : current
              ? "Update owner decision"
              : "Record owner decision"}
        </Button>
      </div>
      {error ? <p className="muted">{error}</p> : null}
      {saved && !error ? (
        <p className="muted">Decision recorded. The tenant offer is ready below.</p>
      ) : null}
    </div>
  );
}

/**
 * Mark the renewal complete for a live lease (operator confirms the process is done). Once complete it
 * shows a done state; otherwise it offers the button. Complete is app-owned state only — it writes back
 * to no system of record.
 */
export function RenewalCompleteButton({
  leaseId,
  complete,
}: Readonly<{ leaseId: string; complete: boolean }>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/lease-renewal/renewal-progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mark_complete", leaseId }),
      });
      if (response.ok) {
        router.refresh();
      } else {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Could not mark the renewal complete.");
      }
    } catch {
      setError("Could not reach the renewal service.");
    } finally {
      setPending(false);
    }
  }

  if (complete) {
    return <p className="muted">✓ Renewal marked complete.</p>;
  }

  return (
    <div className="ui-stack">
      <div className="ui-row">
        <Button
          disabled={pending}
          onClick={() => void submit()}
          type="button"
          variant="secondary"
        >
          {pending ? "Saving…" : "Mark renewal complete"}
        </Button>
      </div>
      {error ? <p className="muted">{error}</p> : null}
    </div>
  );
}
