"use client";

// S282 R-S282-1..3 (BEH-S282-2, BEH-S282-3, BEH-S282-5): the review of an off-cycle lease end date
// on Check the numbers. One small form: the sentence with the date's source, a decision ("Include
// in this renewal month" or "Keep on hold"), a required short reason and Save. It saves through the
// lease's one staff record (the existing workspace save path, with its role check, version check
// and audit entry), bound to the exact end date value shown. It writes nothing to RentVine or the
// Sheet. Excluding a lease from renewal work stays with Retire from renewals (S255) under Record
// work, which the form links to. A read-only person sees the decision and no form.

import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui";
import { formatBusinessTimestamp, formatCalendarDate } from "@/lib/date-display";
import {
  OFF_CYCLE_REASON_MAX,
  OFF_CYCLE_RETIRE_TARGET,
  OFF_CYCLE_REVIEW_FIRST_CONTROL,
  OFF_CYCLE_REVIEW_TARGET,
  OFF_CYCLE_REVIEW_WORDS,
  currentOffCycleReview,
  offCycleDecisionLine,
  offCycleEndDateSentence,
  offCycleReviewHistory,
  type OffCycleDecision,
  type OffCycleEndDateReview,
} from "@/lib/lease-renewal/off-cycle-review";
import type { RenewalWorkspaceAction } from "@/lib/lease-renewal/workspace-state";
import { focusRenewalDashboardControl } from "./RenewalDashboardNavigation";
import { useRenewalManualWorkspace } from "./RenewalManualWorkspace";

/** The lease page's off-cycle fact for this render (the desk row's `offCycleEndDate`). */
export interface OffCycleReviewFact {
  readonly endDateIso: string;
}

/** The form's view of the lease's one staff record, as the provider holds it. */
export interface OffCycleReviewFormProps {
  readonly fact: OffCycleReviewFact;
  readonly reviews: readonly OffCycleEndDateReview[];
  readonly canEdit: boolean;
  /** Saves one staff record; resolves when confirmed and rejects with the reason when not. */
  readonly onRecord: (action: RenewalWorkspaceAction) => Promise<void>;
  /** True while the staff record cannot be read; nothing is recorded until it is. */
  readonly unavailable?: boolean;
}

const DECISION_LABELS: Readonly<Record<OffCycleDecision, string>> = {
  include: OFF_CYCLE_REVIEW_WORDS.include,
  hold: OFF_CYCLE_REVIEW_WORDS.hold,
};

function reviewSummary(review: OffCycleEndDateReview): string {
  return `${offCycleDecisionLine(review)}. Reason: ${review.reason.trim().replace(/[.\s]+$/, "")}.`;
}

