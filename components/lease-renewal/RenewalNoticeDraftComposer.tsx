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
import {
  CURRENT_RENEWAL_COPY_PUBLICATION,
  RENEWAL_COPY_TEMPLATE_SOURCES,
  RenewalCopyAssistOutcomeSchema,
  defaultRenewalCopySelection,
  type OwnerRenewalCopySelection,
  type RenewalCopySelection,
  type RenewalCopyPublicationStatus,
  type TenantRenewalCopySelection,
} from "@/lib/lease-renewal/renewal-copy-contract";

// Compose an UNSENT renewal-notice Gmail draft for one lease, in two steps: Preview, then Create.
// The recipient and lease facts come from the LIVE RentVine record (server-side, never from this form);
// the operator enters only the offer. The control can never send: it posts to the gated draft route,
// which returns an unsent draft id, and a human presses Send in Gmail. A blocked result lists the exact
// reasons (unverified recipient or missing inputs) and never invents a recipient.

type Channel = "tenant" | "owner";
type OwnerDecision = "keep_same" | "increase" | "custom";

function attachmentSummary(
  attachment: NonNullable<
    Extract<RenewalNoticeDraftOutcome, { status: "preview" }>["attachment"]
  >,
) {
  const kib = attachment.sizeBytes / 1024;
  const size = kib >= 1024 ? `${(kib / 1024).toFixed(2)} MiB` : `${kib.toFixed(1)} KiB`;
  return `${attachment.label} · ${attachment.mimeType} · ${size}`;
}

const OWNER_DECISIONS: { value: OwnerDecision; label: string }[] = [
  { value: "increase", label: "Increase rent" },
  { value: "keep_same", label: "Keep the same rent" },
  { value: "custom", label: "Custom" },
];

