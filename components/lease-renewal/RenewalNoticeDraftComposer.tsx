"use client";

import { useId, useState } from "react";

import { Button, Card, Field } from "@/components/ui";
import { parseCurrencyInput } from "@/lib/currency-input";
import {
  RenewalNoticeDraftOutcomeSchema,
  RenewalNoticeDraftRequestSchema,
  bindRenewalDraftPreview,
  isRenewalDraftPreviewCurrent,
  type RenewalDraftPreviewBinding,
  type RenewalNoticeDraftOffer,
  type RenewalNoticeDraftOutcome,
  type RenewalNoticeDraftRequest,
} from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";

// Compose an UNSENT renewal-notice Gmail draft for one lease, in two steps: Preview, then Create.
// The recipient and lease facts come from the LIVE RentVine record (server-side, never from this form);
// the operator enters only the offer. The control can never send: it posts to the gated draft route,
// which returns an unsent draft id, and a human presses Send in Gmail. A blocked result lists the exact
// reasons (unverified recipient or missing inputs) and never invents a recipient.

type Channel = "tenant" | "owner";
type OwnerDecision = "keep_same" | "increase" | "custom";

const OWNER_DECISIONS: { value: OwnerDecision; label: string }[] = [
  { value: "increase", label: "Increase rent" },
  { value: "keep_same", label: "Keep the same rent" },
  { value: "custom", label: "Custom" },
];

