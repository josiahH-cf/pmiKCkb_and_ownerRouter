"use client";

// Shared lease-renewal flag actions (slice 1b). The resolve form and the Admin approve / return /
// revoke write-back controls were extracted verbatim from LeaseRenewalRunClient so both the run page
// and the owner-gated live review reuse the SAME actionable controls. Behavior-preserving: the
// rendered DOM, class names, aria-labels, and button/label text are unchanged from the run page.
//
// This is a client module. It imports server-shaped view types with `import type` ONLY and never
// value-imports a firebase-admin module (gotcha 4); nothing here executes a system-of-record write.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import type {
  RenewalFlagView,
  RenewalWritebackApprovalActivityView,
  RenewalWritebackApprovalView,
} from "@/lib/lease-renewal/run-view";
import type { WritebackProposal } from "@/lib/lease-renewal/writeback-proposal";
import { displaySourceLabel } from "@/lib/lease-renewal/source-display";
import { Field } from "@/components/ui";
import { ReasonCodeSelect } from "@/components/lease-renewal/ReasonCodeSelect";

type ResolveKind = "pick_source" | "corrected_value" | "flag_incorrect";

// "return" reads as a Revoke once a proposal is Approved, but the append-only Activity records the raw
// decision verb; label both approve/return consistently in the human-facing trail.
const DECISION_LABEL: Record<RenewalWritebackApprovalActivityView["action"], string> = {
  approve: "Approved",
  return: "Returned / revoked",
};

const KIND_LABEL: Record<ResolveKind, string> = {
  pick_source: "Pick a source",
  corrected_value: "Enter a corrected value",
  flag_incorrect: "Flag is wrong / sheet is right",
};

