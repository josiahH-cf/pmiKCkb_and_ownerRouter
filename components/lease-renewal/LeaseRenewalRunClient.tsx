"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  RenewalFlagView,
  RenewalRunView,
  RenewalWritebackApprovalActivityView,
  RenewalWritebackApprovalView,
} from "@/lib/lease-renewal/run-view";
import type { WritebackProposal } from "@/lib/lease-renewal/writeback-proposal";
import { displaySourceLabel } from "@/lib/lease-renewal/source-display";

type ResolveKind = "pick_source" | "corrected_value" | "flag_incorrect";

// "return" reads as a Revoke once a proposal is Approved, but the append-only Activity records the raw
// decision verb; label both approve/return consistently in the human-facing trail.
const DECISION_LABEL: Record<RenewalWritebackApprovalActivityView["action"], string> = {
  approve: "Approved",
  return: "Returned / revoked",
};

interface LeaseRenewalRunClientProps {
  view: RenewalRunView;
  canResolve: boolean;
  isAdmin: boolean;
  resolutionsError: boolean;
  /** Field key from a ?flag= deep link: that flag's card is highlighted and scrolled into view. */
  highlightFieldKey?: string | null;
}

const KIND_LABEL: Record<ResolveKind, string> = {
  pick_source: "Pick a source",
  corrected_value: "Enter a corrected value",
  flag_incorrect: "Flag is wrong / sheet is right",
};

