"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field } from "@/components/ui";
import type {
  RenewalEvidenceSource,
  RenewalOwnerOutcome,
  RenewalOwnerOutcomeState,
} from "@/lib/lease-renewal/renewal-process";

const OUTCOMES: { value: RenewalOwnerOutcomeState; label: string }[] = [
  { value: "approved_terms", label: "Approved the terms" },
  { value: "revision_requested", label: "Asked for changes" },
  { value: "declined_non_renewal", label: "Declined / not renewing" },
  { value: "no_response", label: "No response yet" },
];

const SOURCES: { value: RenewalEvidenceSource; label: string }[] = [
  { value: "gmail_receipt", label: "Linked Gmail receipt" },
  { value: "app_record", label: "Verified app record" },
];

const OUTCOME_LABEL = Object.fromEntries(
  OUTCOMES.map((outcome) => [outcome.value, outcome.label]),
) as Record<RenewalOwnerOutcomeState, string>;

/**
 * S105: records the typed owner response and a value-free evidence pointer. It accepts no message
 * content, calls no provider, and sends nothing. Asking for changes reopens the owner copy and every
 * downstream preview; a decline routes to the documented non-renewal handoff; no response keeps the
 * lease visibly waiting on the owner.
 */
export function RenewalOwnerOutcomeControl({
  current,
  leaseId,
}: Readonly<{
  current: RenewalOwnerOutcome | null;
  leaseId: string;
}>) {
  const router = useRouter();
  const outcomeId = useId();
  const sourceId = useId();
  const referenceId = useId();
  const [outcome, setOutcome] = useState<RenewalOwnerOutcomeState>(
    current?.state ?? "no_response",
  );
  const [source, setSource] = useState<RenewalEvidenceSource>(
    current?.evidence.source === "app_record" ? "app_record" : "gmail_receipt",
  );
  const [reference, setReference] = useState(current?.evidence.ref ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const exactReference = reference.trim();
    if (exactReference === "") {
      setError("Enter the exact receipt or record reference.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/lease-renewal/renewal-progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "owner_outcome",
          leaseId,
          outcome,
          evidence: {
            ref: exactReference,
            source,
            disposition: "verified",
          },
        }),
      });
      if (response.ok) {
        router.refresh();
      } else {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Could not record the owner response.");
      }
    } catch {
      setError("Could not reach the renewal service.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ui-stack">
      {current ? (
        <p className="muted">Current owner response: {OUTCOME_LABEL[current.state]}.</p>
      ) : null}
      <Field htmlFor={outcomeId} label="Owner response" required>
        <select
          onChange={(event) => setOutcome(event.target.value as RenewalOwnerOutcomeState)}
          value={outcome}
        >
          {OUTCOMES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field htmlFor={sourceId} label="Evidence source" required>
        <select
          onChange={(event) => setSource(event.target.value as RenewalEvidenceSource)}
          value={source}
        >
          {SOURCES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        hint="Use a Gmail thread/message id or exact app receipt id. Never paste an email body, customer value, or note."
        htmlFor={referenceId}
        label="Exact evidence reference"
        required
      >
        <input
          maxLength={240}
          onChange={(event) => setReference(event.target.value)}
          placeholder="gmail-thread:…:message:…"
          type="text"
          value={reference}
        />
      </Field>
      <div className="ui-row">
        <Button
          disabled={pending || reference.trim() === ""}
          onClick={() => void submit()}
          type="button"
        >
          {pending ? "Recording…" : "Record owner response"}
        </Button>
      </div>
      <p className="muted">
        Asking for changes reopens the owner copy and every preview built from it. A
        decline continues through the non-renewal handoff. No response keeps this lease
        waiting on the owner.
      </p>
      {error ? <p className="muted">{error}</p> : null}
    </div>
  );
}
