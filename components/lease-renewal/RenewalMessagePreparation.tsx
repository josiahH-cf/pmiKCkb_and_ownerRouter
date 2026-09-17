"use client";
import { renewalCardTitle } from "@/components/lease-renewal/RenewalSectionHeading";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
  type ExternalDeskDestination,
} from "@/lib/lease-renewal/desk-destinations";
import { Button, Card, Field } from "@/components/ui";
import { useRenewalManualWorkspace } from "@/components/lease-renewal/RenewalManualWorkspace";
import { focusRenewalDashboardControl } from "@/components/lease-renewal/RenewalDashboardNavigation";
import {
  composeRenewalMessage,
  MESSAGE_CHARGES,
  RESPONSE_REQUEST_PLACEMENT,
  responseRequestParagraph,
  type MessageCharge,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import {
  MESSAGE_CONTROL_IDS,
  projectMessageReadiness,
  type MessageMissingInput,
} from "@/lib/lease-renewal/message-readiness";
import {
  emptyMessagePreparationInputs,
  type MessagePreparationInputs,
  type MessagePreparationRecord,
} from "@/lib/lease-renewal/renewal-message-preparation";
import {
  RenewalNoticeDraftOutcomeSchema,
  type RenewalNoticeDraftOutcome,
} from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";
import { formatRecipientsForCopy } from "@/lib/lease-renewal/recipient-resolution";

interface ChargeInventoryLine {
  id: string;
  label: string;
  amount: number;
  frequency: number;
  startDate: string | null;
  current: boolean | null;
  sourceRef: string;
}

interface Preparation {
  /** S116: the complete same-audience recipient set, or the refusal a person resolves at the source. */
  recipients?:
    | { status: "ready"; to: string; cc: string[] }
    | { status: "blocked"; reasons: string[] };
  destinations?: {
    gmailDrafts: ExternalDeskDestination | null;
    lease: ExternalDeskDestination | null;
    messages: ExternalDeskDestination | null;
    owners: Array<{
      name: string;
      record: ExternalDeskDestination;
      messages: ExternalDeskDestination;
    }>;
  };
  previousDraftAttempts?: Array<{
    executionId: string;
    cycleId: string;
    state: string;
    recoveryAvailable: boolean;
  }>;
  availableCompScreenshot?: {
    receiptId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  } | null;
  draftAttempt: {
    executionId: string;
    state: string;
    recoveryAvailable: boolean;
    outcome: RenewalNoticeDraftOutcome | null;
  } | null;
  senderEmail: string;
  cycleId: string | null;
  saved: MessagePreparationRecord | null;
  inputs: MessagePreparationInputs;
  facts: RenewalMessageFacts;
  sourceFingerprint: string;
  needsReview: boolean;
  signatureMatchesActor: boolean;
  /** S120: where the current signature came from; a retained value is neither review nor binding. */
  signatureOrigin?:
    | { kind: "none" }
    | { kind: "saved" }
    | { kind: "retained_sender"; recordedAt: string };
  /** S120: the signed-in sender's own retained signature, if any. */
  retainedSignature?: MessagePreparationInputs["signature"] | null;
  /** S120: current non-rent recurring charges a person may deliberately fill a charge from. */
  chargeInventory?: ChargeInventoryLine[] | null;
  publication: { status: string; reason?: string };
  notices: string[];
}

export function RenewalMessagePreparation({
  channel,
  canEdit,
}: {
  channel: "owner" | "tenant";
  canEdit: boolean;
}) {
  const context = useRenewalManualWorkspace();
  return context ? (
    <MessagePreparationEditor
      key={`${context.leaseId}:${context.state?.cycleId ?? "pending"}:${channel}`}
      leaseId={context.leaseId}
      cycleId={context.state?.cycleId ?? null}
      refreshBasis={`${context.state?.termsRevision}:${context.state?.preparation?.revision}`}
      channel={channel}
      canEdit={canEdit}
    />
  ) : null;
}

function chargeFillSource(line: ChargeInventoryLine) {
  return `RentVine recurring charge: ${line.label} (${line.id})`;
}

function externalLink(destination: ExternalDeskDestination, text: string) {
  return (
    <a
      href={destination.href}
      target={EXTERNAL_LINK_TARGET}
      rel={EXTERNAL_LINK_REL}
      title={destination.label}
    >
      {text}
    </a>
  );
}

function MessagePreparationEditor({
  leaseId,
  cycleId,
  refreshBasis,
  channel,
  canEdit,
}: {
  leaseId: string;
  cycleId: string | null;
  refreshBasis: string;
  channel: "owner" | "tenant";
  canEdit: boolean;
}) {
  const [current, setCurrent] = useState<Preparation | null>(null);
  const [inputs, setInputs] = useState(emptyMessagePreparationInputs);
  const [dirty, setDirty] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const dirtyRef = useRef(false),
    outstanding = useRef<{ payload: string; id: string } | null>(null);
  const [pending, setPending] = useState(false),
    [notice, setNotice] = useState("");
  const [outcome, setOutcome] = useState<RenewalNoticeDraftOutcome | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [adoptSignature, setAdoptSignature] = useState(false);
  const base = useId();
  const loadSequence = useRef(0);
  const readinessRef = useRef<HTMLDetailsElement | null>(null);
  const readinessSummaryId = `${MESSAGE_CONTROL_IDS.readiness(channel)}-summary`;
  const load = useCallback(() => {
    const sequence = ++loadSequence.current;
    return fetch(
      `/api/lease-renewal/message-preparation?leaseId=${encodeURIComponent(leaseId)}&channel=${channel}`,
      { cache: "no-store" },
    ).then(async (response) => {
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Message preparation could not be loaded.");
      const result = data as Preparation;
      if (sequence !== loadSequence.current) return;
      setCurrent(result);
      if (result.draftAttempt?.recoveryAvailable) {
        if (["Executing", "Needs reconciliation"].includes(result.draftAttempt.state))
          setOutcome({
            status: "needs_reconciliation",
            channel,
            executionId: result.draftAttempt.executionId,
            reason: "Recover the saved exact attempt before creating another draft.",
          });
        else if (result.draftAttempt.outcome) setOutcome(result.draftAttempt.outcome);
      }
      if (!dirtyRef.current) {
        setInputs(result.inputs);
        setReviewed(false);
      } else {
        setReviewed(false);
        setNotice(
          "Source facts refreshed. Your edits are retained; review the current message before saving.",
        );
      }
    });
  }, [channel, leaseId]);
  useEffect(() => {
    let active = true;
    load().catch((error) => {
      if (active) setNotice(error.message);
    });
    return () => {
      active = false;
      loadSequence.current++;
    };
  }, [load, cycleId, refreshBasis]); // source changes retain deliberate edits
  function change(next: MessagePreparationInputs) {
    setInputs(next);
    dirtyRef.current = true;
    setDirty(true);
    setReviewed(false);
    if (outcome?.status === "preview") setOutcome(null);
    setConfirming(false);
  }
  function chargeChange(id: MessageCharge["id"], changeValue: Partial<MessageCharge>) {
    change({
      ...inputs,
      charges: inputs.charges.map((value) =>
        value.id === id ? { ...value, ...changeValue } : value,
      ),
    });
  }
  function fillChargeFromInventory(id: MessageCharge["id"], lineId: string) {
    const line = current?.chargeInventory?.find((value) => value.id === lineId);
    if (!line) return;
    // A deliberate fill from one named current charge. The comparison with the outgoing lease
    // stays a human judgment, so it remains unverified until a person records it.
    chargeChange(id, {
      applicable: true,
      amount: line.amount,
      cadence: line.frequency === 1 ? "monthly" : null,
      effectiveDate: line.startDate,
      source: chargeFillSource(line),
    });
  }
  const signature = inputs.signature;
  function signatureChange(
    field: "name" | "role" | "phone" | "hours" | "source",
    value: string,
  ) {
    change({
      ...inputs,
      signature: {
        name: "",
        role: null,
        phone: null,
        hours: null,
        website: null,
        source: "",
        ...signature,
        [field]: value || (field === "name" || field === "source" ? "" : null),
      },
    });
  }
  let content: ReturnType<typeof composeRenewalMessage> | null = null;
  let contentError = "";
  if (current) {
    try {
      content = composeRenewalMessage(
        {
          ...current.facts,
          attachments:
            inputs.compScreenshotReceiptId &&
            inputs.compScreenshotReceiptId === current.availableCompScreenshot?.receiptId
              ? [
                  {
                    filename: current.availableCompScreenshot.filename,
                    source: `comp-screenshot-receipt:${inputs.compScreenshotReceiptId}`,
                  },
                ]
              : [],
          charges: inputs.charges.map((value) => ({
            ...value,
            source: value.source?.trim() || null,
          })),
          leaseOrigin: inputs.leaseOrigin?.source ? inputs.leaseOrigin : null,
          insuranceTransition: inputs.insuranceTransition?.source
            ? inputs.insuranceTransition
            : null,
          otherChargesComparison: inputs.otherChargesComparison?.source
            ? inputs.otherChargesComparison
            : null,
          signature:
            signature?.name && signature.source
              ? {
                  ...signature,
                  email:
                    current.signatureMatchesActor ||
                    JSON.stringify(signature) !==
                      JSON.stringify(current.saved?.inputs.signature)
                      ? current.senderEmail
                      : (current.saved?.signatureEmail ?? current.senderEmail),
                }
              : null,
        },
        inputs.edits,
      );
      if (
        inputs.compScreenshotReceiptId &&
        inputs.compScreenshotReceiptId !== current.availableCompScreenshot?.receiptId
      )
        content.missing.push({
          field: "attachment",
          message:
            "Review the current screenshot or remove the unavailable attachment selection before final use.",
        });
    } catch (error) {
      contentError =
        error instanceof Error ? error.message : "Review the labeled inputs.";
    }
  }
  // S120 (R120.4): one readiness result from the same content, review and sender basis governs
  // the missing-input list and the supported final-body exports.
  const readiness = current
    ? projectMessageReadiness({
        channel,
        missing: content?.missing ?? [],
        contentError,
        saved: Boolean(current.saved),
        dirty,
        needsReview: current.needsReview,
        signatureMatchesActor: current.signatureMatchesActor,
        signatureSaved: Boolean(current.saved?.inputs.signature),
      })
    : null;
  const bodyReady = Boolean(readiness?.bodyReady && content);
  function reviewMissing() {
    const details = readinessRef.current;
    if (!details) return;
    details.open = true;
    const first = details.querySelector<HTMLElement>("a[href]");
    (first ?? details).focus({ preventScroll: true });
    details.scrollIntoView?.({ block: "start" });
  }
  function openMissingInput(item: MessageMissingInput) {
    if (item.target.kind === "control") focusRenewalDashboardControl(item.target.id);
  }
  async function save() {
    if (!current || !cycleId) return;
    const request = {
      kind: "save",
      leaseId,
      cycleId,
      channel,
      expectedRevision: current.saved?.revision ?? 0,
      sourceFingerprint: current.sourceFingerprint,
      reviewed,
      adoptSignature,
      inputs,
    };
    const serialized = JSON.stringify(request);
    if (outstanding.current?.payload !== serialized)
      outstanding.current = { payload: serialized, id: crypto.randomUUID() };
    setPending(true);
    setNotice("");
    try {
      const response = await fetch("/api/lease-renewal/message-preparation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, operationId: outstanding.current.id }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "The preparation could not be saved.");
      setCurrent(data);
      setInputs(data.inputs);
      setDirty(false);
      dirtyRef.current = false;
      setReviewed(false);
      setAdoptSignature(false);
      outstanding.current = null;
      setNotice(
        reviewed
          ? "Preparation and review saved. No Gmail draft was created."
          : "Edits saved. Review the current facts before a final export.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Save failed. Your edits remain here.",
      );
    } finally {
      setPending(false);
    }
  }
  async function copy(kind: "subject" | "plain" | "formatted" | "recipients") {
    if (!content) return;
    // The guarded final-body exports never put an unfinished body on the clipboard; the guard
    // opens the actual missing items instead.
    if ((kind === "plain" || kind === "formatted") && !bodyReady) {
      reviewMissing();
      return;
    }
    try {
      if (kind === "recipients") {
        // S116: the complete To/Cc set, in the same order the draft carries it. Nothing is sent.
        if (current?.recipients?.status !== "ready") return;
        await navigator.clipboard.writeText(
          formatRecipientsForCopy({
            to: current.recipients.to,
            cc: current.recipients.cc,
          }),
        );
        setNotice(
          `Recipients copied (${1 + current.recipients.cc.length} ${channel} ${
            current.recipients.cc.length === 0 ? "address" : "addresses"
          }). Nothing was sent.`,
        );
        return;
      }
      if (kind === "formatted") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([content.htmlBody], { type: "text/html" }),
            "text/plain": new Blob([content.plainText], { type: "text/plain" }),
          }),
        ]);
      } else
        await navigator.clipboard.writeText(
          kind === "subject" ? content.subject : content.plainText,
        );
      setNotice(
        `${kind === "subject" ? "Subject" : "Body"} copied. Attachments are separate. Nothing was sent.`,
      );
    } catch {
      setNotice(
        kind === "subject" || !bodyReady
          ? "Clipboard access was denied. Select and copy the subject below; your preparation is retained."
          : "Clipboard access was denied. Select and copy the subject or plain text below; your preparation is retained.",
      );
    }
  }
  async function draft(
    kind: "preview" | "create" | "reconcile",
    priorExecutionId?: string,
  ) {
    setPending(true);
    setConfirming(false);
    setNotice("");
    const request = {
      kind: "draft",
      leaseId,
      channel,
      ...(kind === "create" && outcome?.status === "preview"
        ? {
            confirm: {
              executionId: outcome.executionId,
              previewHash: outcome.previewHash,
            },
          }
        : {}),
      ...(kind === "reconcile" &&
      (priorExecutionId || (outcome && "executionId" in outcome))
        ? {
            reconcile: {
              executionId:
                priorExecutionId ??
                (outcome && "executionId" in outcome ? outcome.executionId : ""),
            },
          }
        : {}),
    };
    try {
      const response = await fetch("/api/lease-renewal/message-preparation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = await response.json();
      if (!response.ok && data.providerCallAttempted === false) {
        setNotice(data.error);
        return;
      }
      if (!response.ok)
        throw new Error(
          data.error ??
            "Gmail drafting is unavailable. Copy remains available; no new draft is confirmed.",
        );
      const parsed = RenewalNoticeDraftOutcomeSchema.parse(data);
      setOutcome(parsed);
      if (parsed.status === "blocked") setNotice(parsed.reasons.join(" "));
      if (parsed.status === "created")
        setNotice(
          "An unsent Gmail draft was created and recorded. Review it in Gmail; a person sends it.",
        );
      if (parsed.status === "needs_reconciliation" || parsed.status === "reconciliation")
        setNotice(parsed.reason);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Gmail drafting failed. Copy remains available.",
      );
      if (kind === "create" && outcome?.status === "preview")
        setOutcome({
          status: "needs_reconciliation",
          channel,
          executionId: outcome.executionId,
          reason:
            "The create response is uncertain. Recover this exact attempt before preparing another draft.",
        });
    } finally {
      setPending(false);
    }
  }
  const unresolved =
    outcome?.status === "needs_reconciliation" ||
    (outcome?.status === "reconciliation" && outcome.resolution !== "created");
  const canDraft = Boolean(
    canEdit &&
    current &&
    cycleId &&
    bodyReady &&
    current.publication.status === "approved" &&
    !unresolved,
  );
  const paragraph = responseRequestParagraph(channel, inputs.edits);
  const signatureEdited =
    JSON.stringify(signature ?? null) !==
    JSON.stringify(current?.inputs.signature ?? null);
  const retainedDiffers =
    Boolean(current?.retainedSignature) &&
    JSON.stringify(signature ?? null) !==
      JSON.stringify(current?.retainedSignature ?? null);
  const guardedProps = bodyReady
    ? {}
    : {
        "aria-disabled": true as const,
        "aria-describedby": readinessSummaryId,
        title: "Not available until the listed inputs are resolved and reviewed.",
      };
  const channelLabel = channel === "owner" ? "Owner" : "Tenant";
  return (
    <Card
      title={renewalCardTitle(
        channel === "owner" ? "message-preparation-owner" : "message-preparation-tenant",
        `${channelLabel} message preparation`,
      )}
      ariaLabel={`${channelLabel} message preparation`}
    >
      <p className="muted">A person sends it; saving here does not record delivery.</p>
      {!cycleId ? <p>Select the current renewal cycle above to retain edits.</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {current?.notices.map((value) => (
        <p key={value} className="muted">
          {value}
        </p>
      ))}
      {!current ? (
        <Button
          disabled={pending}
          onClick={() => load().catch((error) => setNotice(error.message))}
        >
          Reload message preparation
        </Button>
      ) : (
        <>
          <fieldset
            id={MESSAGE_CONTROL_IDS.inputs(channel)}
            disabled={!canEdit || pending}
            className="ui-stack"
          >
            <Field
              htmlFor={`${base}-response`}
              label="Response request (optional wording edit)"
              hint={`Replaces ${RESPONSE_REQUEST_PLACEMENT[channel]}. Blank keeps the approved wording. Amounts, dates, links and contacts stay in their labeled fields.`}
            >
              <textarea
                id={`${base}-response`}
                value={inputs.edits.responseRequest}
                onChange={(event) =>
                  change({ ...inputs, edits: { responseRequest: event.target.value } })
                }
              />
            </Field>
            <p className="muted" data-testid="renewal-message-response-paragraph">
              Current paragraph in the preview (
              {paragraph.isDefault ? "approved default" : "your wording"}): &ldquo;
              {paragraph.text}&rdquo;
            </p>
            {channel === "tenant" ? (
              <>
                <details>
                  <summary>Review lease origin and applicable charges</summary>
                  <div className="ui-stack">
                    <Field
                      htmlFor={MESSAGE_CONTROL_IDS.origin(channel)}
                      label="Current lease origin"
                    >
                      <select
                        id={MESSAGE_CONTROL_IDS.origin(channel)}
                        value={inputs.leaseOrigin?.kind ?? ""}
                        onChange={(event) =>
                          change({
                            ...inputs,
                            leaseOrigin: event.target.value
                              ? {
                                  kind: event.target.value as "pmi" | "third_party",
                                  source: inputs.leaseOrigin?.source ?? "",
                                }
                              : null,
                          })
                        }
                      >
                        <option value="">Needs review</option>
                        <option value="pmi">PMI lease</option>
                        <option value="third_party">Third-party lease</option>
                      </select>
                    </Field>
                    {inputs.leaseOrigin ? (
                      <Field
                        htmlFor={`${base}-origin-source`}
                        label="Lease-origin source"
                      >
                        <input
                          id={`${base}-origin-source`}
                          value={inputs.leaseOrigin.source}
                          onChange={(event) =>
                            change({
                              ...inputs,
                              leaseOrigin: {
                                ...inputs.leaseOrigin!,
                                source: event.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                    ) : null}
                    {inputs.charges.map((charge) => {
                      const filledFrom = current.chargeInventory?.find(
                        (line) => chargeFillSource(line) === charge.source,
                      );
                      return (
                        <details
                          key={charge.id}
                          id={MESSAGE_CONTROL_IDS.charge(channel, charge.id)}
                        >
                          <summary>
                            {MESSAGE_CHARGES[charge.id]} ·{" "}
                            {charge.applicable === null
                              ? "Needs review"
                              : charge.applicable
                                ? "Applies"
                                : "Does not apply"}
                          </summary>
                          <div className="ui-stack">
                            {current.chargeInventory?.length ? (
                              <Field
                                htmlFor={`${base}-${charge.id}-fill`}
                                label="Fill from a current RentVine charge"
                                hint="Choose the current recurring charge this line reports. The comparison with the outgoing lease stays yours to record."
                              >
                                <select
                                  id={`${base}-${charge.id}-fill`}
                                  value={filledFrom?.id ?? ""}
                                  onChange={(event) =>
                                    fillChargeFromInventory(charge.id, event.target.value)
                                  }
                                >
                                  <option value="">Choose a current charge</option>
                                  {current.chargeInventory.map((line) => (
                                    <option key={line.id} value={line.id}>
                                      {line.label}: ${line.amount.toFixed(2)}
                                      {line.frequency === 1
                                        ? " per month"
                                        : ` every ${line.frequency} months`}
                                      {line.startDate ? ` from ${line.startDate}` : ""}
                                      {line.current === false ? " (not current)" : ""}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            ) : null}
                            {filledFrom ? (
                              <p
                                className="muted"
                                data-testid={`renewal-message-charge-origin-${charge.id}`}
                              >
                                Filled from RentVine recurring charge {filledFrom.label}.
                                Confirm it applies and record the comparison yourself.
                              </p>
                            ) : null}
                            <Field
                              htmlFor={`${base}-${charge.id}-applies`}
                              label="Does this charge apply?"
                            >
                              <select
                                id={`${base}-${charge.id}-applies`}
                                value={
                                  charge.applicable === null
                                    ? ""
                                    : String(charge.applicable)
                                }
                                onChange={(event) =>
                                  chargeChange(charge.id, {
                                    applicable:
                                      event.target.value === ""
                                        ? null
                                        : event.target.value === "true",
                                  })
                                }
                              >
                                <option value="">Needs review</option>
                                <option value="true">Applies</option>
                                <option value="false">Does not apply</option>
                              </select>
                            </Field>
                            {charge.applicable ? (
                              <>
                                <Field
                                  htmlFor={`${base}-${charge.id}-amount`}
                                  label="Charge amount ($)"
                                >
                                  <input
                                    id={`${base}-${charge.id}-amount`}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={charge.amount ?? ""}
                                    onChange={(event) =>
                                      chargeChange(charge.id, {
                                        amount:
                                          event.target.value === ""
                                            ? null
                                            : Number(event.target.value),
                                      })
                                    }
                                  />
                                </Field>
                                <Field
                                  htmlFor={`${base}-${charge.id}-cadence`}
                                  label="How often is it charged?"
                                >
                                  <select
                                    id={`${base}-${charge.id}-cadence`}
                                    value={charge.cadence ?? ""}
                                    onChange={(event) =>
                                      chargeChange(charge.id, {
                                        cadence: (event.target.value ||
                                          null) as MessageCharge["cadence"],
                                      })
                                    }
                                  >
                                    <option value="">Needs review</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="one_time">One time</option>
                                  </select>
                                </Field>
                                <Field
                                  htmlFor={`${base}-${charge.id}-date`}
                                  label="Charge start date"
                                >
                                  <input
                                    id={`${base}-${charge.id}-date`}
                                    type="date"
                                    value={charge.effectiveDate ?? ""}
                                    onChange={(event) =>
                                      chargeChange(charge.id, {
                                        effectiveDate: event.target.value || null,
                                      })
                                    }
                                  />
                                </Field>
                                <Field
                                  htmlFor={`${base}-${charge.id}-comparison`}
                                  label="Compared with current charges"
                                >
                                  <select
                                    id={`${base}-${charge.id}-comparison`}
                                    value={charge.comparison}
                                    onChange={(event) =>
                                      chargeChange(charge.id, {
                                        comparison: event.target
                                          .value as MessageCharge["comparison"],
                                      })
                                    }
                                  >
                                    <option value="unverified">Needs comparison</option>
                                    <option value="unchanged">Unchanged</option>
                                    <option value="changed">Changed</option>
                                    <option value="new">New</option>
                                  </select>
                                </Field>
                              </>
                            ) : null}
                            <Field
                              htmlFor={`${base}-${charge.id}-source`}
                              label="Charge source"
                              hint="Identify the record or approved policy used to confirm this charge and whether it applies."
                            >
                              <input
                                id={`${base}-${charge.id}-source`}
                                value={charge.source ?? ""}
                                onChange={(event) =>
                                  chargeChange(charge.id, {
                                    source: event.target.value || null,
                                  })
                                }
                              />
                            </Field>
                          </div>
                        </details>
                      );
                    })}
                    <Field
                      htmlFor={MESSAGE_CONTROL_IDS.insurance(channel)}
                      label="Does the supplied insurance transition apply?"
                    >
                      <select
                        id={MESSAGE_CONTROL_IDS.insurance(channel)}
                        value={
                          inputs.insuranceTransition === null
                            ? ""
                            : String(inputs.insuranceTransition.applicable)
                        }
                        onChange={(event) =>
                          change({
                            ...inputs,
                            insuranceTransition:
                              event.target.value === ""
                                ? null
                                : {
                                    applicable: event.target.value === "true",
                                    source: inputs.insuranceTransition?.source ?? "",
                                  },
                          })
                        }
                      >
                        <option value="">Needs review</option>
                        <option value="true">Applies</option>
                        <option value="false">Does not apply</option>
                      </select>
                    </Field>
                    {inputs.insuranceTransition ? (
                      <Field
                        htmlFor={`${base}-insurance-source`}
                        label="Insurance policy source"
                      >
                        <input
                          id={`${base}-insurance-source`}
                          value={inputs.insuranceTransition.source}
                          onChange={(event) =>
                            change({
                              ...inputs,
                              insuranceTransition: {
                                ...inputs.insuranceTransition!,
                                source: event.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                    ) : null}
                    <Field
                      htmlFor={`${base}-unchanged`}
                      label="Are all remaining charges unchanged after comparison?"
                    >
                      <select
                        id={`${base}-unchanged`}
                        value={
                          inputs.otherChargesComparison === null
                            ? ""
                            : String(inputs.otherChargesComparison.unchanged)
                        }
                        onChange={(event) =>
                          change({
                            ...inputs,
                            otherChargesComparison:
                              event.target.value === ""
                                ? null
                                : {
                                    unchanged: event.target.value === "true",
                                    source: inputs.otherChargesComparison?.source ?? "",
                                  },
                          })
                        }
                      >
                        <option value="">
                          Do not include an unchanged-charges statement
                        </option>
                        <option value="true">Compared: unchanged</option>
                        <option value="false">Compared: changes apply</option>
                      </select>
                    </Field>
                    {inputs.otherChargesComparison ? (
                      <Field
                        htmlFor={`${base}-comparison-source`}
                        label="Remaining-charges comparison source"
                      >
                        <input
                          id={`${base}-comparison-source`}
                          value={inputs.otherChargesComparison.source}
                          onChange={(event) =>
                            change({
                              ...inputs,
                              otherChargesComparison: {
                                ...inputs.otherChargesComparison!,
                                source: event.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                    ) : null}
                  </div>
                </details>
              </>
            ) : null}
            <details>
              <summary>Managed sender signature · {current.senderEmail}</summary>
              <p className="muted" data-testid="renewal-message-signature-origin">
                {signatureEdited
                  ? "Edited here. Saving records this version for this message and retains it for your managed sender."
                  : current.signatureOrigin?.kind === "retained_sender"
                    ? `Filled from your retained sender signature (saved ${current.signatureOrigin.recordedAt.slice(0, 10)}). Edit here to override; saving binds it to this message.`
                    : current.signatureOrigin?.kind === "saved"
                      ? current.signatureMatchesActor
                        ? "Saved with this message as your signature for this managed sender."
                        : "Saved with this message by another sender. Review it as your own or use your retained signature."
                      : "Enter your signature once. It is retained for your managed sender across leases and cycles."}
              </p>
              {!current.signatureMatchesActor && current.inputs.signature ? (
                <label>
                  <input
                    id={MESSAGE_CONTROL_IDS.adoptSignature(channel)}
                    type="checkbox"
                    checked={adoptSignature}
                    onChange={(event) => {
                      setAdoptSignature(event.target.checked);
                      setReviewed(false);
                      setDirty(true);
                      dirtyRef.current = true;
                    }}
                  />{" "}
                  I reviewed this signature as my own for {current.senderEmail}.
                </label>
              ) : null}
              {retainedDiffers ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    change({ ...inputs, signature: current.retainedSignature ?? null });
                    setAdoptSignature(false);
                  }}
                >
                  Use my retained signature
                </Button>
              ) : null}
              <div className="ui-stack">
                {(
                  [
                    ["name", "Sender name"],
                    ["role", "Approved role / organization"],
                    ["phone", "Verified phone (optional)"],
                    ["hours", "Verified hours (optional)"],
                    ["source", "Signature source"],
                  ] as const
                ).map(([field, label]) => {
                  const id =
                    field === "name"
                      ? MESSAGE_CONTROL_IDS.signature(channel)
                      : `${base}-${field}`;
                  return (
                    <Field key={field} htmlFor={id} label={label}>
                      <input
                        id={id}
                        value={signature?.[field] ?? ""}
                        onChange={(event) => signatureChange(field, event.target.value)}
                      />
                    </Field>
                  );
                })}
                <Field htmlFor={`${base}-website`} label="Verified website (optional)">
                  <input
                    id={`${base}-website`}
                    type="url"
                    value={signature?.website?.url ?? ""}
                    onChange={(event) =>
                      change({
                        ...inputs,
                        signature: {
                          ...(inputs.signature ?? {
                            name: "",
                            role: null,
                            phone: null,
                            hours: null,
                            source: "",
                            website: null,
                          }),
                          website: event.target.value
                            ? {
                                url: event.target.value,
                                source: inputs.signature?.source ?? "",
                              }
                            : null,
                        },
                      })
                    }
                  />
                </Field>
              </div>
            </details>
            {channel === "owner" ? (
              <div className="ui-stack">
                {current.availableCompScreenshot ? (
                  <>
                    <label>
                      <input
                        id={MESSAGE_CONTROL_IDS.attachment}
                        type="checkbox"
                        checked={
                          inputs.compScreenshotReceiptId ===
                          current.availableCompScreenshot.receiptId
                        }
                        onChange={(event) =>
                          change({
                            ...inputs,
                            compScreenshotReceiptId: event.target.checked
                              ? current.availableCompScreenshot!.receiptId
                              : null,
                          })
                        }
                      />
                      Include this reviewed screenshot for the current renewal:{" "}
                      {current.availableCompScreenshot.filename}
                    </label>
                    <a
                      className="text-link"
                      href={`/api/lease-renewal/message-attachment?leaseId=${encodeURIComponent(leaseId)}&receiptId=${encodeURIComponent(current.availableCompScreenshot.receiptId)}`}
                    >
                      Download reviewed screenshot
                    </a>
                    <p className="muted">
                      For a manually copied email, download and attach this file yourself.
                      Download and Gmail attachment both verify its current Drive receipt
                      and existing action access.
                    </p>
                  </>
                ) : (
                  <p className="muted" id={MESSAGE_CONTROL_IDS.attachment} tabIndex={-1}>
                    No current receipted screenshot is available. Review any analysis file
                    separately before manually attaching it in Gmail.
                  </p>
                )}
                {inputs.compScreenshotReceiptId &&
                inputs.compScreenshotReceiptId !==
                  current.availableCompScreenshot?.receiptId ? (
                  <Button
                    onClick={() => change({ ...inputs, compScreenshotReceiptId: null })}
                  >
                    Remove unavailable attachment selection
                  </Button>
                ) : null}
              </div>
            ) : null}
            <label>
              <input
                id={MESSAGE_CONTROL_IDS.reviewed(channel)}
                type="checkbox"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
              />{" "}
              I reviewed these inputs and the current source facts for this message.
            </label>
            <Button disabled={!cycleId || Boolean(contentError)} onClick={save}>
              {reviewed ? "Save reviewed preparation" : "Save edits"}
            </Button>
          </fieldset>
          {contentError ? <p role="alert">{contentError}</p> : null}
          {current.needsReview || dirty ? (
            <p className="muted">
              Preparation needs review. Saved edits survive refresh; changed source terms
              require another review.
            </p>
          ) : null}
          {readiness ? (
            readiness.bodyReady ? (
              <p className="muted" id={readinessSummaryId}>
                {readiness.summary}
              </p>
            ) : (
              <details
                open
                ref={readinessRef}
                id={MESSAGE_CONTROL_IDS.readiness(channel)}
              >
                <summary id={readinessSummaryId}>{readiness.summary}</summary>
                <ol aria-label="Missing inputs" className="ui-rows">
                  {readiness.items.map((item) => (
                    <li key={`${item.field}:${item.message}`}>
                      {item.target.kind === "control" ? (
                        <a
                          className="text-link"
                          href={`#${item.target.id}`}
                          onClick={() => openMissingInput(item)}
                        >
                          {item.target.label}
                        </a>
                      ) : (
                        <a className="text-link" href={item.target.href}>
                          {item.target.label}
                        </a>
                      )}
                      : {item.message}
                    </li>
                  ))}
                </ol>
              </details>
            )
          ) : null}
          {/* The copy group stays mounted while the composer refuses the current inputs, so
              the guarded exports keep their reachable explanation instead of vanishing. */}
          <section
            aria-label="Copy the message"
            className="ui-stack-tight renewal-message-group"
          >
            <h3 className="renewal-message-group-title">Copy the message</h3>
            <Field htmlFor={`${base}-subject`} label="Subject">
              <input id={`${base}-subject`} readOnly value={content?.subject ?? ""} />
            </Field>
            {current?.recipients ? (
              current.recipients.status === "ready" ? (
                <p className="renewal-message-recipients">
                  <strong>To:</strong> {current.recipients.to}
                  {current.recipients.cc.length > 0 ? (
                    <>
                      {" "}
                      <strong>Cc:</strong> {current.recipients.cc.join(", ")}
                    </>
                  ) : null}
                </p>
              ) : (
                <ul className="renewal-message-recipients" role="status">
                  {current.recipients.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )
            ) : null}
            <div className="ui-actions">
              <Button disabled={!content} onClick={() => copy("subject")}>
                Copy subject
              </Button>
              <Button {...guardedProps} onClick={() => copy("formatted")}>
                Copy formatted body
              </Button>
              <Button {...guardedProps} onClick={() => copy("plain")}>
                Copy plain text
              </Button>
              {current?.recipients ? (
                <Button
                  disabled={current.recipients.status !== "ready"}
                  onClick={() => copy("recipients")}
                >
                  Copy recipients
                </Button>
              ) : null}
              {!bodyReady ? (
                <Button variant="secondary" onClick={reviewMissing}>
                  Review missing inputs
                </Button>
              ) : null}
            </div>
            {current.destinations ? (
              <p className="muted renewal-message-destinations">
                Paste it where you send it:{" "}
                {channel === "owner"
                  ? current.destinations.owners.map((owner, index) => (
                      <span key={owner.record.href}>
                        {index > 0 ? " · " : ""}
                        {externalLink(
                          owner.messages,
                          `${owner.name}: open owner messages in RentVine`,
                        )}
                        {" · "}
                        {externalLink(owner.record, "open owner record in RentVine")}
                      </span>
                    ))
                  : current.destinations.messages
                    ? externalLink(
                        current.destinations.messages,
                        "Open lease messages in RentVine",
                      )
                    : null}
                {current.destinations.lease ? (
                  <>
                    {" · "}
                    {externalLink(
                      current.destinations.lease,
                      "Open lease record in RentVine",
                    )}
                  </>
                ) : null}
              </p>
            ) : null}
          </section>
          {content ? (
            <>
              {!bodyReady && readiness ? (
                <p className="muted">
                  Unfinished preview: {readiness.summary}. The formatted body and plain
                  text cannot be copied until they are resolved.
                </p>
              ) : null}
              <div
                aria-label={`${channel} formatted body`}
                className="renewal-message-preview"
                dangerouslySetInnerHTML={{ __html: content.htmlBody }}
              />
              {bodyReady ? (
                <details>
                  <summary>Selectable plain text</summary>
                  <textarea
                    aria-label={`${channel} plain text body`}
                    readOnly
                    value={content.plainText}
                    rows={14}
                  />
                </details>
              ) : null}
            </>
          ) : null}
          <section
            aria-label="Unsent Gmail draft"
            className="ui-stack-tight renewal-message-group"
          >
            <h3 className="renewal-message-group-title">Unsent Gmail draft</h3>
            {current.publication.status !== "approved" ? (
              <p className="muted">{current.publication.reason}</p>
            ) : null}
            <div className="ui-actions">
              <Button disabled={!canDraft || pending} onClick={() => draft("preview")}>
                Preview unsent Gmail draft
              </Button>
              {current.destinations?.gmailDrafts
                ? externalLink(
                    current.destinations.gmailDrafts,
                    "Open the Gmail Drafts folder",
                  )
                : null}
            </div>
            {outcome?.status === "preview" ? (
              <div className="ui-stack">
                <p>
                  From {current.senderEmail} · To {outcome.recipient.to}
                  {outcome.recipient.cc?.length
                    ? ` · Cc ${outcome.recipient.cc.join(", ")}`
                    : ""}
                </p>
                <p>{outcome.subject}</p>
                <div className="draft-box">{outcome.body}</div>
                {outcome.attachment ? (
                  <p>
                    {outcome.attachment.label} · {outcome.attachment.mimeType} ·{" "}
                    {outcome.attachment.sizeBytes} bytes
                  </p>
                ) : null}
                {!confirming ? (
                  <Button
                    disabled={pending || !canDraft}
                    onClick={() => setConfirming(true)}
                  >
                    Review creation confirmation
                  </Button>
                ) : (
                  <div role="group" aria-label="Confirm exact unsent draft">
                    <p>
                      Create this exact reviewed unsent draft in the displayed managed
                      mailbox?
                    </p>
                    <Button onClick={() => setConfirming(false)}>Cancel</Button>
                    <Button
                      disabled={pending || !canDraft}
                      onClick={() => draft("create")}
                    >
                      Create this unsent draft
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
            {unresolved ? (
              <div>
                <p>
                  Do not create a duplicate. Recover the exact consumed attempt; copy
                  remains available.
                </p>
                <Button disabled={pending} onClick={() => draft("reconcile")}>
                  Recover exact Gmail attempt
                </Button>
              </div>
            ) : null}
            {outcome && "draftId" in outcome && outcome.draftId ? (
              <p className="muted">
                {current.destinations?.gmailDrafts ? (
                  <a
                    href={current.destinations.gmailDrafts.href}
                    target={EXTERNAL_LINK_TARGET}
                    rel={EXTERNAL_LINK_REL}
                  >
                    Open the Drafts folder to find this draft
                  </a>
                ) : (
                  "Open the Drafts folder in your managed Gmail mailbox to find this draft."
                )}{" "}
                Mailbox: {current.senderEmail}. A person sends from Gmail.
              </p>
            ) : null}
          </section>
          {current.previousDraftAttempts?.length ? (
            <details>
              <summary>
                Earlier renewal cycle Gmail attempts (
                {current.previousDraftAttempts.length})
              </summary>
              {current.previousDraftAttempts.map((attempt) => (
                <div key={attempt.executionId}>
                  <p>
                    Earlier renewal cycle: {attempt.state}. This attempt remains separate
                    from the current message.
                  </p>
                  {attempt.recoveryAvailable ? (
                    <Button
                      disabled={pending}
                      onClick={() => draft("reconcile", attempt.executionId)}
                    >
                      Recover earlier-cycle Gmail attempt
                    </Button>
                  ) : (
                    <p>Its original managed sender must recover this attempt.</p>
                  )}
                </div>
              ))}
            </details>
          ) : null}
        </>
      )}
    </Card>
  );
}
