"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { RenewalFlagView, RenewalRunView } from "@/lib/lease-renewal/run-view";
import { displaySourceLabel } from "@/lib/lease-renewal/source-display";
import { ReasonCodeSelect } from "@/components/lease-renewal/ReasonCodeSelect";
import { RenewalReviewMode } from "@/components/lease-renewal/RenewalReviewMode";
import {
  FlagResolveForm,
  WritebackApprovalControl,
  WritebackProposalCard,
} from "@/components/lease-renewal/flag-actions";

interface LeaseRenewalRunClientProps {
  view: RenewalRunView;
  canResolve: boolean;
  canDefer?: boolean;
  isAdmin: boolean;
  resolutionsError: boolean;
  /** Field key from a ?flag= deep link: that flag's card is highlighted and scrolled into view. */
  highlightFieldKey?: string | null;
}

export function LeaseRenewalRunClient({
  view,
  canResolve,
  canDefer,
  isAdmin,
  resolutionsError,
  highlightFieldKey = null,
}: LeaseRenewalRunClientProps) {
  const canSaveProgress = canDefer ?? canResolve;
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

      <RenewalReviewMode
        canDefer={canSaveProgress}
        canResolve={canResolve}
        isAdmin={isAdmin}
        view={view}
      >
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
      </RenewalReviewMode>
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
  const [reasonCode, setReasonCode] = useState("");
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
          reason_code: reasonCode || undefined,
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
      setReasonCode("");
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
        <ReasonCodeSelect value={reasonCode} onChange={setReasonCode} />
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
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (highlighted) {
      cardRef.current?.scrollIntoView({ block: "center" });
    }
  }, [highlighted]);

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

      <FlagResolveForm
        canResolve={canResolve}
        flag={flag}
        isAdmin={isAdmin}
        runId={runId}
      />
    </article>
  );
}
