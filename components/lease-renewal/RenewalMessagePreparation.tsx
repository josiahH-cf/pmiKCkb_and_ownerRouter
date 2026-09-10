"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button, Card, Field } from "@/components/ui";
import { useRenewalManualWorkspace } from "@/components/lease-renewal/RenewalManualWorkspace";
import {
  composeRenewalMessage,
  MESSAGE_CHARGES,
  type MessageCharge,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import {
  emptyMessagePreparationInputs,
  type MessagePreparationInputs,
  type MessagePreparationRecord,
} from "@/lib/lease-renewal/renewal-message-preparation";
import {
  RenewalNoticeDraftOutcomeSchema,
  type RenewalNoticeDraftOutcome,
} from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";

interface Preparation {
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
  async function copy(kind: "subject" | "plain" | "formatted") {
    if (!content) return;
    try {
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
        `${kind === "subject" ? "Subject" : "Body"} copied${content.missing.length ? " as an unfinished preparation; review the missing inputs before use" : ""}. Attachments are separate. Nothing was sent.`,
      );
    } catch {
      setNotice(
        "Clipboard access was denied. Select and copy the subject or plain text below; your preparation is retained.",
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
    !dirty &&
    !current.needsReview &&
    current.signatureMatchesActor &&
    current.publication.status === "approved" &&
    content &&
    content.missing.length === 0 &&
    !unresolved,
  );
  return (
    <Card
      title={`${channel === "owner" ? "Owner" : "Tenant"} message preparation`}
      ariaLabel={`${channel === "owner" ? "Owner" : "Tenant"} message preparation`}
    >
      <p className="muted">
        Supplied September 10 template · preparation and copy do not require Gmail. A
        saved preparation or draft does not mark this message sent.
      </p>
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
          <fieldset disabled={!canEdit || pending} className="ui-stack">
            <Field
              htmlFor={`${base}-response`}
              label="Response request (optional wording edit)"
            >
              <textarea
                id={`${base}-response`}
                value={inputs.edits.responseRequest}
                onChange={(event) =>
                  change({ ...inputs, edits: { responseRequest: event.target.value } })
                }
              />
            </Field>
            {channel === "tenant" ? (
              <>
                <details>
                  <summary>Review lease origin and applicable charges</summary>
                  <div className="ui-stack">
                    <Field htmlFor={`${base}-origin`} label="Current lease origin">
                      <select
                        id={`${base}-origin`}
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
                    {inputs.charges.map((charge) => (
                      <details key={charge.id}>
                        <summary>
                          {MESSAGE_CHARGES[charge.id]} ·{" "}
                          {charge.applicable === null
                            ? "Needs review"
                            : charge.applicable
                              ? "Applies"
                              : "Does not apply"}
                        </summary>
                        <div className="ui-stack">
                          <Field
                            htmlFor={`${base}-${charge.id}-applies`}
                            label="Applicability"
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
                                label="Amount"
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
                                label="Cadence"
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
                                label="Effective date"
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
                            label="Applicability and charge source"
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
                    ))}
                    <Field
                      htmlFor={`${base}-insurance-policy`}
                      label="Does the supplied insurance transition apply?"
                    >
                      <select
                        id={`${base}-insurance-policy`}
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
              {!current.signatureMatchesActor && current.inputs.signature ? (
                <label>
                  <input
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
              <div className="ui-stack">
                {(
                  [
                    ["name", "Sender name"],
                    ["role", "Approved role / organization"],
                    ["phone", "Verified phone (optional)"],
                    ["hours", "Verified hours (optional)"],
                    ["source", "Signature source"],
                  ] as const
                ).map(([field, label]) => (
                  <Field key={field} htmlFor={`${base}-${field}`} label={label}>
                    <input
                      id={`${base}-${field}`}
                      value={signature?.[field] ?? ""}
                      onChange={(event) => signatureChange(field, event.target.value)}
                    />
                  </Field>
                ))}
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
                <p>
                  Attachments are separate files. Copying the body does not copy
                  attachment bytes.
                </p>
                {current.availableCompScreenshot ? (
                  <>
                    <label>
                      <input
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
                  <p className="muted">
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
          {content ? (
            <>
              {content.missing.length ? (
                <details open>
                  <summary>{content.missing.length} inputs remain for final use</summary>
                  <ul>
                    {content.missing.map((value) => (
                      <li key={`${value.field}:${value.message}`}>{value.message}</li>
                    ))}
                  </ul>
                  <a href="#renewal-section-documents">Open shared resource link boxes</a>
                </details>
              ) : null}
              <Field htmlFor={`${base}-subject`} label="Subject">
                <input id={`${base}-subject`} readOnly value={content.subject} />
              </Field>
              <div className="ui-actions">
                <Button onClick={() => copy("subject")}>Copy subject</Button>
                <Button onClick={() => copy("formatted")}>Copy formatted body</Button>
                <Button onClick={() => copy("plain")}>Copy plain text</Button>
              </div>
              <div
                aria-label={`${channel} formatted body`}
                dangerouslySetInnerHTML={{ __html: content.htmlBody }}
              />
              {channel === "tenant" ? (
                <p>
                  This current plain-text preparation is also available for manual portal
                  or text work. Nothing is sent by copying.
                </p>
              ) : null}
              <details>
                <summary>Selectable plain text</summary>
                <textarea
                  aria-label={`${channel} plain text body`}
                  readOnly
                  value={content.plainText}
                  rows={14}
                />
              </details>
            </>
          ) : null}
          {current.publication.status !== "approved" ? (
            <p className="muted">{current.publication.reason}</p>
          ) : null}
          <Button disabled={!canDraft || pending} onClick={() => draft("preview")}>
            Preview unsent Gmail draft
          </Button>
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
                  <Button disabled={pending || !canDraft} onClick={() => draft("create")}>
                    Create this unsent draft
                  </Button>
                </div>
              )}
            </div>
          ) : null}
          {current.previousDraftAttempts?.map((attempt) => (
            <div key={attempt.executionId}>
              <p>
                Earlier renewal cycle: {attempt.state}. This attempt remains separate from
                the current message.
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
              Open Drafts in your managed Gmail mailbox to review and send this message.
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}
