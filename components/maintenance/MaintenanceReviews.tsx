"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { UserActionError, actionFailureMessage } from "@/lib/ui/action-feedback";
import {
  ResponsibilityReviewSchema,
  UrgencyReviewSchema,
  type ResponsibilityReviewInput,
  type MaintenanceReviewContext,
} from "@/lib/maintenance/review-model";
import { projectMaintenanceUrgency } from "@/lib/maintenance/operating-policy";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import { formatBusinessTimestamp } from "@/lib/date-display";
import { workflowComposerHref } from "@/lib/gmail-hub/composer-navigation";
const refs = (v: string) =>
  v
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
function exactCents(v: string) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(v))
    throw new UserActionError(
      "Enter the actual proposed amount with at most two decimal places, or leave it unknown.",
    );
  const [a, b = ""] = v.split(".");
  return Number(a) * 100 + Number(b.padEnd(2, "0"));
}
function percent(v: string) {
  return exactCents(v);
}
const money = (v: number | null) =>
  v === null
    ? "Amount not established"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
        v / 100,
      );
export function MaintenanceReviews({
  ticket,
  canEdit,
  blocked,
  onApply,
  pendingCommand,
  onReadCurrent,
}: {
  ticket: MaintenanceTicketRecord;
  canEdit: boolean;
  blocked: boolean;
  onApply: (command: Record<string, unknown>) => Promise<boolean>;
  pendingCommand?: Record<string, unknown>;
  onReadCurrent: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [context, setContext] = useState<MaintenanceReviewContext | null>(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const [summary, setSummary] = useState(ticket.summary),
    [description, setDescription] = useState(ticket.description),
    [happeningNow, setHappeningNow] = useState<"unknown" | "yes" | "no">("unknown"),
    [damage, setDamage] = useState(""),
    [urgencyReason, setUrgencyReason] = useState(""),
    [urgencyEvidence, setUrgencyEvidence] = useState("");
  const [reviewState, setReviewState] =
      useState<ResponsibilityReviewInput["state"]>("pending_assessment"),
    [reason, setReason] = useState(""),
    [evidence, setEvidence] = useState(""),
    [leaseEvidence, setLeaseEvidence] = useState(""),
    [amount, setAmount] = useState(""),
    [basis, setBasis] = useState(""),
    [concern, setConcern] = useState(""),
    [allocations, setAllocations] = useState<
      Array<{
        party: "resident" | "owner" | "vendor" | "pmi";
        percent: string;
        evidenceRef: string;
      }>
    >([]);
  const live = useRef(true),
    generation = useRef(0),
    lock = useRef(false),
    restored = useRef<unknown>(null);
  const invalidateReads = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      invalidateReads();
    };
  }, [invalidateReads]);
  const read = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const gen = ++generation.current;
    try {
      const response = await fetch(
          `/api/maintenance/tickets/${encodeURIComponent(ticket.id)}/review-context`,
          { cache: "no-store" },
        ),
        data = await response.json();
      if (!response.ok)
        throw new UserActionError(data.error ?? "Current review context is unavailable.");
      if (!live.current || gen !== generation.current) return;
      if (data.ticket?.id !== ticket.id || !data.emergency || !data.chargeback)
        throw Error("The review context could not be matched to this case.");
      setContext(data);
      setError("");
      setStatus("Current policy and review context read. Your entered facts are kept.");
    } catch (e) {
      if (live.current && gen === generation.current) {
        setContext(null);
        setError(
          actionFailureMessage(
            e,
            "Current policy could not be read. Your entered facts are kept.",
          ),
        );
      }
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }, [ticket.id]);
  useEffect(() => {
    if (open)
      void Promise.resolve().then(() => {
        if (live.current) void read();
      });
  }, [open, read, ticket.record_version]);
  useEffect(() => {
    if (!pendingCommand || restored.current === pendingCommand.operationId) return;
    restored.current = pendingCommand.operationId;
    void Promise.resolve().then(() => {
      if (!live.current) return;
      if (pendingCommand.op === "urgency_review") {
        const p = UrgencyReviewSchema.safeParse(pendingCommand.review);
        if (p.success) {
          setOpen(true);
          setSummary(p.data.facts.summary);
          setDescription(p.data.facts.description);
          setHappeningNow(
            p.data.facts.happeningNow === null
              ? "unknown"
              : p.data.facts.happeningNow
                ? "yes"
                : "no",
          );
          setDamage(p.data.facts.damageOrAccess);
          setUrgencyReason(p.data.reason);
          setUrgencyEvidence(p.data.evidenceRefs.join("\n"));
        }
      } else if (pendingCommand.op === "responsibility_review") {
        const p = ResponsibilityReviewSchema.safeParse(pendingCommand.review);
        if (p.success) {
          setOpen(true);
          setReviewState(p.data.state);
          setReason(p.data.reason);
          setEvidence(p.data.evidenceRefs.join("\n"));
          setLeaseEvidence(p.data.leaseEvidenceRefs.join("\n"));
          setAmount(
            p.data.proposedAmountCents === null
              ? ""
              : (p.data.proposedAmountCents / 100).toFixed(2),
          );
          setBasis(p.data.amountBasis);
          setConcern(p.data.residentConcern);
          setAllocations(
            p.data.allocations.map((a) => ({
              party: a.party,
              percent: (a.basisPoints / 100).toFixed(2),
              evidenceRef: a.evidenceRef,
            })),
          );
        }
      }
    });
  }, [pendingCommand]);
  const current = context?.ticket,
    decision = current?.responsibility_decision,
    ready = !!context && context.ticket.record_version === ticket.record_version,
    disabled = !canEdit || blocked || busy || !ready,
    facts = {
      summary,
      description,
      happeningNow: happeningNow === "unknown" ? null : happeningNow === "yes",
      damageOrAccess: damage,
    },
    urgency = projectMaintenanceUrgency(facts, context?.emergency.policy ?? null);
  function binding(p: MaintenanceReviewContext["emergency"]) {
    return { id: p.policy?.id ?? null, version: p.policy?.version ?? null };
  }
  async function saveUrgency() {
    try {
      if (!context || !ready)
        throw new UserActionError(
          "Read the current case and policy before reviewing urgency.",
        );
      const review = UrgencyReviewSchema.parse({
        facts,
        expectedPolicy: binding(context.emergency),
        reason: urgencyReason,
        evidenceRefs: refs(urgencyEvidence),
        reviewedActualFacts: true,
      });
      if (await onApply({ op: "urgency_review", review })) {
        setUrgencyReason("");
        setStatus(
          "Staff urgency review recorded with original and corrected facts. No escalation delivery is inferred.",
        );
      }
    } catch (e) {
      setError(actionFailureMessage(e, "Review the actual urgency facts and evidence."));
    }
  }
  async function saveResponsibility() {
    try {
      if (!context || !ready)
        throw new UserActionError(
          "Read the current case and policy before responsibility review.",
        );
      const association = context.ticket.maintenance_association,
        review = ResponsibilityReviewSchema.parse({
          state: reviewState,
          expectedPolicy: binding(context.chargeback),
          expectedAssessmentVersion: context.ticket.assessment?.version ?? 0,
          reason,
          evidenceRefs: refs(evidence),
          leaseEvidenceRefs: refs(leaseEvidence),
          allocations:
            reviewState === "reviewed"
              ? allocations
                  .map((a) => ({
                    ...a,
                    percent: undefined,
                    identityRef:
                      a.party === "resident"
                        ? (association?.leaseId ?? null)
                        : a.party === "owner"
                          ? (association?.ownerRef ?? null)
                          : a.party === "vendor"
                            ? (context.ticket.vendor_id ?? null)
                            : null,
                    basisPoints: percent(a.percent),
                  }))
                  .map(({ party, identityRef, basisPoints, evidenceRef }) => ({
                    party,
                    identityRef,
                    basisPoints,
                    evidenceRef,
                  }))
              : [],
          proposedAmountCents:
            reviewState === "reviewed" && amount.trim()
              ? exactCents(amount.trim())
              : null,
          amountBasis: reviewState === "reviewed" ? basis : "",
          residentConcern: concern,
          reviewedByStaff: true,
        });
      if (await onApply({ op: "responsibility_review", review })) {
        setReason("");
        setStatus(
          "Staff responsibility review recorded. Proposed amounts, invoices, owner approval, payment and ledger posting remain distinct.",
        );
      }
    } catch (e) {
      setError(
        actionFailureMessage(
          e,
          "Review the actual responsibility facts, policy and evidence.",
        ),
      );
    }
  }
  return (
    <details open={open} className="maintenance-reviews">
      <summary
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        Urgency and responsibility review
      </summary>
      {open ? (
        <div className="ui-stack">
          <button type="button" disabled={busy || blocked} onClick={() => void read()}>
            Read current review context
          </button>
          <button
            type="button"
            disabled={busy || blocked}
            onClick={() => void onReadCurrent()}
          >
            Read current case
          </button>
          {context ? (
            <>
              <section>
                <h3>Recorded urgency</h3>
                <p>
                  {current?.priority} · policy{" "}
                  {current?.operating_policy_decision?.policyVersion ??
                    "existing fallback"}
                </p>
                <p>
                  {current?.operating_policy_decision?.guidance ??
                    "No original policy decision was retained for this older case."}
                </p>
                {context.urgencyNeedsReview ? (
                  <p role="status">
                    Applicable policy changed. Review this active case; its original
                    decision has been retained.
                  </p>
                ) : null}
                <p>{context.emergency.detail}</p>
                <p>{urgency.routing.detail}</p>
                {urgency.routing.contacts.map((c) => (
                  <div key={c.id}>
                    <strong>{c.responsibility}</strong>
                    <p>
                      {c.channel}: {c.destination}
                    </p>
                    <p>
                      {c.coverage} · {c.takeoverExpectation}
                    </p>
                    <p>
                      Staff verification evidence: {c.verificationEvidence}.
                      Delivery/takeover has not been executed.
                    </p>
                  </div>
                ))}
              </section>
              <fieldset disabled={disabled || ticket.status === "Closed"}>
                <legend>Review corrected urgency facts</legend>
                <label className="field">
                  Reviewed issue summary
                  <input
                    aria-label="Reviewed urgency issue summary"
                    value={summary}
                    maxLength={1000}
                    onChange={(e) => {
                      setSummary(e.target.value);
                    }}
                  />
                </label>
                <label className="field">
                  Reviewed issue facts
                  <textarea
                    aria-label="Reviewed urgency issue facts"
                    value={description}
                    maxLength={8000}
                    onChange={(e) => {
                      setDescription(e.target.value);
                    }}
                  />
                </label>
                <label className="field">
                  Happening now
                  <select
                    aria-label="Happening now"
                    value={happeningNow}
                    onChange={(e) => {
                      setHappeningNow(e.target.value as typeof happeningNow);
                    }}
                  >
                    <option value="unknown">Not established</option>
                    <option value="yes">Yes, based on actual report</option>
                    <option value="no">No, based on actual report</option>
                  </select>
                </label>
                <label className="field">
                  Actual damage or access facts
                  <textarea
                    value={damage}
                    maxLength={1000}
                    onChange={(e) => {
                      setDamage(e.target.value);
                    }}
                  />
                </label>
                <p>
                  Shared decision from these facts: {urgency.priority} · {urgency.urgency}
                </p>
                <p>{urgency.guidance}</p>
                <label className="field">
                  Urgency review reason
                  <textarea
                    aria-label="Urgency review reason"
                    value={urgencyReason}
                    maxLength={4000}
                    onChange={(e) => {
                      setUrgencyReason(e.target.value);
                    }}
                  />
                </label>
                <label className="field">
                  Actual urgency evidence (one per line)
                  <textarea
                    value={urgencyEvidence}
                    maxLength={40000}
                    onChange={(e) => {
                      setUrgencyEvidence(e.target.value);
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={!urgencyReason.trim() || !urgencyEvidence.trim()}
                  onClick={() => void saveUrgency()}
                >
                  Save staff urgency review
                </button>
              </fieldset>
              <section>
                <h3>Responsibility and proposed charge</h3>
                {decision ? (
                  <>
                    <p>
                      Version {decision.version} · {decision.state} ·{" "}
                      {formatBusinessTimestamp(decision.recordedAt)} ·{" "}
                      {decision.recordedBy}
                    </p>
                    <p>{decision.reason}</p>
                    <p>
                      {money(decision.proposedAmountCents)} ·{" "}
                      {decision.amountBasis || "No amount basis established"}
                    </p>
                    <ul>
                      {decision.allocations.map((a, i) => (
                        <li key={i}>
                          {a.party} {a.identityRef ?? ""}:{" "}
                          {(a.basisPoints / 100).toFixed(2)}% · {a.evidenceRef}
                        </li>
                      ))}
                    </ul>
                    {decision.residentConcern ? (
                      <p>Resident concern: {decision.residentConcern}</p>
                    ) : null}
                    <p>
                      This is staff-recorded responsibility and a proposal. No ledger
                      charge or verified payment derives from it.
                    </p>
                  </>
                ) : (
                  <p>
                    Responsibility is pending assessment/review. No liability or amount is
                    inferred.
                  </p>
                )}
                {context.responsibilityNeedsReview ? (
                  <p role="status">
                    Assessment, association or applicable policy changed. The prior
                    decision remains in history and needs fresh review.
                  </p>
                ) : null}
                <p>{context.chargeback.detail}</p>
                {context.approvedGuidance ? (
                  <div>
                    <h4>Applicable reviewed guidance</h4>
                    <p className="preserve-lines">{context.approvedGuidance}</p>
                    <button
                      type="button"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(context.approvedGuidance!)
                          .then(() =>
                            setStatus("Reviewed actual guidance copied for staff use."),
                          )
                          .catch(() =>
                            setError(
                              "Copy is unavailable. Select the displayed wording.",
                            ),
                          )
                      }
                    >
                      Copy reviewed responsibility guidance
                    </button>
                    <a
                      href={workflowComposerHref({
                        ticketId: ticket.id,
                        purpose: "maintenance_owner",
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Prepare linked owner communication in a new tab
                    </a>
                  </div>
                ) : (
                  <p>{context.guidanceHold}</p>
                )}
              </section>
              <fieldset disabled={disabled}>
                <legend>Record, dispute or correct staff responsibility review</legend>
                <label className="field">
                  Responsibility review state
                  <select
                    aria-label="Responsibility review state"
                    value={reviewState}
                    onChange={(e) => {
                      setReviewState(e.target.value as typeof reviewState);
                    }}
                  >
                    <option value="pending_assessment">Pending assessment</option>
                    <option value="needs_review">Needs staff review</option>
                    <option value="reviewed">Reviewed actual allocation</option>
                    <option value="disputed">Disputed; needs review</option>
                  </select>
                </label>
                {reviewState === "reviewed" ? (
                  <>
                    <p>
                      Actual approved policy and completed assessment are required.
                      Supported parties use this case’s verified lease, event-date owner
                      or actual assigned vendor.
                    </p>
                    {allocations.map((a, i) => (
                      <div key={i}>
                        <label className="field">
                          Actual party {i + 1}
                          <select
                            value={a.party}
                            onChange={(e) => {
                              setAllocations((rows) =>
                                rows.map((x, n) =>
                                  n === i
                                    ? { ...x, party: e.target.value as typeof x.party }
                                    : x,
                                ),
                              );
                            }}
                          >
                            <option value="resident">
                              Resident at the verified event-date lease
                            </option>
                            <option value="owner">Recorded event-date owner</option>
                            <option value="vendor">Actual case vendor</option>
                            <option value="pmi">PMI</option>
                          </select>
                        </label>
                        <label className="field">
                          Responsibility percent {i + 1}
                          <input
                            value={a.percent}
                            inputMode="decimal"
                            onChange={(e) => {
                              setAllocations((rows) =>
                                rows.map((x, n) =>
                                  n === i ? { ...x, percent: e.target.value } : x,
                                ),
                              );
                            }}
                          />
                        </label>
                        <label className="field">
                          Party evidence {i + 1}
                          <input
                            value={a.evidenceRef}
                            maxLength={2000}
                            onChange={(e) => {
                              setAllocations((rows) =>
                                rows.map((x, n) =>
                                  n === i ? { ...x, evidenceRef: e.target.value } : x,
                                ),
                              );
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setAllocations((rows) => rows.filter((_, n) => n !== i));
                          }}
                        >
                          Remove allocation {i + 1}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={allocations.length >= 10}
                      onClick={() => {
                        setAllocations((rows) => [
                          ...rows,
                          {
                            party: "pmi",
                            percent: rows.length ? "" : "100",
                            evidenceRef: "",
                          },
                        ]);
                      }}
                    >
                      Add actual responsibility allocation
                    </button>
                    <label className="field">
                      Known proposed amount (blank when unknown)
                      <input
                        value={amount}
                        inputMode="decimal"
                        onChange={(e) => {
                          setAmount(e.target.value);
                        }}
                      />
                    </label>
                    <label className="field">
                      Actual proposed amount basis
                      <textarea
                        value={basis}
                        maxLength={2000}
                        onChange={(e) => {
                          setBasis(e.target.value);
                        }}
                      />
                    </label>
                  </>
                ) : null}
                <label className="field">
                  Actual review evidence (one per line)
                  <textarea
                    value={evidence}
                    maxLength={60000}
                    onChange={(e) => {
                      setEvidence(e.target.value);
                    }}
                  />
                </label>
                <label className="field">
                  Actual lease or agreement evidence (one per line)
                  <textarea
                    value={leaseEvidence}
                    maxLength={40000}
                    onChange={(e) => {
                      setLeaseEvidence(e.target.value);
                    }}
                  />
                </label>
                <label className="field">
                  Responsibility decision, dispute or correction reason
                  <textarea
                    aria-label="Responsibility review reason"
                    value={reason}
                    maxLength={4000}
                    onChange={(e) => {
                      setReason(e.target.value);
                    }}
                  />
                </label>
                <label className="field">
                  Actual resident concern or refusal (optional)
                  <textarea
                    value={concern}
                    maxLength={4000}
                    onChange={(e) => {
                      setConcern(e.target.value);
                    }}
                  />
                </label>
                <p>
                  Concern or refusal is recorded for staff follow-up. It does not cancel
                  maintenance, close the case or establish agreement to pay.
                </p>
                <button
                  type="button"
                  disabled={!reason.trim()}
                  onClick={() => void saveResponsibility()}
                >
                  Save staff responsibility review
                </button>
              </fieldset>
            </>
          ) : (
            <p>
              Read current actual policy before making a new review. Existing urgent
              guidance remains available.
            </p>
          )}
          {status ? <p role="status">{status}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
        </div>
      ) : null}
    </details>
  );
}