// The resolution-display line + the resolve form for one flag, extracted verbatim from FlagCard so the
// run page and the live review share one actionable control. Renders a fragment (no wrapper element)
// so the surrounding DOM is unchanged. The POST gates at "read"; the data layer enforces the
// Approver/Admin rule, the required reason, and the no-execute write-back gate.
export function FlagResolveForm({
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
  // Unique per instance so multiple resolve forms on one page don't collide on field ids.
  const fieldId = useId();
  const requiresAdmin = flag.severity === "High" || flag.severity === "Blocked";
  const canResolveThis = canResolve && (!requiresAdmin || isAdmin);

  const [kind, setKind] = useState<ResolveKind>(
    flag.candidates.length > 0 ? "pick_source" : "corrected_value",
  );
  const [chosenSource, setChosenSource] = useState<string>(
    flag.suggestedWinner?.source ?? flag.candidates[0]?.source ?? "",
  );
  const [correctedValue, setCorrectedValue] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [reasonCode, setReasonCode] = useState<string>(
    (flag.severity === "Low" || flag.severity === "Medium") && flag.suggestedWinner
      ? "accepted_suggestion"
      : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const resolveButtonRef = useRef<HTMLButtonElement>(null);
  const requestInFlight = useRef(false);
  const acceptsSuggestedSource =
    (flag.severity === "Low" || flag.severity === "Medium") &&
    kind === "pick_source" &&
    Boolean(flag.suggestedWinner) &&
    chosenSource === flag.suggestedWinner?.source;
  const requiresFreeTextReason = !acceptsSuggestedSource;

  function requestSubmit() {
    setError(null);
    if (requiresFreeTextReason && !reason.trim()) {
      setError("A plain-English reason is required.");
      return;
    }
    if (!requiresFreeTextReason && !reasonCode) {
      setError("Choose a reason code.");
      return;
    }
    if (kind === "corrected_value" && !correctedValue.trim()) {
      setError("Enter the corrected value.");
      return;
    }
    if (requiresAdmin) {
      setConfirmationOpen(true);
      return;
    }

    void performSubmit();
  }

  async function performSubmit() {
    if (requestInFlight.current) return;
    if (!flag.candidateFingerprint) {
      setError("The source snapshot is unavailable. Reload before saving a decision.");
      return;
    }
    requestInFlight.current = true;
    setSubmitting(true);
    try {
      const response = await fetch("/api/lease-renewal/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          source_trigger_key: flag.sourceTriggerKey,
          candidate_fingerprint: flag.candidateFingerprint,
          kind,
          chosen_source: kind === "pick_source" ? chosenSource : undefined,
          corrected_value: kind === "corrected_value" ? correctedValue : undefined,
          reason: reason.trim() || undefined,
          reason_code: reasonCode || undefined,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Could not save the resolution.");
        setConfirmationOpen(false);
        return;
      }
      setReason("");
      setReasonCode("");
      setCorrectedValue("");
      setConfirmationOpen(false);
      router.refresh();
    } catch {
      setError("Could not reach the resolution endpoint.");
      setConfirmationOpen(false);
    } finally {
      requestInFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
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
                onChange={(event) => {
                  const nextKind = event.target.value as ResolveKind;
                  setKind(nextKind);
                  if (nextKind !== "pick_source") setReasonCode("");
                }}
              >
                {flag.candidates.length > 0 ? (
                  <option value="pick_source">{KIND_LABEL.pick_source}</option>
                ) : null}
                <option value="corrected_value">{KIND_LABEL.corrected_value}</option>
                <option value="flag_incorrect">{KIND_LABEL.flag_incorrect}</option>
              </select>
            </label>

            <ReasonCodeSelect
              required={!requiresFreeTextReason}
              value={reasonCode}
              onChange={setReasonCode}
            />

            {kind === "pick_source" ? (
              <Field htmlFor={`${fieldId}-source`} label="Source" required>
                <select
                  id={`${fieldId}-source`}
                  value={chosenSource}
                  onChange={(event) => {
                    const nextSource = event.target.value;
                    setChosenSource(nextSource);
                    setReasonCode(
                      nextSource === flag.suggestedWinner?.source &&
                        (flag.severity === "Low" || flag.severity === "Medium")
                        ? "accepted_suggestion"
                        : "",
                    );
                  }}
                >
                  {flag.candidates.map((candidate, index) => (
                    <option key={`${candidate.source}-${index}`} value={candidate.source}>
                      {displaySourceLabel(candidate.sourceSystem)} ({candidate.value})
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {kind === "corrected_value" ? (
              <Field htmlFor={`${fieldId}-corrected`} label="Corrected value" required>
                <input
                  id={`${fieldId}-corrected`}
                  type="text"
                  value={correctedValue}
                  onChange={(event) => setCorrectedValue(event.target.value)}
                />
              </Field>
            ) : null}

            {requiresFreeTextReason ? (
              <Field
                hint="Plain-English reason for this choice."
                htmlFor={`${fieldId}-reason`}
                label="Reason"
                required
              >
                <textarea
                  id={`${fieldId}-reason`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                />
              </Field>
            ) : null}

            {error ? <p className="lr-error">{error}</p> : null}

            <button
              ref={resolveButtonRef}
              className="primary-button button--large"
              type="button"
              disabled={submitting}
              onClick={requestSubmit}
            >
              {submitting ? "Saving…" : flag.resolution ? "Re-resolve" : "Resolve"}
            </button>
            {confirmationOpen ? (
              <ResolutionConfirmationDialog
                fieldLabel={flag.fieldLabel}
                kindLabel={KIND_LABEL[kind]}
                onCancel={() => setConfirmationOpen(false)}
                onConfirm={() => void performSubmit()}
                restoreFocusRef={resolveButtonRef}
                severity={flag.severity === "High" ? "High" : "Blocked"}
                submitting={submitting}
              />
            ) : null}
          </div>
        ) : (
          <p className="muted">
            An Admin must resolve High and Blocked flags.{" "}
            <RequestAccessLink surface="renewals.manage" />
          </p>
        )
      ) : (
        <p className="muted">
          Approver or Admin access is required to resolve flags.{" "}
          <RequestAccessLink surface="renewals.resolve_reconciliation" />
        </p>
      )}
    </>
  );
}

function ResolutionConfirmationDialog({
  fieldLabel,
  kindLabel,
  onCancel,
  onConfirm,
  restoreFocusRef,
  severity,
  submitting,
}: Readonly<{
  fieldLabel: string;
  kindLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  restoreFocusRef: React.RefObject<HTMLButtonElement | null>;
  severity: "High" | "Blocked";
  submitting: boolean;
}>) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const restoreFocus = restoreFocusRef.current;
    cancelRef.current?.focus();
    return () => restoreFocus?.focus();
  }, [restoreFocusRef]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !submitting) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="ui-dialog-backdrop">
      <div
        aria-describedby="resolution-confirm-description"
        aria-labelledby="resolution-confirm-title"
        aria-modal="true"
        className="panel ui-confirmation-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <h2 id="resolution-confirm-title">Confirm {severity} resolution</h2>
        <p id="resolution-confirm-description">
          Resolve <strong>{fieldLabel}</strong> using “{kindLabel}”? This records the
          decision and its reason, and keeps the write-back a separate, gated step.
        </p>
        <div className="field-row">
          <button ref={cancelRef} disabled={submitting} onClick={onCancel} type="button">
            Cancel
          </button>
          <button disabled={submitting} onClick={onConfirm} type="button">
            {submitting ? "Saving…" : "Confirm resolution"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Read-only append-only write-back proposal (Q-WRITEBACK-METHOD). Value-bearing — shown only inside the
// authenticated run evidence. It never executes: the write is append-only (a new column), never an
// overwrite, and stays gated. Resolving the flag QUEUES it; an Admin then approves it below.
export function WritebackProposalCard({
  proposal,
  queued,
}: {
  proposal: WritebackProposal;
  queued: boolean;
}) {
  const ready = proposal.status === "Proposed";
  const exactQueued = queued && !proposal.suggestionOnly;
  return (
    <div className="lr-writeback" aria-label="Append-only write-back proposal">
      <p className="lr-writeback-head">
        <span
          className="queue-pill"
          data-value={ready ? "Ready for Approval" : "Needs Attention"}
        >
          {ready ? "Proposal ready" : "Needs input"}
        </span>{" "}
        <strong>
          {exactQueued ? "Exact queued Sheet write-back" : "Append-only Sheet suggestion"}
        </strong>
      </p>
      {proposal.proposedValue !== null ? (
        <p>
          {exactQueued ? "Queued to append" : "Would append"}{" "}
          <strong>{proposal.proposedValue}</strong> from{" "}
          <strong>{displaySourceLabel(proposal.sourceSystem)}</strong> to a new{" "}
          <strong>{proposal.proposedColumnHeader}</strong> column.
        </p>
      ) : (
        <p className="muted">{proposal.rationale}</p>
      )}
      <p className="muted">
        {exactQueued
          ? "This is the exact value and source saved by the human resolution. Approval authorizes this snapshot only; writing remains a separate exact-preview action."
          : "Suggestion only: appends to a new column and keeps existing cells intact; it is not approved or written here."}
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
export function WritebackApprovalControl({
  approval,
  runId,
  sourceTriggerKey,
  isAdmin,
  writebackEnabled = false,
  showLegacyWritebackRecovery = false,
}: {
  approval: RenewalWritebackApprovalView;
  runId: string;
  sourceTriggerKey: string;
  isAdmin: boolean;
  /** When true (admin feature flag on), an Approved proposal offers the live confirm-target write. */
  writebackEnabled?: boolean;
  /** Opt-in historical recovery only; current review surfaces keep the retired broad action hidden. */
  showLegacyWritebackRecovery?: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [submitting, setSubmitting] = useState<null | "approve" | "return">(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "return") {
    setError(null);
    if (!approval.authorizationToken) {
      setError("The proposal snapshot is unavailable. Reload and review it again.");
      return;
    }
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
          authorization_token: approval.authorizationToken,
          decision,
          reason: reason.trim(),
          reason_code: reasonCode || undefined,
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
      setReasonCode("");
      router.refresh();
    } catch {
      setError("Could not reach the approval endpoint.");
    } finally {
      setSubmitting(null);
    }
  }

  const stateLabel =
    approval.state === "Approved"
      ? "Approved: authorization recorded (not executed)"
      : approval.state === "Returned for Revision"
        ? "Returned for revision: re-resolve or re-approve"
        : approval.stale
          ? "Awaiting approval: queued value changed, re-approve"
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
          <ReasonCodeSelect value={reasonCode} onChange={setReasonCode} />
          {error ? <p className="lr-error">{error}</p> : null}
          <div className="lr-approve-actions">
            {approval.state !== "Approved" ? (
              <button
                type="button"
                disabled={submitting !== null || !approval.authorizationToken}
                onClick={() => decide("approve")}
              >
                {submitting === "approve" ? "Saving…" : "Approve proposal"}
              </button>
            ) : null}
            {approval.state !== "Returned for Revision" ? (
              <button
                type="button"
                className="secondary-button"
                disabled={submitting !== null || !approval.authorizationToken}
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
            Approving records authorization for this exact snapshot. It does not make an
            unavailable Sheet operation executable.
          </p>
        </div>
      ) : (
        <p className="muted">An Admin approves the queued write-back proposal.</p>
      )}

      {isAdmin && showLegacyWritebackRecovery ? (
        <SheetWritebackButton
          approvalUpdatedAt={approval.updatedAt}
          key={`${approval.updatedAt ?? "unknown"}:${approval.state}:${String(approval.stale)}:${String(writebackEnabled)}`}
          mutationEnabled={writebackEnabled}
          newWriteEnabled={
            writebackEnabled && approval.state === "Approved" && !approval.stale
          }
          runId={runId}
          sourceTriggerKey={sourceTriggerKey}
        />
      ) : isAdmin ? (
        <p className="muted">
          This legacy broad Sheet action is retired. Use the lease workspace’s Operating
          Sheet phase for an exact missing-row append. Fixed-row field updates remain
          unavailable.
        </p>
      ) : null}

      <WritebackApprovalTimeline activity={approval.activity} />
    </div>
  );
}

interface ResolvedWritebackTargetView {
  a1: string;
  proposedColumnHeader: string;
  proposedValue: string;
  rowValues: string[];
}

interface WritebackPreviewView {
  executionId: string;
  hash: string;
  expiresAt: string;
}

interface WritebackReceiptView {
  receiptId: string;
  operation: "write" | "correction";
  outcome: "written" | "corrected";
  reconciled: boolean;
  approvalVersion: string;
  createdAt: string;
}

interface CorrectionWritebackTargetView {
  a1: string;
  currentValue: string;
  originalReceiptId: string;
}

// The live Sheet action is a server-bound two-step contract. The first call returns the exact target,
// expiring preview hash, and deterministic execution identity. The second call sends those identifiers
// back byte-for-byte; a boolean alone can never write. A durable receipt enables effect-free provider
// recovery (which may terminalize an unused idempotency key) and a separately previewed,
// generation-conditioned correction.
function SheetWritebackButton({
  approvalUpdatedAt,
  mutationEnabled,
  newWriteEnabled,
  runId,
  sourceTriggerKey,
}: {
  approvalUpdatedAt?: string;
  /** Provider mutations are available; correction does not depend on the current approval state. */
  mutationEnabled: boolean;
  /** A fresh append preview/commit additionally requires the current proposal to be Approved. */
  newWriteEnabled: boolean;
  runId: string;
  sourceTriggerKey: string;
}) {
  const { refresh } = useRouter();
  const [pending, setPending] = useState<
    | null
    | "status"
    | "prepare"
    | "commit"
    | "reconcile"
    | "correction-prepare"
    | "correction-commit"
  >(null);
  const [target, setTarget] = useState<ResolvedWritebackTargetView | null>(null);
  const [preview, setPreview] = useState<WritebackPreviewView | null>(null);
  const [writePreviewApprovalVersion, setWritePreviewApprovalVersion] = useState<
    string | null
  >(null);
  const [correctionPreview, setCorrectionPreview] = useState<{
    target: CorrectionWritebackTargetView;
    preview: WritebackPreviewView;
  } | null>(null);
  const [receipt, setReceipt] = useState<WritebackReceiptView | null>(null);
  const [unresolvedExecutionId, setUnresolvedExecutionId] = useState<string | null>(null);
  const [inProgressExecutionId, setInProgressExecutionId] = useState<string | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [terminalAbsent, setTerminalAbsent] = useState(false);
  const [terminalAbsentApprovalVersion, setTerminalAbsentApprovalVersion] = useState<
    string | null
  >(null);
  const [retryCorrectionExecutionId, setRetryCorrectionExecutionId] = useState<
    string | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [completedA1, setCompletedA1] = useState<string | null>(null);

  const surface = useCallback(
    (outcome: {
      status?: string;
      target?: ResolvedWritebackTargetView | CorrectionWritebackTargetView;
      preview?: WritebackPreviewView;
      a1?: string;
      reason?: string;
      executionId?: string;
      receipt?: WritebackReceiptView;
      duplicate?: boolean;
      operation?: "write" | "correction";
      originalExecutionId?: string;
      approvalVersion?: string;
    }) => {
      setStatusLoaded(true);
      setStatusUnavailable(false);
      switch (outcome.status) {
        case "no_execution":
          setInProgressExecutionId(null);
          setTerminalAbsent(false);
          setTerminalAbsentApprovalVersion(null);
          setRetryCorrectionExecutionId(null);
          return;
        case "resolved":
          setTarget(
            outcome.target && "proposedValue" in outcome.target ? outcome.target : null,
          );
          setPreview(outcome.preview ?? null);
          setWritePreviewApprovalVersion(approvalUpdatedAt?.trim() || null);
          setInProgressExecutionId(null);
          setTerminalAbsent(false);
          setTerminalAbsentApprovalVersion(null);
          setRetryCorrectionExecutionId(null);
          return;
        case "written":
          setTarget(null);
          setPreview(null);
          setWritePreviewApprovalVersion(null);
          setReceipt(outcome.receipt ?? null);
          setCompletedA1(outcome.a1 ?? "");
          setUnresolvedExecutionId(null);
          setInProgressExecutionId(null);
          setTerminalAbsent(false);
          setTerminalAbsentApprovalVersion(null);
          setRetryCorrectionExecutionId(null);
          if (!outcome.duplicate) refresh();
          return;
        case "correction_resolved":
          setCorrectionPreview(
            outcome.target && "originalReceiptId" in outcome.target && outcome.preview
              ? {
                  target: outcome.target,
                  preview: outcome.preview,
                }
              : null,
          );
          setInProgressExecutionId(null);
          setTerminalAbsent(false);
          setTerminalAbsentApprovalVersion(null);
          setRetryCorrectionExecutionId(null);
          return;
        case "corrected":
          setTarget(null);
          setPreview(null);
          setWritePreviewApprovalVersion(null);
          setCorrectionPreview(null);
          setReceipt(outcome.receipt ?? null);
          setCompletedA1(outcome.a1 ?? "");
          setUnresolvedExecutionId(null);
          setInProgressExecutionId(null);
          setTerminalAbsent(false);
          setTerminalAbsentApprovalVersion(null);
          setRetryCorrectionExecutionId(null);
          if (!outcome.duplicate) refresh();
          return;
        case "needs_reconciliation":
          setTarget(null);
          setPreview(null);
          setWritePreviewApprovalVersion(null);
          setCorrectionPreview(null);
          setReceipt(null);
          setCompletedA1(null);
          setInProgressExecutionId(null);
          setTerminalAbsent(false);
          setTerminalAbsentApprovalVersion(null);
          setRetryCorrectionExecutionId(null);
          setUnresolvedExecutionId(outcome.executionId ?? null);
          setMessage(
            outcome.reason ??
              "The one provider attempt is unresolved. Reconcile it; do not retry.",
          );
          return;
        case "in_progress":
          setTarget(null);
          setPreview(null);
          setWritePreviewApprovalVersion(null);
          setCorrectionPreview(null);
          setReceipt(null);
          setCompletedA1(null);
          setUnresolvedExecutionId(null);
          setTerminalAbsent(false);
          setTerminalAbsentApprovalVersion(null);
          setRetryCorrectionExecutionId(null);
          setInProgressExecutionId(outcome.executionId ?? null);
          setMessage(
            outcome.reason ??
              "The provider attempt is still settling. Check status again later.",
          );
          return;
        case "absent":
          setTarget(null);
          setPreview(null);
          setWritePreviewApprovalVersion(null);
          setCorrectionPreview(null);
          setReceipt(null);
          setCompletedA1(null);
          setUnresolvedExecutionId(null);
          setInProgressExecutionId(null);
          setTerminalAbsent(true);
          setTerminalAbsentApprovalVersion(
            typeof outcome.approvalVersion === "string" &&
              outcome.approvalVersion.trim().length > 0
              ? outcome.approvalVersion
              : null,
          );
          setRetryCorrectionExecutionId(
            outcome.operation === "correction"
              ? (outcome.originalExecutionId ?? null)
              : null,
          );
          setMessage(
            outcome.reason ??
              "The provider read confirmed that the consumed attempt did not land.",
          );
          return;
        case "disabled":
          setMessage("The Sheet write-back is turned off.");
          return;
        case "not_configured":
          setMessage("Live sources aren’t connected.");
          return;
        case "not_approved":
          setMessage(outcome.reason ?? "There is no approved write-back to execute.");
          return;
        case "flag_not_found":
          setMessage("This flag is no longer in the live run; reload the review.");
          return;
        case "read_error":
          setMessage(
            "The live read did not complete. If an attempt was already claimed, reconcile it instead of retrying.",
          );
          return;
        case "blocked":
          setMessage(`Blocked: ${outcome.reason ?? "the write could not be verified"}.`);
          return;
        default:
          setMessage("Unexpected response from the write-back endpoint.");
      }
    },
    [approvalUpdatedAt, refresh],
  );

  const freshApprovalAfterCorrection =
    receipt?.operation === "correction" &&
    newWriteEnabled &&
    typeof approvalUpdatedAt === "string" &&
    approvalUpdatedAt.trim().length > 0 &&
    typeof receipt.approvalVersion === "string" &&
    receipt.approvalVersion.trim().length > 0 &&
    approvalUpdatedAt !== receipt.approvalVersion;
  const freshApprovalAfterAbsentWrite =
    terminalAbsent &&
    retryCorrectionExecutionId === null &&
    mutationEnabled &&
    newWriteEnabled &&
    typeof approvalUpdatedAt === "string" &&
    approvalUpdatedAt.trim().length > 0 &&
    typeof terminalAbsentApprovalVersion === "string" &&
    terminalAbsentApprovalVersion.trim().length > 0 &&
    approvalUpdatedAt !== terminalAbsentApprovalVersion;

  const recoverUnknownCommit = useCallback(
    async (executionId: string, knownRejectedOperation?: "write" | "correction") => {
      setStatusLoaded(true);
      setStatusUnavailable(false);
      setInProgressExecutionId(executionId);
      setMessage(
        "The commit response was lost. Exact durable status is being checked before any retry.",
      );
      try {
        const response = await fetch("/api/lease-renewal/writeback-execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId,
            sourceTriggerKey,
            operation: "status",
            confirm: false,
            executionId,
          }),
        });
        if (!response.ok) return;
        const body = (await response.json().catch(() => ({}))) as Parameters<
          typeof surface
        >[0];
        if (body.status === "no_execution") {
          setInProgressExecutionId(null);
          if (knownRejectedOperation === "write") {
            setTarget(null);
            setPreview(null);
            setWritePreviewApprovalVersion(null);
            setMessage(
              "The write preview is no longer valid. Prepare a new exact Sheet preview.",
            );
          } else if (knownRejectedOperation === "correction") {
            setCorrectionPreview(null);
            setMessage(
              "The correction preview is no longer valid. Prepare a new exact correction preview.",
            );
          } else {
            setMessage(
              "No durable attempt was claimed. The same exact confirmation may be submitted again.",
            );
          }
          return;
        }
        surface(body);
      } catch {
        // Keep exact-ID polling surfaced above. A failed status read never re-enables commit.
      }
    },
    [runId, sourceTriggerKey, surface],
  );

  const call = useCallback(
    async (
      state: NonNullable<typeof pending>,
      payload: {
        operation: "write" | "reconcile" | "correction" | "status";
        confirm: boolean;
        executionId?: string;
        previewHash?: string;
      },
    ) => {
      setPending(state);
      setMessage(null);
      try {
        const response = await fetch("/api/lease-renewal/writeback-execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId, sourceTriggerKey, ...payload }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          status?: string;
          target?: ResolvedWritebackTargetView | CorrectionWritebackTargetView;
          preview?: WritebackPreviewView;
          a1?: string;
          reason?: string;
          executionId?: string;
          receipt?: WritebackReceiptView;
          duplicate?: boolean;
          operation?: "write" | "correction";
          originalExecutionId?: string;
          error?: string;
          error_type?: string;
        };
        if (!response.ok) {
          if (body.error_type === "attempt_ambiguous" && payload.executionId) {
            surface({
              status: "needs_reconciliation",
              executionId: payload.executionId,
              reason: body.error,
            });
            return;
          }
          if (body.error_type === "attempt_in_progress" && payload.executionId) {
            surface({
              status: "in_progress",
              executionId: payload.executionId,
              reason: body.error,
            });
            return;
          }
          if (
            (state === "commit" || state === "correction-commit") &&
            payload.executionId &&
            ["preview_stale", "correction_unavailable", "attempt_consumed"].includes(
              body.error_type ?? "",
            )
          ) {
            await recoverUnknownCommit(
              payload.executionId,
              state === "commit" ? "write" : "correction",
            );
            return;
          }
          if (state === "status") {
            setStatusLoaded(true);
            setStatusUnavailable(true);
          }
          setMessage(body.error ?? "Could not reach the write-back endpoint.");
          return;
        }
        surface(body);
      } catch {
        if (
          (state === "commit" || state === "correction-commit") &&
          payload.executionId
        ) {
          await recoverUnknownCommit(payload.executionId);
          return;
        }
        if (state === "status") {
          setStatusLoaded(true);
          setStatusUnavailable(true);
        }
        setMessage("Could not reach the write-back endpoint.");
      } finally {
        setPending(null);
      }
    },
    [recoverUnknownCommit, runId, sourceTriggerKey, surface],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void call("status", { operation: "status", confirm: false });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [call]);

  return (
    <div className="lr-writeback-execute">
      {!statusLoaded ? (
        <p className="muted">Checking durable Sheet action status…</p>
      ) : statusUnavailable ? (
        <p className="muted">
          Sheet action status could not be verified. Reload before attempting a write.
        </p>
      ) : inProgressExecutionId ? (
        <div className="lr-approve-form">
          <p className="muted">
            The provider attempt is still settling. No retry or reconciliation is allowed
            inside the no-race window.
          </p>
          <button
            className="secondary-button"
            disabled={pending !== null}
            onClick={() =>
              call("status", {
                operation: "status",
                confirm: false,
                executionId: inProgressExecutionId,
              })
            }
            type="button"
          >
            {pending === "status" ? "Checking…" : "Check action status"}
          </button>
        </div>
      ) : unresolvedExecutionId ? (
        <div className="lr-approve-form">
          <p className="muted">
            The one provider attempt is unresolved. Reconcile it before any other Sheet
            action.
          </p>
          <button
            className="secondary-button"
            disabled={pending !== null}
            onClick={() =>
              call("reconcile", {
                operation: "reconcile",
                confirm: false,
                executionId: unresolvedExecutionId,
              })
            }
            type="button"
          >
            {pending === "reconcile" ? "Reconciling…" : "Reconcile one attempt"}
          </button>
        </div>
      ) : correctionPreview && mutationEnabled ? (
        <div className="lr-approve-form">
          <p>
            Clear exactly <strong>{correctionPreview.target.currentValue}</strong> from{" "}
            <strong>{correctionPreview.target.a1}</strong> by receipt{" "}
            <code>{shortIdentity(correctionPreview.target.originalReceiptId)}</code>.
          </p>
          <p className="muted">
            Exact correction preview{" "}
            <code>{shortIdentity(correctionPreview.preview.hash)}</code> expires{" "}
            {correctionPreview.preview.expiresAt}. Any intervening cell change blocks the
            clear.
          </p>
          <div className="lr-approve-actions">
            <button
              disabled={pending !== null}
              onClick={() =>
                call("correction-commit", {
                  operation: "correction",
                  confirm: true,
                  executionId: correctionPreview.preview.executionId,
                  previewHash: correctionPreview.preview.hash,
                })
              }
              type="button"
            >
              {pending === "correction-commit"
                ? "Correcting…"
                : "Confirm exact Sheet correction"}
            </button>
            <button
              className="secondary-button"
              disabled={pending !== null}
              onClick={() => setCorrectionPreview(null)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : correctionPreview ? (
        <p className="muted">
          Exact correction is unavailable while Sheet mutations are off.
        </p>
      ) : target &&
        preview &&
        newWriteEnabled &&
        writePreviewApprovalVersion === approvalUpdatedAt ? (
        <div className="lr-approve-form">
          <p>
            Append <strong>{target.proposedValue}</strong> to{" "}
            <strong>{target.proposedColumnHeader}</strong> at <strong>{target.a1}</strong>
            .
          </p>
          <p className="muted">
            Row: {target.rowValues.filter((cell) => cell.trim() !== "").join(" · ")}
          </p>
          <p className="muted">
            Exact preview <code>{shortIdentity(preview.hash)}</code> expires{" "}
            {preview.expiresAt}. Any approval, target, value, actor, or environment change
            invalidates it.
          </p>
          <div className="lr-approve-actions">
            <button
              disabled={pending !== null}
              onClick={() =>
                call("commit", {
                  operation: "write",
                  confirm: true,
                  executionId: preview.executionId,
                  previewHash: preview.hash,
                })
              }
              type="button"
            >
              {pending === "commit" ? "Writing…" : "Confirm write to Sheet"}
            </button>
            <button
              className="secondary-button"
              disabled={pending !== null}
              onClick={() => {
                setTarget(null);
                setPreview(null);
                setWritePreviewApprovalVersion(null);
                setMessage(null);
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : terminalAbsent && retryCorrectionExecutionId ? (
        <div className="lr-approve-form">
          <p className="muted">
            The prior correction attempt was confirmed absent. A new exact correction
            requires a fresh preview and receives a new one-attempt identity.
          </p>
          {mutationEnabled ? (
            <button
              className="secondary-button"
              disabled={pending !== null}
              onClick={() =>
                call("correction-prepare", {
                  operation: "correction",
                  confirm: false,
                  executionId: retryCorrectionExecutionId,
                })
              }
              type="button"
            >
              {pending === "correction-prepare"
                ? "Checking exact cell…"
                : "Preview exact correction again"}
            </button>
          ) : (
            <p className="muted">Exact correction is unavailable while writes are off.</p>
          )}
        </div>
      ) : freshApprovalAfterAbsentWrite ? (
        <div className="lr-approve-form">
          <p className="muted">
            The prior write attempt was confirmed absent. This newer Approved proposal can
            start a fresh one-attempt lineage.
          </p>
          <button
            disabled={pending !== null}
            onClick={() => call("prepare", { operation: "write", confirm: false })}
            type="button"
          >
            {pending === "prepare" ? "Resolving…" : "Write approved value to Sheet"}
          </button>
        </div>
      ) : terminalAbsent ? (
        <p className="muted">
          This one attempt is consumed. Revoke and re-approve the proposal before
          preparing another write.
        </p>
      ) : receipt?.operation === "write" ? (
        <div className="lr-approve-form">
          <p className="muted">
            ✓ Wrote the approved value to the Sheet ({completedA1}). Receipt{" "}
            <code>{shortIdentity(receipt.receiptId)}</code>
            {receipt.reconciled ? " (reconciled)" : ""}.
          </p>
          {mutationEnabled ? (
            <button
              className="secondary-button"
              disabled={pending !== null}
              onClick={() =>
                call("correction-prepare", {
                  operation: "correction",
                  confirm: false,
                  executionId: receipt.receiptId,
                })
              }
              type="button"
            >
              {pending === "correction-prepare"
                ? "Checking exact cell…"
                : "Preview exact correction"}
            </button>
          ) : (
            <p className="muted">Exact correction is unavailable while writes are off.</p>
          )}
        </div>
      ) : receipt?.operation === "correction" ? (
        <div className="lr-approve-form">
          <p className="muted">
            ✓ Cleared the exact receipted Sheet value ({completedA1}). Correction receipt{" "}
            <code>{shortIdentity(receipt.receiptId)}</code>
            {receipt.reconciled ? " (reconciled)" : ""}.
          </p>
          {freshApprovalAfterCorrection ? (
            <button
              disabled={pending !== null}
              onClick={() => call("prepare", { operation: "write", confirm: false })}
              type="button"
            >
              {pending === "prepare" ? "Resolving…" : "Write approved value to Sheet"}
            </button>
          ) : null}
        </div>
      ) : !mutationEnabled ? (
        <p className="muted">
          New Sheet writes are turned off. Durable receipts and reconciliation remain
          available.
        </p>
      ) : !newWriteEnabled ? (
        <p className="muted">
          A current Approved proposal is required for a new Sheet preview. Durable status,
          reconciliation, and correction remain available.
        </p>
      ) : (
        <button
          disabled={pending !== null}
          onClick={() => call("prepare", { operation: "write", confirm: false })}
          type="button"
        >
          {pending === "prepare" ? "Resolving…" : "Write approved value to Sheet"}
        </button>
      )}
      {message ? <p className="lr-error">{message}</p> : null}
    </div>
  );
}

function shortIdentity(value: string): string {
  return value.length > 16 ? `${value.slice(0, 12)}…` : value;
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
            <strong>{DECISION_LABEL[entry.action]}</strong> by {entry.decidedByUid} ·{" "}
            {entry.reason} <span className="muted">({entry.createdAt})</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
