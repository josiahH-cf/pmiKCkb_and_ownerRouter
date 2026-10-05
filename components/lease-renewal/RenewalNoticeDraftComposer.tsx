"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import Link from "next/link";
import { useId, useState } from "react";
import { Button, Card, Field } from "@/components/ui";
import { parseCurrencyInput } from "@/lib/currency-input";
import {
  RenewalNoticeDraftOutcomeSchema,
  RenewalNoticeDraftRequestSchema,
  type RenewalNoticeDraftOutcome,
} from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";
import {
  defaultRenewalCopySelection,
  type RenewalCopyPublicationStatus,
} from "@/lib/lease-renewal/renewal-copy-contract";

/** New work uses the reviewed cycle composer. Legacy recovery retains its original-input contract. */
export function RenewalNoticeDraftComposer({
  leaseId,
  initialOffer = null,
}: Readonly<{
  leaseId: string;
  initialOffer?: {
    decision: "keep_same" | "increase" | "custom";
    offeredRent: number;
  } | null;
  templateReadiness?: Record<
    "owner" | "tenant",
    { status: RenewalCopyPublicationStatus; reason?: string }
  >;
}>) {
  const id = useId();
  const [channel, setChannel] = useState<"owner" | "tenant">("tenant");
  const [executionId, setExecutionId] = useState("");
  const [decision, setDecision] = useState(initialOffer?.decision ?? "increase");
  const [rent, setRent] = useState(initialOffer ? String(initialOffer.offeredRent) : "");
  const [specific, setSpecific] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [opening, setOpening] = useState(
    defaultRenewalCopySelection("owner").editableRegions.salutation,
  );
  const [ownerRequest, setOwnerRequest] = useState(
    defaultRenewalCopySelection("owner").editableRegions.owner_request,
  );
  const [tenantRequest, setTenantRequest] = useState(
    defaultRenewalCopySelection("tenant").editableRegions.response_request,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<RenewalNoticeDraftOutcome | null>(null);
  const amount = (value: string) => {
    const parsed = parseCurrencyInput(value);
    return parsed.ok ? parsed.value : undefined;
  };
  const request = RenewalNoticeDraftRequestSchema.safeParse({
    leaseId,
    offer:
      channel === "tenant"
        ? { channel, ownerDecision: decision, offeredRent: amount(rent) }
        : {
            channel,
            market: {
              specificNumber: amount(specific),
              rangeLow: amount(low),
              rangeHigh: amount(high),
            },
          },
    copy:
      channel === "tenant"
        ? {
            ...defaultRenewalCopySelection("tenant"),
            editableRegions: { response_request: tenantRequest },
          }
        : {
            ...defaultRenewalCopySelection("owner"),
            editableRegions: { salutation: opening, owner_request: ownerRequest },
          },
    reconcile: { executionId: executionId.trim() },
  });
  async function recover() {
    if (!request.success || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/lease-renewal/renewal-notice-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.data),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "The original attempt could not be checked.");
      const parsed = RenewalNoticeDraftOutcomeSchema.parse(body);
      if (parsed.status !== "reconciliation")
        throw new Error(
          "The recovery response needs manual review; no creation was requested.",
        );
      setOutcome(parsed);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The original attempt could not be checked.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Card>
      <div className="ui-stack">
        <h3 className="section-title">Reviewed renewal messages</h3>
        <div className="ui-row">
          <Link
            className="primary-button"
            href={`/lease-renewal/live/desk/lease/${encodeURIComponent(leaseId)}#renewal-section-owner`}
          >
            Prepare owner message
          </Link>
          <Link
            className="secondary-button"
            href={`/lease-renewal/live/desk/lease/${encodeURIComponent(leaseId)}#renewal-section-tenant`}
          >
            Prepare tenant message
          </Link>
        </div>
        <details>
          <summary>Recover an earlier legacy draft attempt</summary>
          <div className="ui-stack">
            <p>
              Enter the original attempt identifier, audience, offer and reviewed wording.
              This checks the existing attempt only. Changed source facts or missing
              original inputs can require manual review; no draft is created or sent.
            </p>
            <Field htmlFor={`${id}-attempt`} label="Original execution identifier">
              <input
                id={`${id}-attempt`}
                value={executionId}
                onChange={(event) => setExecutionId(event.target.value)}
              />
            </Field>
            <Field htmlFor={`${id}-channel`} label="Original audience">
              <select
                id={`${id}-channel`}
                value={channel}
                onChange={(event) => {
                  setChannel(event.target.value as "owner" | "tenant");
                  setOutcome(null);
                }}
              >
                <option value="tenant">Tenant</option>
                <option value="owner">Owner</option>
              </select>
            </Field>
            {channel === "tenant" ? (
              <>
                <Field htmlFor={`${id}-decision`} label="Original owner decision">
                  <select
                    id={`${id}-decision`}
                    value={decision}
                    onChange={(event) =>
                      setDecision(event.target.value as typeof decision)
                    }
                  >
                    <option value="increase">Increase rent</option>
                    <option value="keep_same">Keep the same rent</option>
                    <option value="custom">Custom</option>
                  </select>
                </Field>
                <Field htmlFor={`${id}-rent`} label="Original offered rent">
                  <input
                    id={`${id}-rent`}
                    value={rent}
                    onChange={(event) => setRent(event.target.value)}
                  />
                </Field>
                <Field
                  htmlFor={`${id}-tenant-request`}
                  label="Original tenant response request"
                >
                  <textarea
                    id={`${id}-tenant-request`}
                    value={tenantRequest}
                    onChange={(event) => setTenantRequest(event.target.value)}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field htmlFor={`${id}-specific`} label="Original recommendation">
                  <input
                    id={`${id}-specific`}
                    value={specific}
                    onChange={(event) => setSpecific(event.target.value)}
                  />
                </Field>
                <Field htmlFor={`${id}-low`} label="Original range low">
                  <input
                    id={`${id}-low`}
                    value={low}
                    onChange={(event) => setLow(event.target.value)}
                  />
                </Field>
                <Field htmlFor={`${id}-high`} label="Original range high">
                  <input
                    id={`${id}-high`}
                    value={high}
                    onChange={(event) => setHigh(event.target.value)}
                  />
                </Field>
                <Field htmlFor={`${id}-opening`} label="Original owner opening">
                  <textarea
                    id={`${id}-opening`}
                    value={opening}
                    onChange={(event) => setOpening(event.target.value)}
                  />
                </Field>
                <Field
                  htmlFor={`${id}-owner-request`}
                  label="Original owner decision request"
                >
                  <textarea
                    id={`${id}-owner-request`}
                    value={ownerRequest}
                    onChange={(event) => setOwnerRequest(event.target.value)}
                  />
                </Field>
              </>
            )}
            <Button
              disabled={pending || !request.success}
              onClick={() => void recover()}
              type="button"
            >
              {pending ? "Checking…" : "Check original attempt"}
            </Button>
            {error ? <p role="alert">{error}</p> : null}
            {outcome?.status === "reconciliation" ? (
              <p role="status">
                {outcome.reason}
                {outcome.draftId ? ` Draft: ${outcome.draftId}` : ""}
              </p>
            ) : null}
          </div>
        </details>
      </div>
    </Card>
  );
}
