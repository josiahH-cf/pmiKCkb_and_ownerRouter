"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { RenewalFlagView, RenewalRunView } from "@/lib/lease-renewal/run-view";
import type { WritebackProposal } from "@/lib/lease-renewal/writeback-proposal";

type ResolveKind = "pick_source" | "corrected_value" | "flag_incorrect";

interface LeaseRenewalRunClientProps {
  view: RenewalRunView;
  canResolve: boolean;
  isAdmin: boolean;
  resolutionsError: boolean;
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
}: LeaseRenewalRunClientProps) {
  return (
    <div className="lr-run">
      <p className="workflow-test-banner">
        Simulation-only — synthetic sample data. This run performs no live read, no write,
        and no system-of-record update.
      </p>

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
                canResolve={canResolve}
                flag={flag}
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

// Read-only append-only write-back proposal (Q-WRITEBACK-METHOD). Value-bearing — shown only inside the
// authenticated run evidence. It never executes: approving is out of scope until an approved per-action
// spec, and the write is append-only (a new column), never an overwrite.
function WritebackProposalCard({
  proposal,
  canResolve,
}: {
  proposal: WritebackProposal;
  canResolve: boolean;
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
          <strong>{proposal.sourceSystem}</strong> to a new{" "}
          <strong>{proposal.proposedColumnHeader}</strong> column.
        </p>
      ) : (
        <p className="muted">{proposal.rationale}</p>
      )}
      <p className="muted">
        Suggestion only — needs approval; appended to a new column, never overwrites an
        existing cell; not executed here (writing to the operating Sheet needs an approved
        action spec).
      </p>
      {ready && proposal.sourceSystem ? (
        <p className="muted">
          {canResolve ? (
            <>
              To approve: resolve the flag below — choose{" "}
              <strong>Pick a source → {proposal.sourceSystem}</strong>. That records the
              accepted proposal; the Sheet write itself stays gated.
            </>
          ) : (
            <>
              An approver accepts this by resolving the flag below (pick source →{" "}
              {proposal.sourceSystem}).
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}

function FlagCard({
  flag,
  runId,
  canResolve,
  isAdmin,
}: {
  flag: RenewalFlagView;
  runId: string;
  canResolve: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const requiresAdmin = flag.severity === "High" || flag.severity === "Blocked";
  const canResolveThis = canResolve && (!requiresAdmin || isAdmin);

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
    <article className="lr-flag-card">
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
            <strong>{candidate.sourceSystem}:</strong> {candidate.value}
            {candidate.confidence ? (
              <span className="muted"> ({candidate.confidence})</span>
            ) : null}{" "}
            {candidate.locationRef ? <a href={candidate.locationRef}>evidence</a> : null}
          </li>
        ))}
      </ul>

      {flag.suggestedWinner ? (
        <p className="muted">
          Suggested source: <strong>{flag.suggestedWinner.source}</strong> (suggestion
          only — needs human approval).
        </p>
      ) : flag.blockedReason ? (
        <p className="muted">Blocked: {flag.blockedReason} — needs a human decision.</p>
      ) : null}

      {flag.writeback ? (
        <WritebackProposalCard proposal={flag.writeback} canResolve={canResolveThis} />
      ) : null}

      {flag.resolution ? (
        <p className="lr-resolution">
          <strong>{flag.resolution.status}</strong>
          {flag.resolution.kind ? ` via ${KIND_LABEL[flag.resolution.kind]}` : null}
          {flag.resolution.chosenSource ? ` → ${flag.resolution.chosenSource}` : null}
          {flag.resolution.correctedValue
            ? ` → "${flag.resolution.correctedValue}"`
            : null}
          {flag.resolution.reason ? ` — ${flag.resolution.reason}` : null}
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
                      {candidate.sourceSystem} ({candidate.value})
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
