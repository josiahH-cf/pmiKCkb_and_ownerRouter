"use client";

import { useMemo, useState } from "react";

import { Button, Disclosure, Field } from "@/components/ui";
import { ReasonCodeSelect } from "@/components/lease-renewal/ReasonCodeSelect";
import {
  FlagResolveForm,
  WritebackApprovalControl,
  WritebackProposalCard,
} from "@/components/lease-renewal/flag-actions";
import {
  DECISION_REASON_CODE_LABELS,
  type DecisionReasonCode,
} from "@/lib/lease-renewal/reason-codes";
import type { RenewalFlagView, RenewalManifestView } from "@/lib/lease-renewal/run-view";
import { displaySourceLabel } from "@/lib/lease-renewal/source-display";

type ManualKind = "pick_source" | "corrected_value" | "flag_incorrect";

const AGREEMENT_LABEL: Record<string, string> = {
  conflict: "Two sources disagree",
  single_source: "Only one source has this",
  missing: "Missing from every source",
  agree: "Sources agree",
};

function responseError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string") return error;
  }
  return fallback;
}

/** The single value-bearing decision card shown by RenewalDecider. */
export function RenewalDeciderCard({
  flag,
  manifest,
  runId,
  canResolve,
  canDefer,
  isAdmin,
  skipping,
  onSkip,
  onComplete,
  onFollowOnQueued,
  optimisticFollowOnReasonCode,
}: Readonly<{
  flag: RenewalFlagView;
  manifest: RenewalManifestView;
  runId: string;
  canResolve: boolean;
  canDefer: boolean;
  isAdmin: boolean;
  skipping: boolean;
  onSkip: () => void;
  onComplete: () => void;
  onFollowOnQueued: (reasonCode: DecisionReasonCode) => void;
  optimisticFollowOnReasonCode?: DecisionReasonCode;
}>) {
  const suggestedSource = flag.suggestedWinner?.source ?? null;
  const alternativeSource = useMemo(
    () =>
      flag.candidates.find((candidate) => candidate.source !== suggestedSource)?.source ??
      "",
    [flag.candidates, suggestedSource],
  );
  const [manualKind, setManualKind] = useState<ManualKind | null>(null);
  const [manualSource, setManualSource] = useState(alternativeSource);
  const [correctedValue, setCorrectedValue] = useState("");
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [submitting, setSubmitting] = useState<null | "accept" | "manual" | "approve">(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [queuedAfterResolve, setQueuedAfterResolve] = useState(
    Boolean(optimisticFollowOnReasonCode),
  );
  const [resolvedReasonCode, setResolvedReasonCode] = useState<
    DecisionReasonCode | undefined
  >(optimisticFollowOnReasonCode ?? flag.resolution?.reasonCode);

  const isLowOrMedium = flag.severity === "Low" || flag.severity === "Medium";
  const isUnresolved = !flag.resolution || flag.resolution.status === "Open";
  const canAcceptSuggestion =
    isUnresolved && isLowOrMedium && Boolean(suggestedSource) && canResolve;
  const queued =
    queuedAfterResolve ||
    Boolean(optimisticFollowOnReasonCode) ||
    Boolean(flag.writebackApproval);
  const approvalPending = queued && flag.writebackApproval?.state !== "Approved";
  const storedCodeOnlyResolution =
    flag.resolution?.kind === "pick_source" &&
    flag.resolution.reasonCode === "accepted_suggestion" &&
    flag.resolution.reason === DECISION_REASON_CODE_LABELS.accepted_suggestion;
  const canApproveWithOneTap =
    approvalPending &&
    isAdmin &&
    resolvedReasonCode === "accepted_suggestion" &&
    isLowOrMedium &&
    (queuedAfterResolve ||
      optimisticFollowOnReasonCode === "accepted_suggestion" ||
      storedCodeOnlyResolution);

  function clearManualState() {
    setManualKind(null);
    setManualSource(alternativeSource);
    setCorrectedValue("");
    setReason("");
    setReasonCode("");
  }

  async function postResolution(body: Record<string, string>) {
    setError(null);
    const response = await fetch("/api/lease-renewal/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: runId,
        source_trigger_key: flag.sourceTriggerKey,
        ...body,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      resolution?: {
        proposed_writeback?: { status?: string };
        reason_code?: DecisionReasonCode;
      };
    } | null;
    if (!response.ok) {
      throw new Error(responseError(payload, "Could not save the resolution."));
    }
    return payload?.resolution;
  }

  async function acceptSuggestion() {
    if (!suggestedSource) return;
    setSubmitting("accept");
    setError(null);
    try {
      const resolution = await postResolution({
        kind: "pick_source",
        chosen_source: suggestedSource,
        reason_code: "accepted_suggestion",
      });
      const queuedWriteback = resolution?.proposed_writeback?.status === "Queued";
      setResolvedReasonCode("accepted_suggestion");
      clearManualState();
      if (queuedWriteback) {
        setQueuedAfterResolve(true);
        onFollowOnQueued("accepted_suggestion");
      } else {
        onComplete();
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save the resolution.",
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function submitManualResolution() {
    if (!manualKind) return;
    if (!reason.trim()) {
      setError("A plain-English reason is required.");
      return;
    }
    if (manualKind === "corrected_value" && !correctedValue.trim()) {
      setError("Enter the corrected value.");
      return;
    }
    if (manualKind === "pick_source" && !manualSource) {
      setError("Choose a source.");
      return;
    }

    setSubmitting("manual");
    setError(null);
    try {
      await postResolution({
        kind: manualKind,
        ...(manualKind === "pick_source" ? { chosen_source: manualSource } : {}),
        ...(manualKind === "corrected_value"
          ? { corrected_value: correctedValue.trim() }
          : {}),
        reason: reason.trim(),
        ...(reasonCode ? { reason_code: reasonCode } : {}),
      });
      onComplete();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save the resolution.",
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function approveWriteback() {
    if (!resolvedReasonCode) return;
    setSubmitting("approve");
    setError(null);
    try {
      const response = await fetch("/api/lease-renewal/writeback-approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          source_trigger_key: flag.sourceTriggerKey,
          decision: "approve",
          reason_code: resolvedReasonCode,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          responseError(payload, "Could not record the write-back approval."),
        );
      }
      onComplete();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not record the write-back approval.",
      );
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <article className="lr-decider-card">
      <header className="lr-flag-head">
        <strong>{flag.fieldLabel}</strong>
        <span className="queue-pill" data-value={flag.severity}>
          {flag.severity}
        </span>
        <span className="muted">{AGREEMENT_LABEL[flag.agreement] ?? flag.agreement}</span>
      </header>

      <p>{flag.actionNeeded}</p>
      <ul className="lr-candidates">
        {flag.candidates.map((candidate, index) => (
          <li key={`${candidate.source}-${index}`}>
            <strong>{displaySourceLabel(candidate.sourceSystem)}:</strong>{" "}
            {candidate.value}
            {candidate.confidence ? (
              <span className="muted"> ({candidate.confidence})</span>
            ) : null}
          </li>
        ))}
      </ul>

      {flag.suggestedWinner ? (
        <p className="lr-decider-suggestion">
          Suggested source: {displaySourceLabel(flag.suggestedWinner.source)} (
          {flag.suggestedWinner.value})
        </p>
      ) : flag.blockedReason ? (
        <p className="muted">Blocked: {flag.blockedReason}.</p>
      ) : null}

      {flag.writeback ? (
        <WritebackProposalCard proposal={flag.writeback} queued={queued} />
      ) : null}

      {canAcceptSuggestion && !queued && !manualKind ? (
        <div className="lr-decider-actions">
          <Button
            disabled={submitting !== null}
            onClick={() => void acceptSuggestion()}
            size="large"
            type="button"
          >
            {submitting === "accept" ? "Saving..." : "Accept suggested source"}
          </Button>
          <div className="lr-decider-secondary-actions">
            <button
              className="secondary-button"
              onClick={() => setManualKind("flag_incorrect")}
              type="button"
            >
              Reject
            </button>
            <button
              className="secondary-button"
              onClick={() => setManualKind("corrected_value")}
              type="button"
            >
              Correct
            </button>
            {alternativeSource ? (
              <button
                className="secondary-button"
                onClick={() => setManualKind("pick_source")}
                type="button"
              >
                Choose another source
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {manualKind && !queued ? (
        <div className="lr-decider-manual">
          <ReasonCodeSelect value={reasonCode} onChange={setReasonCode} />
          {manualKind === "pick_source" ? (
            <Field htmlFor="lr-manual-source" label="Source" required>
              <select
                id="lr-manual-source"
                onChange={(event) => setManualSource(event.target.value)}
                value={manualSource}
              >
                {flag.candidates
                  .filter((candidate) => candidate.source !== suggestedSource)
                  .map((candidate) => (
                    <option key={candidate.source} value={candidate.source}>
                      {displaySourceLabel(candidate.sourceSystem)} ({candidate.value})
                    </option>
                  ))}
              </select>
            </Field>
          ) : null}
          {manualKind === "corrected_value" ? (
            <Field htmlFor="lr-corrected-value" label="Corrected value" required>
              <input
                id="lr-corrected-value"
                onChange={(event) => setCorrectedValue(event.target.value)}
                type="text"
                value={correctedValue}
              />
            </Field>
          ) : null}
          <Field
            hint="Plain-English reason for this choice."
            htmlFor="lr-reason"
            label="Reason"
            required
          >
            <textarea
              id="lr-reason"
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              value={reason}
            />
          </Field>
          <div className="lr-decider-secondary-actions">
            <Button
              disabled={submitting !== null}
              onClick={() => void submitManualResolution()}
              size="large"
              type="button"
            >
              {submitting === "manual" ? "Saving..." : "Save decision"}
            </Button>
            <button
              className="secondary-button"
              onClick={() => setManualKind(null)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {!canAcceptSuggestion && isUnresolved ? (
        <FlagResolveForm
          canResolve={canResolve}
          flag={flag}
          isAdmin={isAdmin}
          runId={runId}
        />
      ) : null}

      {canApproveWithOneTap ? (
        <div className="lr-decider-follow-on">
          <p className="muted">
            The resolution is saved. Approval is a separate audited decision; nothing is
            written to the Sheet.
          </p>
          <Button
            disabled={submitting !== null}
            onClick={() => void approveWriteback()}
            size="large"
            type="button"
          >
            {submitting === "approve" ? "Saving..." : "Approve write-back"}
          </Button>
        </div>
      ) : approvalPending && !isAdmin ? (
        <p className="muted">An Admin approves the queued write-back proposal.</p>
      ) : approvalPending && flag.writebackApproval ? (
        <WritebackApprovalControl
          approval={flag.writebackApproval}
          isAdmin={isAdmin}
          runId={runId}
          sourceTriggerKey={flag.sourceTriggerKey}
        />
      ) : null}

      <div className="lr-decider-skip">
        {canDefer ? (
          <button
            className="secondary-button"
            disabled={skipping || submitting !== null}
            onClick={onSkip}
            type="button"
          >
            {skipping ? "Saving..." : "Skip"}
          </button>
        ) : (
          <span className="muted">Editor access is required to save skip progress.</span>
        )}
      </div>

      {error ? <p className="lr-error">{error}</p> : null}

      <Disclosure summary="Read details">
        <dl className="lr-decider-manifest">
          <div>
            <dt>Tabs recognized</dt>
            <dd>{manifest.tabsRecognized}</dd>
          </div>
          <div>
            <dt>Tabs unrecognized</dt>
            <dd>{manifest.tabsUnrecognized}</dd>
          </div>
          <div>
            <dt>Records read</dt>
            <dd>{manifest.totalRecords}</dd>
          </div>
          <div>
            <dt>Credential tabs excluded</dt>
            <dd>{manifest.credentialTabsExcluded}</dd>
          </div>
          <div>
            <dt>Credential scrub hits</dt>
            <dd>{manifest.credentialScrubHits}</dd>
          </div>
          <div>
            <dt>Divider rows dropped</dt>
            <dd>{manifest.dividerRowsDropped}</dd>
          </div>
        </dl>
      </Disclosure>
    </article>
  );
}

export const ACCEPTED_SUGGESTION_REASON = DECISION_REASON_CODE_LABELS.accepted_suggestion;
