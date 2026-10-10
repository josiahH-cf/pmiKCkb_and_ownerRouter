"use client";
import { useState } from "react";
import {
  MAINTENANCE_STAGE_LABELS,
  MAINTENANCE_STAGE_TRANSITIONS,
  maintenanceStage,
  maintenanceAging,
  type MaintenanceStage,
} from "@/lib/maintenance/lifecycle";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import { formatPreapprovalAmount } from "@/lib/maintenance/property-preapproval";
export function MaintenanceLifecyclePanel({
  ticket,
  canEdit,
  pending,
  onApply,
}: Readonly<{
  ticket: MaintenanceTicketRecord;
  canEdit: boolean;
  pending: boolean;
  onApply: (command: Record<string, unknown>) => Promise<boolean>;
}>) {
  const stage = maintenanceStage(ticket),
    age = maintenanceAging(ticket);
  const [outcome, setOutcome] = useState(
      ticket.assessment?.outcome ?? "needs_information",
    ),
    [scope, setScope] = useState(ticket.assessment?.scope ?? ""),
    [evidence, setEvidence] = useState(ticket.assessment?.evidence_refs.join("\n") ?? ""),
    [next, setNext] = useState<MaintenanceStage | null>(null),
    [reason, setReason] = useState(""),
    [decision, setDecision] = useState("approved"),
    [decisionEvidence, setDecisionEvidence] = useState(""),
    [basis, setBasis] = useState(false);
  const refs = (value: string) =>
      value
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean),
    allowed = MAINTENANCE_STAGE_TRANSITIONS[stage].filter(
      (s) => s !== "assessment" || ticket.status !== "Closed",
    ),
    selected = next && allowed.includes(next) ? next : (allowed[0] ?? null);
  return (
    <section
      aria-label={`Assessment and lifecycle for ${ticket.summary}`}
      className="ui-stack"
    >
      <h4>{MAINTENANCE_STAGE_LABELS[stage]}</h4>
      <p>
        {age.createdDays} calendar days since creation · {age.progressDays} since{" "}
        {age.progressKnown
          ? "last meaningful progress"
          : "creation (earlier progress not recorded)"}{" "}
        · {age.timeZone}
        {age.aging ? " · Aging: unresolved for at least three calendar days" : ""}
      </p>
      {ticket.lifecycle_origin === "legacy_starting_state" || !ticket.lifecycle_origin ? (
        <p className="muted">
          Existing case: earlier activity is not being backfilled. Current starting facts
          and subsequent work remain attributable.
        </p>
      ) : null}
      {ticket.assessment ? (
        <p>
          Assessment by {ticket.assessment.recorded_by_uid}: {ticket.assessment.scope}
        </p>
      ) : (
        <p>Assess the issue and troubleshooting first. An owner email is optional.</p>
      )}
      {canEdit && ticket.status !== "Closed" ? (
        <form
          className="ui-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            await onApply({
              op: "assessment",
              outcome,
              scope,
              evidence_refs: refs(evidence),
            });
          }}
        >
          <label className="field">
            Assessment outcome
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as typeof outcome)}
              disabled={pending}
            >
              <option value="needs_information">Needs information</option>
              <option value="resolved_troubleshooting">
                Resolved by troubleshooting
              </option>
              <option value="estimate_needed">Estimate needed</option>
              <option value="work_required">Work required</option>
            </select>
          </label>
          <label className="field">
            Issue assessment and proposed work
            <textarea
              required
              maxLength={4000}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              disabled={pending}
            />
          </label>
          <label className="field">
            Retained assessment evidence references (one per line)
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              disabled={pending}
            />
          </label>
          <button type="submit" disabled={pending || !scope.trim()}>
            Save assessment
          </button>
        </form>
      ) : null}
      {canEdit &&
      ticket.assessment?.outcome === "work_required" &&
      ticket.status !== "Closed" ? (
        <details>
          <summary>Record an actual owner decision</summary>
          <form
            className="ui-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await onApply({
                  op: "owner-decision",
                  decision,
                  cost_basis: "total_including_tax_and_markup",
                  evidence_ref: decisionEvidence,
                  reason,
                })
              )
                setReason("");
            }}
          >
            <p>
              Current total estimate:{" "}
              {ticket.estimate_amount_cents
                ? formatPreapprovalAmount(ticket.estimate_amount_cents)
                : "Not recorded"}
              . Record the decision that actually occurred; this saves no provider
              approval or message.
            </p>
            <label className="field">
              Owner decision
              <select value={decision} onChange={(e) => setDecision(e.target.value)}>
                <option value="approved">Approved</option>
                <option value="declined">Declined</option>
                <option value="needs_changes">Needs changes</option>
              </select>
            </label>
            <label className="field">
              Decision evidence reference
              <input
                required
                maxLength={1000}
                value={decisionEvidence}
                onChange={(e) => setDecisionEvidence(e.target.value)}
              />
            </label>
            <label className="field">
              <input
                type="checkbox"
                checked={basis}
                onChange={(e) => setBasis(e.target.checked)}
              />
              The exact decision covers this total including tax and PMI markup
            </label>
            <label className="field">
              Reason
              <textarea
                required
                value={reason}
                maxLength={4000}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              disabled={
                pending ||
                !basis ||
                !ticket.estimate_amount_cents ||
                !decisionEvidence.trim() ||
                !reason.trim()
              }
            >
              Record owner decision
            </button>
          </form>
        </details>
      ) : null}
      {canEdit ? (
        <form
          className="ui-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const command =
              ticket.status === "Closed"
                ? { op: "reopen", reason }
                : {
                    op: "lifecycle",
                    stage: selected,
                    reason,
                    evidence_refs: refs(evidence),
                  };
            if (await onApply(command)) setReason("");
          }}
        >
          {ticket.status === "Closed" ? (
            <p>
              Reopen this case for assessment. Retained closeout and financial evidence
              stay in history.
            </p>
          ) : (
            <label className="field">
              Next case stage
              <select
                value={selected ?? ""}
                onChange={(e) => setNext(e.target.value as MaintenanceStage)}
                disabled={pending}
              >
                {allowed.map((s) => (
                  <option key={s} value={s}>
                    {MAINTENANCE_STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Reason for the stage change
            <textarea
              required
              value={reason}
              maxLength={4000}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
            />
          </label>
          <button
            disabled={
              pending || !reason.trim() || (!selected && ticket.status !== "Closed")
            }
          >
            {ticket.status === "Closed" ? "Reopen for assessment" : "Apply case stage"}
          </button>
        </form>
      ) : null}
      <p className="muted">
        PMI makes the final closure decision. Case status does not prove provider
        completion, invoicing, accounting posting or payment.
      </p>
    </section>
  );
}