/** The form itself, given the staff record's reviews and its one save. */
export function OffCycleReviewForm({
  fact,
  reviews,
  canEdit,
  onRecord,
  unavailable = false,
}: OffCycleReviewFormProps) {
  const id = useId();
  const [decision, setDecision] = useState<OffCycleDecision | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{
    readonly field: "decision" | "reason" | null;
    readonly text: string;
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const current = currentOffCycleReview(reviews, fact.endDateIso);
  const history = offCycleReviewHistory(reviews, fact.endDateIso);
  const headingId = `${id}-heading`;
  const reasonId = `${id}-reason`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setSaved(false);
    // AC-S282-1: refused in place; the typed decision and reason stay as entered.
    if (!decision) {
      setError({ field: "decision", text: OFF_CYCLE_REVIEW_WORDS.decisionRequired });
      return;
    }
    const trimmed = reason.trim();
    if (!trimmed) {
      setError({ field: "reason", text: OFF_CYCLE_REVIEW_WORDS.reasonRequired });
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onRecord({
        kind: "end_date_review",
        decision,
        endDateIso: fact.endDateIso,
        reason: trimmed.slice(0, OFF_CYCLE_REASON_MAX),
      });
      setDecision(null);
      setReason("");
      setSaved(true);
    } catch (failure) {
      // The entries stay as typed so the same decision can be saved again.
      setError({
        field: null,
        text:
          failure instanceof Error && failure.message
            ? failure.message
            : "The review could not be saved. Your entries are kept.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="ui-stack-tight renewal-off-cycle-review"
      data-renewal-off-cycle-state={
        !current ? "needs_review" : current.decision === "include" ? "included" : "held"
      }
      id={OFF_CYCLE_REVIEW_TARGET}
      tabIndex={-1}
    >
      <h3 id={headingId}>{OFF_CYCLE_REVIEW_WORDS.heading}</h3>
      <p data-renewal-field="off-cycle-end-date">
        {offCycleEndDateSentence(fact.endDateIso)}
      </p>
      <p className="muted">{OFF_CYCLE_REVIEW_WORDS.source}</p>
      {current ? (
        <p data-renewal-field="off-cycle-decision" role="status">
          {reviewSummary(current)}
        </p>
      ) : null}
      {canEdit && !unavailable ? (
        <form
          className="ui-stack-tight"
          noValidate
          onSubmit={(event) => void save(event)}
        >
          <fieldset
            aria-describedby={error?.field === "decision" ? errorId : undefined}
            aria-invalid={error?.field === "decision" ? true : undefined}
            className="ui-stack-tight"
          >
            <legend>{OFF_CYCLE_REVIEW_WORDS.decision}</legend>
            {(["include", "hold"] as const).map((value) => {
              const inputId =
                value === "include"
                  ? OFF_CYCLE_REVIEW_FIRST_CONTROL
                  : `${OFF_CYCLE_REVIEW_TARGET}-hold`;
              return (
                <label className="ui-row" htmlFor={inputId} key={value}>
                  <input
                    checked={decision === value}
                    disabled={busy}
                    id={inputId}
                    name={`${id}-decision`}
                    onChange={() => {
                      setDecision(value);
                      setSaved(false);
                      if (error?.field === "decision") setError(null);
                    }}
                    type="radio"
                    value={value}
                  />
                  {DECISION_LABELS[value]}
                </label>
              );
            })}
          </fieldset>
          <label htmlFor={reasonId}>{OFF_CYCLE_REVIEW_WORDS.reason}</label>
          <input
            aria-describedby={error?.field === "reason" ? `${hintId} ${errorId}` : hintId}
            aria-invalid={error?.field === "reason" ? true : undefined}
            disabled={busy}
            id={reasonId}
            maxLength={OFF_CYCLE_REASON_MAX}
            onChange={(event) => {
              setReason(event.target.value);
              setSaved(false);
              if (error?.field === "reason") setError(null);
            }}
            required
            type="text"
            value={reason}
          />
          <p className="muted" id={hintId}>
            {OFF_CYCLE_REVIEW_WORDS.reasonHint}
          </p>
          {error ? (
            <p id={errorId} role="alert">
              {error.text}
            </p>
          ) : null}
          {saved ? <p role="status">{OFF_CYCLE_REVIEW_WORDS.saved}</p> : null}
          <p>
            <Button
              busy={busy}
              busyLabel={OFF_CYCLE_REVIEW_WORDS.saving}
              disabled={busy}
              size="compact"
              type="submit"
            >
              {OFF_CYCLE_REVIEW_WORDS.save}
            </Button>
          </p>
        </form>
      ) : (
        <p className="muted">
          {canEdit ? OFF_CYCLE_REVIEW_WORDS.reloadFirst : OFF_CYCLE_REVIEW_WORDS.readOnly}
        </p>
      )}
      <p className="muted">
        {OFF_CYCLE_REVIEW_WORDS.retireLead}{" "}
        <button
          className="text-link"
          onClick={() => focusRenewalDashboardControl(OFF_CYCLE_RETIRE_TARGET)}
          type="button"
        >
          {OFF_CYCLE_REVIEW_WORDS.retireLink}
        </button>
        .
      </p>
      {history.length ? (
        <details>
          <summary>{OFF_CYCLE_REVIEW_WORDS.history}</summary>
          <ul className="ui-rows" data-renewal-field="off-cycle-history">
            {history.map((review) => (
              <li key={review.eventId}>
                {`Lease end ${formatCalendarDate(review.endDateIso)}: ${DECISION_LABELS[review.decision]}. ${review.reason.trim().replace(/[.\s]+$/, "")}. Recorded by ${review.actorLabel}, ${formatBusinessTimestamp(review.recordedAt)}.`}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/**
 * The form on the lease page: the staff record's reviews and its one save come from the lease's
 * staff record provider. Nothing shows for a lease whose end date is not off-cycle.
 */
export function RenewalOffCycleReview({
  fact,
  canEdit,
}: Readonly<{ fact: OffCycleReviewFact | null | undefined; canEdit: boolean }>) {
  const manual = useRenewalManualWorkspace();
  if (!fact) return null;
  return (
    <OffCycleReviewForm
      canEdit={canEdit && Boolean(manual)}
      fact={fact}
      onRecord={(action) =>
        manual ? manual.record(action) : Promise.reject(new Error("Reload the lease."))
      }
      reviews={manual?.state?.endDateReviews ?? []}
      unavailable={manual?.readUnavailable ?? false}
    />
  );
}