export function LeaseRenewalRunClient({
  view,
  canResolve,
  isAdmin,
  resolutionsError,
  highlightFieldKey = null,
}: LeaseRenewalRunClientProps) {
  // Bulk decisions (S13 B2) live HERE on the run page, where the proposed values are visible —
  // never on the value-free queue tabs. Selection is keyed by sourceTriggerKey and derived against
  // the current view on every render, so a flag that stops being queued silently drops out.
  const eligibleFlags = view.groups.flatMap((group) =>
    group.flags.filter((flag) => flag.writebackApproval !== null),
  );
  const bulkEnabled = isAdmin && eligibleFlags.length >= 2;
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
  const selectedEligible = eligibleFlags.filter((flag) =>
    selectedKeys.has(flag.sourceTriggerKey),
  );

  function toggleSelected(key: string) {
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="lr-run">
      <p className="workflow-test-banner">
        Test run only, on sample data. This run performs no live read, no write, and no
        system-of-record update.
      </p>

      {bulkEnabled ? (
        <WritebackBulkDecisionBar
          eligible={eligibleFlags.map((flag) => ({
            key: flag.sourceTriggerKey,
            label: flag.fieldLabel,
          }))}
          onClearSelection={() => setSelectedKeys(new Set())}
          onSelectAll={() =>
            setSelectedKeys(new Set(eligibleFlags.map((flag) => flag.sourceTriggerKey)))
          }
          runId={view.runId}
          selected={selectedEligible.map((flag) => ({
            key: flag.sourceTriggerKey,
            label: flag.fieldLabel,
          }))}
        />
      ) : null}

      <section className="panel" aria-label="Run summary">
        <h2 className="section-subtitle">{view.label}</h2>
        <p className="muted">
          {view.totalFlags} flag{view.totalFlags === 1 ? "" : "s"} raised ·{" "}
          {view.resolvedCount} resolved
        </p>
        <div className="queue-detail-grid">
          <SummaryField label="Tabs recognized" value={view.manifest.tabsRecognized} />
          <SummaryField
            label="Tabs unrecognized"
            value={view.manifest.tabsUnrecognized}
          />
          <SummaryField label="Records read" value={view.manifest.totalRecords} />
          <SummaryField
            label="Credential tabs excluded"
            value={view.manifest.credentialTabsExcluded}
          />
          <SummaryField
            label="Credential scrub hits"
            value={view.manifest.credentialScrubHits}
          />
          <SummaryField
            label="Divider rows dropped"
            value={view.manifest.dividerRowsDropped}
          />
        </div>
        {view.excludedTabs.length > 0 ? (
          <div className="lr-excluded">
            <h3 className="section-subtitle">Excluded tabs (labels only)</h3>
            <ul>
              {view.excludedTabs.map((excluded, index) => (
                <li key={`${excluded.tab}-${index}`}>
                  <strong>{excluded.tab}</strong> — {excluded.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {resolutionsError ? (
        <p className="workflow-blocker">
          Saved resolutions could not be loaded (Firestore unavailable). Flags below are
          shown unresolved; resolving requires a working Firestore connection.
        </p>
      ) : null}

      {view.groups.length === 0 ? (
        <article className="panel">
          <p className="muted">No flags were raised for this run.</p>
        </article>
      ) : (
        view.groups.map((group) => (
          <section
            className="panel"
            key={group.severity}
            aria-label={`${group.severity} flags`}
          >
            <h2 className="section-subtitle">
              <span className="queue-pill" data-value={group.severity}>
                {group.severity}
              </span>{" "}
              {group.flags.length} flag{group.flags.length === 1 ? "" : "s"}
            </h2>
            {group.flags.map((flag) => (
              <FlagCard
                bulk={
                  bulkEnabled && flag.writebackApproval
                    ? {
                        selected: selectedKeys.has(flag.sourceTriggerKey),
                        onToggle: () => toggleSelected(flag.sourceTriggerKey),
                      }
                    : null
                }
                canResolve={canResolve}
                flag={flag}
                highlighted={flag.fieldKey === highlightFieldKey}
                isAdmin={isAdmin}
                key={flag.sourceTriggerKey}
                runId={view.runId}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: number }) {
  return (
    <div className="queue-detail-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface BulkItemOutcome {
  label: string;
  ok: boolean;
  message: string;
}

// Admin-only bulk decision bar (S13 B2): approve or return SEVERAL queued write-back proposals with
// ONE shared mandatory reason. Lives only on the run page, where the proposed values are visible.
// The server loops the existing per-proposal transaction, so each item still gets its own decision
// record + Activity row (stamped with the shared reason) and per-item failures never block the rest.
function WritebackBulkDecisionBar({
  runId,
  eligible,
  selected,
  onSelectAll,
  onClearSelection,
}: {
  runId: string;
  eligible: { key: string; label: string }[];
  selected: { key: string; label: string }[];
  onSelectAll: () => void;
  onClearSelection: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState<null | "approve" | "return">(null);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<BulkItemOutcome[] | null>(null);

  async function decideSelected(decision: "approve" | "return") {
    setError(null);
    if (selected.length === 0) {
      setError("Tick at least one queued write-back below.");
      return;
    }
    if (!reason.trim()) {
      setError("A plain-English reason is required. It is saved on every selected item.");
      return;
    }
    setSubmitting(decision);
    const labelByKey = new Map(selected.map((item) => [item.key, item.label]));
    try {
      const response = await fetch("/api/lease-renewal/writeback-approvals/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          source_trigger_keys: selected.map((item) => item.key),
          decision,
          reason: reason.trim(),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Could not record the bulk decision.");
        return;
      }
      const body = (await response.json()) as {
        results: {
          source_trigger_key: string;
          ok: boolean;
          state?: string;
          error?: string;
        }[];
      };
      setOutcomes(
        body.results.map((result) => ({
          label: labelByKey.get(result.source_trigger_key) ?? result.source_trigger_key,
          ok: result.ok,
          message: result.ok
            ? result.state === "Approved"
              ? "Approved (nothing written)"
              : "Returned for revision"
            : (result.error ?? "This decision could not be recorded."),
        })),
      );
      setReason("");
      onClearSelection();
      router.refresh();
    } catch {
      setError("Could not reach the approval endpoint.");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <section className="panel lr-bulk-bar" aria-label="Bulk write-back decision">
      <h2 className="section-subtitle">Decide several write-backs at once</h2>
      <p className="muted">
        {selected.length} of {eligible.length} queued write-backs selected. Tick the boxes
        on the flags below, then approve or return them together with one shared reason.
        Each item keeps its own decision record and history entry.
      </p>
      <div className="lr-approve-actions">
        <button className="secondary-button" onClick={onSelectAll} type="button">
          Select all queued
        </button>
        <button className="secondary-button" onClick={onClearSelection} type="button">
          Clear selection
        </button>
      </div>
      <div className="lr-approve-form">
        <label>
          Reason (required, saved on every selected item)
          <textarea
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            value={reason}
          />
        </label>
        {error ? <p className="lr-error">{error}</p> : null}
        <div className="lr-approve-actions">
          <button
            disabled={submitting !== null}
            onClick={() => decideSelected("approve")}
            type="button"
          >
            {submitting === "approve" ? "Saving…" : "Approve selected"}
          </button>
          <button
            className="secondary-button"
            disabled={submitting !== null}
            onClick={() => decideSelected("return")}
            type="button"
          >
            {submitting === "return" ? "Saving…" : "Return selected"}
          </button>
        </div>
        <p className="muted">
          Approving records your authorization for the future append-only Sheet write.
          Nothing is written to the Sheet here.
        </p>
      </div>
      {outcomes ? (
        <div className="lr-bulk-results" aria-label="Bulk decision results">
          <p className="muted">Results</p>
          <ul>
            {outcomes.map((outcome, index) => (
              <li key={`${outcome.label}-${index}`}>
                <strong>{outcome.label}:</strong>{" "}
                {outcome.ok ? (
                  outcome.message
                ) : (
                  <span className="lr-error">{outcome.message}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// Read-only append-only write-back proposal (Q-WRITEBACK-METHOD). Value-bearing — shown only inside the
// authenticated run evidence. It never executes: the write is append-only (a new column), never an
// overwrite, and stays gated. Resolving the flag QUEUES it; an Admin then approves it below.
function WritebackProposalCard({
  proposal,
  queued,
}: {
  proposal: WritebackProposal;
  queued: boolean;
}) {
  const ready = proposal.status === "Proposed";
  return (
    <div className="lr-writeback" aria-label="Append-only write-back proposal">
      <p className="lr-writeback-head">
        <span
          className="queue-pill"
          data-value={ready ? "Ready for Approval" : "Needs Attention"}
        >
          {ready ? "Proposal ready" : "Needs input"}
        </span>{" "}
        <strong>Append-only sheet write-back</strong>
      </p>
      {proposal.proposedValue !== null ? (
        <p>
          Would append <strong>{proposal.proposedValue}</strong> from{" "}
          <strong>{displaySourceLabel(proposal.sourceSystem)}</strong> to a new{" "}
          <strong>{proposal.proposedColumnHeader}</strong> column.
        </p>
      ) : (
        <p className="muted">{proposal.rationale}</p>
      )}
      <p className="muted">
        Suggestion only — appended to a new column, never overwrites an existing cell; not
        executed here (writing to the operating Sheet needs an approved action spec).
      </p>
      {ready && !queued ? (
        <p className="muted">
          Resolve the flag below to queue this proposal for an Admin&apos;s approval; the
          Sheet write itself stays gated.
        </p>
      ) : null}
    </div>
  );
}

// Admin-only approval control for a QUEUED write-back proposal (Phase-2 control plane). Approving
// records human authorization for the future, gated write — it does NOT execute anything. The
// available decisions mirror the approval state machine exactly (approve/revoke from the current
// state); the reason is mandatory and audited.
function WritebackApprovalControl({
  approval,
  runId,
  sourceTriggerKey,
  isAdmin,
}: {
  approval: RenewalWritebackApprovalView;
  runId: string;
  sourceTriggerKey: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState<null | "approve" | "return">(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "return") {
    setError(null);
    if (!reason.trim()) {
      setError("A plain-English reason is required.");
      return;
    }
    setSubmitting(decision);
    try {
      const response = await fetch("/api/lease-renewal/writeback-approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          source_trigger_key: sourceTriggerKey,
          decision,
          reason: reason.trim(),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Could not record the approval decision.");
        return;
      }
      setReason("");
      router.refresh();
    } catch {
      setError("Could not reach the approval endpoint.");
    } finally {
      setSubmitting(null);
    }
  }

  const stateLabel =
    approval.state === "Approved"
      ? "Approved — ready to write (not executed)"
      : approval.state === "Returned for Revision"
        ? "Returned for revision — re-resolve or re-approve"
        : approval.stale
          ? "Awaiting approval — queued value changed, re-approve"
          : "Awaiting your approval";
  const pillValue =
    approval.state === "Approved"
      ? "Approved"
      : approval.state === "Returned for Revision"
        ? "Returned"
        : "Ready for Approval";

  return (
    <div className="lr-writeback-approval" aria-label="Write-back proposal approval">
      <p className="lr-writeback-head">
        <span className="queue-pill" data-value={pillValue}>
          {stateLabel}
        </span>{" "}
        <strong>Write-back approval</strong>
      </p>
      {approval.reason ? (
        <p className="muted">Last decision reason: {approval.reason}</p>
      ) : null}
      {isAdmin ? (
        <div className="lr-approve-form">
          <label>
            Reason (required)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
            />
          </label>
          {error ? <p className="lr-error">{error}</p> : null}
          <div className="lr-approve-actions">
            {approval.state !== "Approved" ? (
              <button
                type="button"
                disabled={submitting !== null}
                onClick={() => decide("approve")}
              >
                {submitting === "approve" ? "Saving…" : "Approve proposal"}
              </button>
            ) : null}
            {approval.state !== "Returned for Revision" ? (
              <button
                type="button"
                className="secondary-button"
                disabled={submitting !== null}
                onClick={() => decide("return")}
              >
                {submitting === "return"
                  ? "Saving…"
                  : approval.state === "Approved"
                    ? "Revoke approval"
                    : "Return for revision"}
              </button>
            ) : null}
          </div>
          <p className="muted">
            Approving records your authorization for the future append-only Sheet write.
            It is not executed here — the write itself stays gated behind an approved
            action spec.
          </p>
        </div>
      ) : (
        <p className="muted">An Admin approves the queued write-back proposal.</p>
      )}

      <WritebackApprovalTimeline activity={approval.activity} />
    </div>
  );
}

// Read-only append-only audit trail of the approve / return / revoke decisions on this queued
// proposal — who, when, and why — under the approval control. Completes the auditability of the
// governance control; it records nothing and executes nothing. Oldest → newest (newest last).
function WritebackApprovalTimeline({
  activity,
}: {
  activity?: RenewalWritebackApprovalActivityView[];
}) {
  if (!activity || activity.length === 0) {
    return null;
  }
  return (
    <div className="lr-writeback-activity" aria-label="Write-back approval history">
      <p className="muted">Decision history</p>
      <ol className="lr-writeback-trail">
        {activity.map((entry, index) => (
          <li key={`${entry.createdAt}-${index}`}>
            <strong>{DECISION_LABEL[entry.action]}</strong> by {entry.decidedByUid} —{" "}
            {entry.reason} <span className="muted">({entry.createdAt})</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function FlagCard({
  flag,
  runId,
  canResolve,
  isAdmin,
  bulk,
  highlighted,
}: {
  flag: RenewalFlagView;
  runId: string;
  canResolve: boolean;
  isAdmin: boolean;
  /** Multi-select hook for the run-page bulk decision bar (Admin + queued proposal only). */
  bulk: { selected: boolean; onToggle: () => void } | null;
  /** True when a ?flag= deep link targets this card: highlight it and scroll it into view (C1). */
  highlighted: boolean;
}) {
  const router = useRouter();
  const requiresAdmin = flag.severity === "High" || flag.severity === "Blocked";
  const canResolveThis = canResolve && (!requiresAdmin || isAdmin);

  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (highlighted) {
      cardRef.current?.scrollIntoView({ block: "center" });
    }
  }, [highlighted]);

  const [kind, setKind] = useState<ResolveKind>(
    flag.candidates.length > 0 ? "pick_source" : "corrected_value",
  );
  const [chosenSource, setChosenSource] = useState<string>(
    flag.candidates[0]?.source ?? "",
  );
  const [correctedValue, setCorrectedValue] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!reason.trim()) {
      setError("A plain-English reason is required.");
      return;
    }
    if (kind === "corrected_value" && !correctedValue.trim()) {
      setError("Enter the corrected value.");
      return;
    }
    if (
      flag.severity === "High" &&
      !window.confirm("This is a High-severity resolution. Continue?")
    ) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/lease-renewal/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          source_trigger_key: flag.sourceTriggerKey,
          kind,
          chosen_source: kind === "pick_source" ? chosenSource : undefined,
          corrected_value: kind === "corrected_value" ? correctedValue : undefined,
          reason: reason.trim(),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Could not save the resolution.");
        return;
      }
      setReason("");
      setCorrectedValue("");
      router.refresh();
    } catch {
      setError("Could not reach the resolution endpoint.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article
      className={highlighted ? "lr-flag-card lr-flag-highlight" : "lr-flag-card"}
      id={`flag-${flag.fieldKey}`}
      ref={cardRef}
    >
      <header className="lr-flag-head">
        <strong>{flag.fieldLabel}</strong>
        <span className="queue-pill" data-value={flag.severity}>
          {flag.severity}
        </span>
        <span className="muted">{flag.agreement}</span>
      </header>

      <p>{flag.actionNeeded}</p>

      <ul className="lr-candidates">
        {flag.candidates.map((candidate, index) => (
          <li key={`${candidate.source}-${index}`}>
            <strong>{displaySourceLabel(candidate.sourceSystem)}:</strong>{" "}
            {candidate.value}
            {candidate.confidence ? (
              <span className="muted"> ({candidate.confidence})</span>
            ) : null}{" "}
            {candidate.locationRef ? <a href={candidate.locationRef}>evidence</a> : null}
          </li>
        ))}
      </ul>

      {flag.suggestedWinner ? (
        <p className="muted">
          Suggested source:{" "}
          <strong>{displaySourceLabel(flag.suggestedWinner.source)}</strong> (
          {flag.suggestedWinner.value}). Suggestion only, needs human approval.
        </p>
      ) : flag.blockedReason ? (
        <p className="muted">Blocked: {flag.blockedReason}. Needs a human decision.</p>
      ) : null}

      {flag.writeback ? (
        <WritebackProposalCard
          proposal={flag.writeback}
          queued={flag.writebackApproval !== null}
        />
      ) : null}

      {bulk ? (
        <label className="lr-bulk-select">
          <input checked={bulk.selected} onChange={bulk.onToggle} type="checkbox" />
          Include in the bulk decision above
        </label>
      ) : null}

      {flag.writebackApproval ? (
        <WritebackApprovalControl
          approval={flag.writebackApproval}
          runId={runId}
          sourceTriggerKey={flag.sourceTriggerKey}
          isAdmin={isAdmin}
        />
      ) : null}

      {flag.resolution ? (
        <p className="lr-resolution">
          <strong>{flag.resolution.status}</strong>
          {flag.resolution.kind ? ` via ${KIND_LABEL[flag.resolution.kind]}` : null}
          {flag.resolution.chosenSource
            ? ` → ${displaySourceLabel(flag.resolution.chosenSource)}`
            : null}
          {flag.resolution.correctedValue
            ? ` → "${flag.resolution.correctedValue}"`
            : null}
          {flag.resolution.reason ? `: ${flag.resolution.reason}` : null}
        </p>
      ) : null}

      {canResolve ? (
        canResolveThis ? (
          <div className="lr-resolve-form">
            <label>
              Resolution
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as ResolveKind)}
              >
                {flag.candidates.length > 0 ? (
                  <option value="pick_source">{KIND_LABEL.pick_source}</option>
                ) : null}
                <option value="corrected_value">{KIND_LABEL.corrected_value}</option>
                <option value="flag_incorrect">{KIND_LABEL.flag_incorrect}</option>
              </select>
            </label>

            {kind === "pick_source" ? (
              <label>
                Source
                <select
                  value={chosenSource}
                  onChange={(event) => setChosenSource(event.target.value)}
                >
                  {flag.candidates.map((candidate, index) => (
                    <option key={`${candidate.source}-${index}`} value={candidate.source}>
                      {displaySourceLabel(candidate.sourceSystem)} ({candidate.value})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {kind === "corrected_value" ? (
              <label>
                Corrected value
                <input
                  type="text"
                  value={correctedValue}
                  onChange={(event) => setCorrectedValue(event.target.value)}
                />
              </label>
            ) : null}

            <label>
              Reason (required)
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
              />
            </label>

            {error ? <p className="lr-error">{error}</p> : null}

            <button type="button" disabled={submitting} onClick={submit}>
              {submitting ? "Saving…" : flag.resolution ? "Re-resolve" : "Resolve"}
            </button>
          </div>
        ) : (
          <p className="muted">An Admin must resolve High and Blocked flags.</p>
        )
      ) : (
        <p className="muted">Approver or Admin access is required to resolve flags.</p>
      )}
    </article>
  );
}