export function RenewalNoticeDraftComposer({
  leaseId,
  initialOffer = null,
  templateReadiness,
}: Readonly<{
  leaseId: string;
  /** Prefill the tenant-offer inputs from the recorded owner decision (live workspace). */
  initialOffer?: { decision: OwnerDecision; offeredRent: number } | null;
  /** Display/control projection only. The server independently resolves publication before any model or draft work. */
  templateReadiness?: Record<
    Channel,
    { status: RenewalCopyPublicationStatus; reason?: string }
  >;
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
  const [copySelections, setCopySelections] = useState<{
    owner: OwnerRenewalCopySelection;
    tenant: TenantRenewalCopySelection;
  }>(() => ({
    owner: defaultRenewalCopySelection("owner"),
    tenant: defaultRenewalCopySelection("tenant"),
  }));
  const [copyNotice, setCopyNotice] = useState("");
  const [pending, setPending] = useState<
    null | "assist" | "preview" | "create" | "reconcile"
  >(null);
  const [outcome, setOutcome] = useState<RenewalNoticeDraftOutcome | null>(null);
  const [previewBinding, setPreviewBinding] = useState<RenewalDraftPreviewBinding | null>(
    null,
  );
  const [reconciliationRequest, setReconciliationRequest] = useState<Pick<
    RenewalNoticeDraftRequest,
    "leaseId" | "offer" | "copy"
  > | null>(null);
  const [error, setError] = useState("");

  const id = {
    decision: useId(),
    rent: useId(),
    spec: useId(),
    low: useId(),
    high: useId(),
    salutation: useId(),
    ownerRequest: useId(),
    tenantRequest: useId(),
  };

  const offeredRentParsed = parseCurrencyInput(offeredRent);
  const specificNumberParsed = parseCurrencyInput(specificNumber);
  const rangeLowParsed = parseCurrencyInput(rangeLow);
  const rangeHighParsed = parseCurrencyInput(rangeHigh);
  const copySelection: RenewalCopySelection = copySelections[channel];
  const copySource = RENEWAL_COPY_TEMPLATE_SOURCES[channel];
  const copyPublication =
    templateReadiness?.[channel] ?? CURRENT_RENEWAL_COPY_PUBLICATION[channel];
  const copyApproved = copyPublication.status === "approved";
  const copyStatusLabel =
    copyPublication.status === "approved"
      ? "Approved"
      : copyPublication.status === "retired"
        ? "Retired"
        : "Review only";
  const copyPublicationReason = "reason" in copyPublication ? copyPublication.reason : "";

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
      },
    };
  }

  const currentRequestResult = RenewalNoticeDraftRequestSchema.safeParse({
    leaseId,
    offer: buildOffer(),
    copy: copySelection,
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
    setCopyNotice("");
  }

  function updateTenantCopy(value: string) {
    setCopySelections((current) => ({
      ...current,
      tenant: {
        ...current.tenant,
        editableRegions: {
          ...current.tenant.editableRegions,
          response_request: value,
        },
      },
    }));
    invalidatePreview();
  }

  function updateOwnerCopy(region: "salutation" | "owner_request", value: string) {
    setCopySelections((current) => ({
      ...current,
      owner: {
        ...current.owner,
        editableRegions: { ...current.owner.editableRegions, [region]: value },
      },
    }));
    invalidatePreview();
  }

  async function requestCopyAssistance() {
    if (!copyApproved || unresolvedAttempt) return;
    setPending("assist");
    setError("");
    setCopyNotice("");
    try {
      const response = await fetch("/api/lease-renewal/renewal-copy-assist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          templateRef: copySelection.templateRef,
          templateVersion: copySelection.templateVersion,
        }),
      });
      const raw = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          raw && typeof raw === "object" && typeof raw.error === "string"
            ? raw.error
            : "Copy assistance is unavailable.",
        );
        return;
      }
      const parsed = RenewalCopyAssistOutcomeSchema.safeParse(raw);
      if (!parsed.success) {
        setError("Copy assistance returned an invalid result.");
        return;
      }
      if (parsed.data.status === "refused") {
        setError(parsed.data.errors.join(" "));
        return;
      }
      const next = parsed.data.selection;
      setCopySelections((current) =>
        next.templateRef === "owner-renewal:v1.0"
          ? { ...current, owner: next }
          : { ...current, tenant: next },
      );
      setPreviewBinding(null);
      setOutcome(null);
      setCopyNotice(
        parsed.data.usedModel
          ? "Assisted prose is ready. Review it and preview the full draft again."
          : (parsed.data.errors[0] ??
              "The current approved deterministic prose was kept. Preview it again."),
      );
    } catch {
      setError("Could not reach copy assistance. The current prose was not changed.");
    } finally {
      setPending(null);
    }
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
      ...(parsed.data.copy ? { copy: parsed.data.copy } : {}),
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
          <p className="muted" role="status">
            <strong>
              {channel === "owner" ? "Owner" : "Tenant"} copy {copySource.version}:
              {` ${copyStatusLabel}.`}
            </strong>{" "}
            {copyPublicationReason}
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
            <Field
              htmlFor={id.tenantRequest}
              hint="Only general phrasing is editable. Names, recipients, rent, dates, terms, evidence, and channel status stay server-locked."
              label="Tenant response request"
            >
              <textarea
                disabled={!copyApproved || unresolvedAttempt}
                id={id.tenantRequest}
                onChange={(event) => updateTenantCopy(event.target.value)}
                rows={4}
                value={copySelections.tenant.editableRegions.response_request}
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
            <p className="muted">
              The comp screenshot is resolved server-side from this lease&apos;s current
              receipted upload. Browser-entered Drive links and file ids are never
              accepted.
            </p>
            <Field htmlFor={id.salutation} label="Owner-message opening">
              <textarea
                disabled={!copyApproved || unresolvedAttempt}
                id={id.salutation}
                onChange={(event) => updateOwnerCopy("salutation", event.target.value)}
                rows={2}
                value={copySelections.owner.editableRegions.salutation}
              />
            </Field>
            <Field
              htmlFor={id.ownerRequest}
              hint="Only general phrasing is editable. Recipients, property, rent, comps, terms, evidence, and channel status stay server-locked."
              label="Owner decision request"
            >
              <textarea
                disabled={!copyApproved || unresolvedAttempt}
                id={id.ownerRequest}
                onChange={(event) => updateOwnerCopy("owner_request", event.target.value)}
                rows={5}
                value={copySelections.owner.editableRegions.owner_request}
              />
            </Field>
          </>
        )}

        <div className="ui-row">
          <Button
            disabled={!copyApproved || pending !== null || unresolvedAttempt}
            onClick={() => void requestCopyAssistance()}
            type="button"
            variant="secondary"
          >
            {pending === "assist" ? "Tailoring…" : "Request clearer phrasing"}
          </Button>
          <Button
            disabled={!formReady || pending !== null || unresolvedAttempt}
            onClick={() => void previewDraft()}
            type="button"
          >
            {pending === "preview"
              ? "Previewing…"
              : copyApproved
                ? "Preview draft"
                : "Preview review-only copy"}
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

        {!copyApproved ? (
          <p className="muted">
            Manual tailoring and AI assistance stay unavailable until the client approves
            this exact copy version. A review-only preview cannot create a Gmail draft.
          </p>
        ) : null}

        {copyNotice ? <p className="muted">{copyNotice}</p> : null}

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

        {outcome?.status === "review_only" ? (
          <div className="ui-stack">
            <p className="muted">
              Review-only {outcome.template.ref}. No execution was prepared and no Gmail
              draft can be created until client-approved wording is published.
            </p>
            <ul>
              {outcome.reasons.map((reason) => (
                <li className="muted" key={reason}>
                  {reason}
                </li>
              ))}
            </ul>
            <p className="muted">
              To: {outcome.recipient.to} · Subject: {outcome.subject}
            </p>
            {outcome.attachment ? (
              <p className="muted">{attachmentSummary(outcome.attachment)}</p>
            ) : null}
            <div className="draft-box">{outcome.body}</div>
          </div>
        ) : null}

        {outcome?.status === "preview" && previewIsCurrent ? (
          <div className="ui-stack">
            <p className="muted">
              Preview only. Review it, then choose “Create Gmail draft”.
            </p>
            <p className="muted">
              Approved template: {outcome.template.ref} (
              {outcome.template.contentHash.slice(0, 12)}…)
            </p>
            <p className="muted">
              To: {outcome.recipient.to} · Subject: {outcome.subject}
            </p>
            {outcome.attachment ? (
              <p className="muted">{attachmentSummary(outcome.attachment)}</p>
            ) : null}
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
          <div className="ui-stack">
            <p className="muted">
              Unsent Gmail draft created (id {outcome.draftId}). Open Gmail to review and
              send it to {outcome.recipient.to} yourself.
            </p>
            {outcome.attachment ? (
              <p className="muted">{attachmentSummary(outcome.attachment)}</p>
            ) : null}
          </div>
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