export function RenewalNoticeDraftComposer({
  leaseId,
  initialOffer = null,
}: Readonly<{
  leaseId: string;
  /** Prefill the tenant-offer inputs from the recorded owner decision (live workspace). */
  initialOffer?: { decision: OwnerDecision; offeredRent: number } | null;
}>) {
  const [channel, setChannel] = useState<Channel>("tenant");
  const [ownerDecision, setOwnerDecision] = useState<OwnerDecision>(
    initialOffer?.decision ?? "increase",
  );
  const [offeredRent, setOfferedRent] = useState(
    initialOffer ? String(initialOffer.offeredRent) : "",
  );
  const [specificNumber, setSpecificNumber] = useState("");
  const [rangeLow, setRangeLow] = useState("");
  const [rangeHigh, setRangeHigh] = useState("");
  const [compsRef, setCompsRef] = useState("");
  const [pending, setPending] = useState<null | "preview" | "create" | "reconcile">(null);
  const [outcome, setOutcome] = useState<RenewalNoticeDraftOutcome | null>(null);
  const [previewBinding, setPreviewBinding] = useState<RenewalDraftPreviewBinding | null>(
    null,
  );
  const [reconciliationRequest, setReconciliationRequest] = useState<Pick<
    RenewalNoticeDraftRequest,
    "leaseId" | "offer"
  > | null>(null);
  const [error, setError] = useState("");

  const id = {
    decision: useId(),
    rent: useId(),
    spec: useId(),
    low: useId(),
    high: useId(),
    comps: useId(),
  };

  const offeredRentParsed = parseCurrencyInput(offeredRent);
  const specificNumberParsed = parseCurrencyInput(specificNumber);
  const rangeLowParsed = parseCurrencyInput(rangeLow);
  const rangeHighParsed = parseCurrencyInput(rangeHigh);

  function buildOffer(): RenewalNoticeDraftOffer {
    if (channel === "tenant") {
      return {
        channel,
        ownerDecision,
        offeredRent: offeredRentParsed.ok ? offeredRentParsed.value : 0,
      };
    }
    return {
      channel,
      market: {
        specificNumber: specificNumberParsed.ok ? specificNumberParsed.value : 0,
        rangeLow: rangeLowParsed.ok ? rangeLowParsed.value : 0,
        rangeHigh: rangeHighParsed.ok ? rangeHighParsed.value : 0,
        compsScreenshotRef: compsRef.trim(),
      },
    };
  }

  const currentRequestResult = RenewalNoticeDraftRequestSchema.safeParse({
    leaseId,
    offer: buildOffer(),
  });
  const currentRequest = currentRequestResult.success ? currentRequestResult.data : null;
  const formReady = currentRequest !== null;
  const unresolvedAttempt =
    outcome?.status === "needs_reconciliation" ||
    (outcome?.status === "reconciliation" && outcome.resolution !== "created");
  const previewIsCurrent =
    currentRequest !== null &&
    isRenewalDraftPreviewCurrent(previewBinding, currentRequest);
  const canCreate = outcome?.status === "preview" && previewIsCurrent;

  async function postDraftRequest(request: RenewalNoticeDraftRequest) {
    const response = await fetch("/api/lease-renewal/renewal-notice-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const raw = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        raw && typeof raw === "object" && "error" in raw && typeof raw.error === "string"
          ? raw.error
          : "Could not compose the draft.";
      return { ok: false as const, error: message, status: response.status };
    }
    const parsed = RenewalNoticeDraftOutcomeSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("The draft service returned an invalid outcome.");
    }
    return { ok: true as const, outcome: parsed.data };
  }

  function invalidatePreview() {
    setPreviewBinding(null);
    setOutcome((current) =>
      current?.status === "needs_reconciliation" ||
      (current?.status === "reconciliation" && current.resolution !== "created")
        ? current
        : null,
    );
    setError("");
  }

  async function previewDraft() {
    if (!currentRequest || unresolvedAttempt) return;
    setPending("preview");
    setError("");
    setOutcome(null);
    setPreviewBinding(null);
    try {
      const result = await postDraftRequest(currentRequest);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOutcome(result.outcome);
      if (result.outcome.status === "preview") {
        setPreviewBinding(bindRenewalDraftPreview(currentRequest, result.outcome));
      }
    } catch {
      setError("Could not reach the draft service.");
    } finally {
      setPending(null);
    }
  }

  function markCreateUncertain(
    request: Pick<RenewalNoticeDraftRequest, "leaseId" | "offer">,
    executionId: string,
  ) {
    setPreviewBinding(null);
    setReconciliationRequest(request);
    setOutcome({
      status: "needs_reconciliation",
      channel: request.offer.channel,
      executionId,
      reason:
        "The app could not confirm Gmail’s result. Do not create another draft; check this exact attempt.",
    });
    setError("");
  }

  async function createDraft() {
    if (!currentRequest || !previewIsCurrent || !previewBinding) {
      setError("The reviewed preview is stale. Preview the current inputs again.");
      return;
    }
    const parsed = RenewalNoticeDraftRequestSchema.safeParse({
      ...currentRequest,
      confirm: {
        executionId: previewBinding.executionId,
        previewHash: previewBinding.previewHash,
      },
    });
    if (!parsed.success) {
      setError("The exact confirmation is invalid. Preview the current inputs again.");
      setPreviewBinding(null);
      return;
    }
    const attemptRequest = {
      leaseId: parsed.data.leaseId,
      offer: parsed.data.offer,
    };
    const executionId = previewBinding.executionId;
    setPending("create");
    setError("");
    try {
      const result = await postDraftRequest(parsed.data);
      if (!result.ok) {
        if (!Number.isFinite(result.status) || result.status >= 500) {
          markCreateUncertain(attemptRequest, executionId);
          return;
        }
        // A complete 4xx refusal is deterministic. No blind retry: the reviewed state is removed and
        // the operator must preview again before any future create attempt.
        setPreviewBinding(null);
        setOutcome(null);
        setError(result.error);
        return;
      }
      setOutcome(result.outcome);
      setPreviewBinding(null);
      if (result.outcome.status === "needs_reconciliation") {
        setReconciliationRequest(attemptRequest);
      } else {
        setReconciliationRequest(null);
      }
    } catch {
      // A transport/parse failure after the request left the browser is uncertain: Gmail may have
      // accepted it. Preserve the one execution and expose read-only reconciliation only.
      markCreateUncertain(attemptRequest, executionId);
    } finally {
      setPending(null);
    }
  }

  async function checkExactAttempt() {
    const executionId =
      outcome?.status === "needs_reconciliation"
        ? outcome.executionId
        : outcome?.status === "reconciliation" && outcome.resolution !== "created"
          ? outcome.executionId
          : null;
    if (!executionId || !reconciliationRequest) return;
    const parsed = RenewalNoticeDraftRequestSchema.safeParse({
      ...reconciliationRequest,
      reconcile: { executionId },
    });
    if (!parsed.success) {
      setError("The exact attempt cannot be checked from the retained request.");
      return;
    }
    setPending("reconcile");
    setError("");
    try {
      const result = await postDraftRequest(parsed.data);
      if (!result.ok) {
        setOutcome({
          status: "reconciliation",
          channel: reconciliationRequest.offer.channel,
          executionId,
          resolution: "needs_review",
          reason: result.error,
        });
        return;
      }
      if (result.outcome.status !== "reconciliation") {
        setOutcome({
          status: "reconciliation",
          channel: reconciliationRequest.offer.channel,
          executionId,
          resolution: "needs_review",
          reason:
            "The exact-attempt check returned an unexpected result. Review it manually.",
        });
        return;
      }
      setOutcome(result.outcome);
      if (result.outcome.resolution === "created") setReconciliationRequest(null);
    } catch {
      setOutcome({
        status: "reconciliation",
        channel: reconciliationRequest.offer.channel,
        executionId,
        resolution: "needs_review",
        reason:
          "The exact-attempt check could not complete. No new draft was created; try the check again or review Gmail manually.",
      });
    } finally {
      setPending(null);
    }
  }

  function selectChannel(next: Channel) {
    setChannel(next);
    invalidatePreview();
  }

  return (
    <Card>
      <div className="ui-stack">
        <div>
          <h3 className="section-title">Renewal-notice draft</h3>
          <p className="muted">
            Composes an unsent Gmail draft from this lease’s live RentVine record. The
            recipient comes from RentVine; you enter the offer. You review and send it
            yourself in Gmail.
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
                onChange={(event) => {
                  setOwnerDecision(event.target.value as OwnerDecision);
                  invalidatePreview();
                }}
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
                onChange={(event) => {
                  setOfferedRent(event.target.value);
                  invalidatePreview();
                }}
                placeholder="$1,500"
                type="text"
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
                onChange={(event) => {
                  setSpecificNumber(event.target.value);
                  invalidatePreview();
                }}
                placeholder="$1,500"
                type="text"
                value={specificNumber}
              />
            </Field>
            <div className="ui-row">
              <Field htmlFor={id.low} label="Comp range low" required>
                <input
                  id={id.low}
                  inputMode="decimal"
                  onChange={(event) => {
                    setRangeLow(event.target.value);
                    invalidatePreview();
                  }}
                  placeholder="$1,400"
                  type="text"
                  value={rangeLow}
                />
              </Field>
              <Field htmlFor={id.high} label="Comp range high" required>
                <input
                  id={id.high}
                  inputMode="decimal"
                  onChange={(event) => {
                    setRangeHigh(event.target.value);
                    invalidatePreview();
                  }}
                  placeholder="$1,600"
                  type="text"
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
                onChange={(event) => {
                  setCompsRef(event.target.value);
                  invalidatePreview();
                }}
                type="text"
                value={compsRef}
              />
            </Field>
          </>
        )}

        <div className="ui-row">
          <Button
            disabled={!formReady || pending !== null || unresolvedAttempt}
            onClick={() => void previewDraft()}
            type="button"
          >
            {pending === "preview" ? "Previewing…" : "Preview draft"}
          </Button>
          <Button
            disabled={!canCreate || pending !== null}
            onClick={() => void createDraft()}
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

        {outcome?.status === "preview" && previewIsCurrent ? (
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

        {outcome?.status === "preview" && !previewIsCurrent ? (
          <p className="muted">
            The inputs changed while this preview was loading. Preview the current inputs
            again before creating a draft.
          </p>
        ) : null}

        {outcome?.status === "created" ? (
          <p className="muted">
            Unsent Gmail draft created (id {outcome.draftId}). Open Gmail to review and
            send it to {outcome.recipient.to} yourself.
          </p>
        ) : null}

        {outcome?.status === "needs_reconciliation" ? (
          <div className="ui-stack">
            <p className="muted">{outcome.reason}</p>
            <Button
              disabled={pending !== null}
              onClick={() => void checkExactAttempt()}
              type="button"
              variant="secondary"
            >
              {pending === "reconcile" ? "Checking…" : "Check exact attempt"}
            </Button>
          </div>
        ) : null}

        {outcome?.status === "reconciliation" ? (
          <div className="ui-stack">
            <p className="muted">{outcome.reason}</p>
            {outcome.resolution !== "created" ? (
              <Button
                disabled={pending !== null}
                onClick={() => void checkExactAttempt()}
                type="button"
                variant="secondary"
              >
                {pending === "reconcile" ? "Checking…" : "Check exact attempt"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
