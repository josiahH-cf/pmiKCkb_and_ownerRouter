"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field } from "@/components/ui";
import type {
  RenewalEvidenceSource,
  RenewalTenantOutcome,
  RenewalTenantOutcomeState,
} from "@/lib/lease-renewal/renewal-process";

const OUTCOMES: { value: RenewalTenantOutcomeState; label: string }[] = [
  { value: "awaiting_response", label: "Waiting for response" },
  { value: "accepted", label: "Accepted" },
  { value: "counter_change_requested", label: "Counter / change requested" },
  { value: "declined_nonrenewing", label: "Declined / non-renewing" },
  { value: "needs_verification", label: "Needs verification" },
];

const SOURCES: { value: RenewalEvidenceSource; label: string }[] = [
  { value: "gmail_receipt", label: "Linked Gmail receipt" },
  { value: "app_record", label: "Verified app record" },
];

const OUTCOME_LABEL = Object.fromEntries(
  OUTCOMES.map((outcome) => [outcome.value, outcome.label]),
) as Record<RenewalTenantOutcomeState, string>;

/**
 * Records only app-owned outcome state plus a value-free evidence pointer. It never accepts message
 * content, calls a provider, or sends anything; counter/change deliberately reopens owner work.
 */
export function RenewalTenantOutcomeControl({
  current,
  leaseId,
}: Readonly<{
  current: RenewalTenantOutcome | null;
  leaseId: string;
}>) {
  const router = useRouter();
  const outcomeId = useId();
  const sourceId = useId();
  const referenceId = useId();
  const [outcome, setOutcome] = useState<RenewalTenantOutcomeState>(
    current?.state ?? "awaiting_response",
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
          action: "tenant_outcome",
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
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(payload.error ?? "Could not record the tenant outcome.");
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
        <p className="muted">Current outcome: {OUTCOME_LABEL[current.state]}.</p>
      ) : null}
      <Field htmlFor={outcomeId} label="Tenant outcome" required>
        <select
          onChange={(event) =>
            setOutcome(event.target.value as RenewalTenantOutcomeState)
          }
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
          {pending ? "Recording…" : "Record tenant outcome"}
        </Button>
      </div>
      <p className="muted">
        Waiting and Needs verification remain incomplete. A counter reopens the owner
        decision. A decline requires a separate non-renewal handoff.
      </p>
      {error ? <p className="muted">{error}</p> : null}
    </div>
  );
}
