"use client";

// S262 R-S262-1..3 (BEH-S262-1, BEH-S262-3): the approving branch of "Record the owner's answer",
// shared by the linked reply on the Now card and the manual owner response. After Outcome comes
// Amount approved, typed by staff and never filled from the recommendation, a payment total or
// the reply text; then what the answer covers; then the evidence; then an explicit review that
// names the old recommended base, the approved base and the coverage before Save. Saving records
// the answer and the approved working base together; it creates no mail operation, provider
// write or send. Continue to Offer the tenant only opens the existing tenant preparation.
//
// S277 R-S277-3 / R-S277-4 (ARCH-S277-3): Amount approved still starts empty. It is set only by
// typing or by the explicit "Same as recommended ($1,400.00)" click, offered while a current-cycle
// recommendation exists; nothing is filled for staff. The review states what the chosen coverage
// means at Documents before Save, and while the working dates are not saved the form links to the
// one Working renewal terms editor with a return that keeps what staff typed. Coverage stays what
// staff chose and saved (S262 R-S262-3).
//
// S285 R-S285-4 (ARCH-S285-3): the coverage opens on "Base rent and the renewal dates" when the
// cycle's latest confirmed owner message stated the term and the saved working dates still equal
// it, with "The message asked about the rent and these dates."; when the dates changed after that
// message it opens on "Base rent only" and says why. Staff choose either; only their save stores it.

import { useId, useState, type ReactNode } from "react";

import { Button, Field } from "@/components/ui";
import type { OwnerApprovalChoices } from "@/lib/lease-renewal/owner-approval-evidence";
import { OwnerApprovalEvidenceForm } from "./OwnerApprovalEvidenceForm";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import { formatBusinessTimestamp, formatCalendarDate } from "@/lib/date-display";
import { parseCurrencyInput } from "@/lib/currency-input";
import { formatUsd } from "@/lib/lease-renewal/owner-draft";
import {
  recommendationFact,
  recommendedRentValue,
  storedWorkingRevision,
} from "@/lib/lease-renewal/current-cycle-terms";
import type {
  ApprovedBaseInput,
  RecordedApprovalScopeKind,
} from "@/lib/lease-renewal/owner-approval-scope";
import {
  workingRenewalTerms,
  type RenewalWorkingRecord,
} from "@/lib/lease-renewal/working-record";
import type { OwnerApprovalInput } from "@/lib/lease-renewal/workspace-state";
import {
  formatRentAmount,
  rentBasisPhrase,
  rentBasisSentence,
} from "@/lib/lease-renewal/rent-basis";
import { WORKING_START_FIELD_ID } from "@/lib/lease-renewal/message-readiness";
import {
  OWNER_ANSWER_DATES_CHANGED_LINE,
  OWNER_ANSWER_MESSAGE_ASKED_LINE,
  ownerAnswerCoverageDefault,
  type OwnerAnswerCoverageDefault,
} from "@/lib/lease-renewal/owner-copy-version";
import { focusRenewalDashboardControl } from "./RenewalDashboardNavigation";
import { startDateFixFromOffer } from "./RenewalDateProposal";

export const RECORD_OWNER_ANSWER_TITLE = "Record the owner's answer";
export const AMOUNT_APPROVED_LABEL = "Amount approved";
export const REVIEW_OWNER_ANSWER_LABEL = "Review the owner's answer";
export const SAVE_OWNER_ANSWER_LABEL = "Save the owner's answer";
export const CONTINUE_TO_TENANT_OFFER_LABEL = "Continue to Offer the tenant";
export const APPROVAL_COVERS_LABEL = "What the owner's answer covers";

export interface ApprovedAmountDraft {
  readonly amount: string;
  readonly scope: RecordedApprovalScopeKind;
  /**
   * S285 R-S285-4: true once staff chose the coverage. Until then the form shows the coverage the
   * owner message asked for (`ownerAnswerCoverageDefault`), recomputed on every read.
   */
  readonly scopeChosen?: true;
}

export const EMPTY_APPROVED_AMOUNT: ApprovedAmountDraft = Object.freeze({
  amount: "",
  scope: "amount_only",
});

/**
 * S285 R-S285-4 (ARCH-S285-3): the coverage the answer opens on for this lease, from the term the
 * cycle's latest confirmed owner message stated and the saved working dates. A projection only.
 */
export function ownerAnswerCoverage(
  choices: Pick<OwnerApprovalChoices, "ownerMessageTerm"> | null | undefined,
  working: RenewalWorkingRecord | null | undefined,
): OwnerAnswerCoverageDefault {
  return ownerAnswerCoverageDefault({
    statedTerm: choices?.ownerMessageTerm ?? null,
    workingDates: coverableRenewalDates(working),
  });
}

/**
 * S285 R-S285-4: the draft as the form shows and reviews it: the coverage staff chose, else the
 * coverage the owner message asked for.
 */
export function effectiveApprovedDraft(
  draft: ApprovedAmountDraft,
  coverage: OwnerAnswerCoverageDefault | null | undefined,
): ApprovedAmountDraft {
  if (draft.scopeChosen || !coverage) return draft;
  return { ...draft, scope: coverage.scope };
}

/** The current-cycle renewal dates an exact-terms answer would cover, or null. */
export function coverableRenewalDates(
  working: RenewalWorkingRecord | null | undefined,
): { readonly start: string; readonly end: string } | null {
  const terms = workingRenewalTerms(working ?? null);
  return terms.effectiveDate && terms.endDate && terms.endDate > terms.effectiveDate
    ? { start: terms.effectiveDate, end: terms.endDate }
    : null;
}

/**
 * R-S262-1: the exact approved base from the typed amount, with the revisions the review shows.
 * An empty, invalid or sub-cent amount is a message for staff, never a guessed value.
 */
export function approvedBaseFromDraft(
  draft: ApprovedAmountDraft,
  working: RenewalWorkingRecord | null | undefined,
): ApprovedBaseInput | string {
  const text = draft.amount.trim();
  if (!text) return "Enter the amount the owner approved.";
  const parsed = parseCurrencyInput(text);
  if (!parsed.ok || parsed.value <= 0 || parsed.value > 1_000_000)
    return "Enter the approved monthly amount as 1875 or $1,875.00.";
  if (draft.scope === "exact_terms" && !coverableRenewalDates(working))
    return "Save the renewal start and end dates before recording that the owner approved them, or choose Base rent only.";
  return {
    amount: parsed.value,
    scope: draft.scope,
    expectedWorkingRevision: storedWorkingRevision(working, "terms_rent"),
    expectedRecommendationRevision: storedWorkingRevision(working, "recommended_rent"),
  };
}

/** S277 R-S277-3: the explicit affirmation beside Amount approved. */
export function sameAsRecommendedLabel(amount: number): string {
  return `Same as recommended (${formatRentAmount(amount)})`;
}

/** S277 R-S277-4: the coverage consequences, stated before the answer is saved. */
export const OWNER_ANSWER_COVERAGE_WORDS = {
  amountOnly:
    "This answer covers the base rent only. Documents will ask for the owner's approval of the renewal dates and charges.",
  exactTerms:
    "This answer covers the base rent and the renewal dates, so Documents asks for no second approval of the dates.",
  datesFirst:
    "To record that the owner also approved the dates, enter the renewal dates first.",
  datesLink: "Enter the renewal dates in Working renewal terms",
  returnToAnswer: "Return to the owner's answer",
} as const;

/** The return target of the dates link: this form's Amount approved. */
function amountReturnId(reactId: string): string {
  return `renewal-owner-answer-amount-${reactId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

/**
 * Amount approved and what the answer covers; nothing is prefilled. S277 R-S277-3: with a
 * current-cycle recommendation, "Same as recommended ($1,400.00)" fills the field on one
 * deliberate click; the field still starts empty (S262 R-S262-1). S277 R-S277-4: until both
 * working dates are saved, the form says how to record the dates too and links to the one Working
 * renewal terms editor, with a return to this form; what staff typed here stays.
 */
export function ApprovedAmountFields({
  draft: entered,
  onChange,
  working,
  disabled,
  coverage = null,
}: Readonly<{
  draft: ApprovedAmountDraft;
  onChange: (next: ApprovedAmountDraft) => void;
  working: RenewalWorkingRecord | null | undefined;
  disabled: boolean;
  /**
   * S285 R-S285-4: the coverage the owner message asked for. Until staff choose, the form opens
   * on it; the review states the coverage before saving either way (S277 R-S277-4).
   */
  coverage?: OwnerAnswerCoverageDefault | null;
}>) {
  const id = useId();
  const dates = coverableRenewalDates(working);
  const recommended = recommendedRentValue(working);
  const returnId = amountReturnId(id);
  const draft = effectiveApprovedDraft(entered, coverage);
  return (
    <div
      className="ui-stack-tight"
      data-renewal-field="owner-answer-amount"
      id={returnId}
      tabIndex={-1}
    >
      <Field
        htmlFor={`${id}-amount`}
        hint="The monthly base rent the owner approved, exactly as the owner gave it."
        label={AMOUNT_APPROVED_LABEL}
        required
      >
        <input
          autoComplete="off"
          disabled={disabled}
          id={`${id}-amount`}
          inputMode="decimal"
          onChange={(event) => onChange({ ...entered, amount: event.target.value })}
          value={draft.amount}
        />
      </Field>
      {recommended !== null ? (
        <p className="ui-row" data-renewal-field="owner-answer-same-as-recommended">
          <Button
            disabled={disabled}
            onClick={() => onChange({ ...entered, amount: recommended.toFixed(2) })}
            size="compact"
            type="button"
            variant="secondary"
          >
            {sameAsRecommendedLabel(recommended)}
          </Button>
        </p>
      ) : null}
      <fieldset className="ui-stack-tight">
        <legend>{APPROVAL_COVERS_LABEL}</legend>
        <label className="ui-row">
          <input
            checked={draft.scope === "amount_only"}
            disabled={disabled}
            name={`${id}-scope`}
            onChange={() =>
              onChange({ ...draft, scope: "amount_only", scopeChosen: true })
            }
            type="radio"
            value="amount_only"
          />{" "}
          Base rent only
        </label>
        {dates ? (
          <label className="ui-row">
            <input
              checked={draft.scope === "exact_terms"}
              disabled={disabled}
              name={`${id}-scope`}
              onChange={() =>
                onChange({ ...draft, scope: "exact_terms", scopeChosen: true })
              }
              type="radio"
              value="exact_terms"
            />{" "}
            Base rent and the renewal dates, {formatCalendarDate(dates.start)} to{" "}
            {formatCalendarDate(dates.end)}
          </label>
        ) : null}
        {/* S285 R-S285-4: why the form opens on this coverage. */}
        {coverage?.reason === "message_asked" && dates ? (
          <p data-renewal-field="owner-answer-message-asked">
            {OWNER_ANSWER_MESSAGE_ASKED_LINE}
          </p>
        ) : coverage?.reason === "dates_changed" ? (
          <p data-renewal-field="owner-answer-dates-changed" role="note">
            {OWNER_ANSWER_DATES_CHANGED_LINE}
          </p>
        ) : null}
        {!dates ? (
          <p data-renewal-field="owner-answer-dates-first">
            {OWNER_ANSWER_COVERAGE_WORDS.datesFirst}{" "}
            <a
              className="text-link"
              href={`#${WORKING_START_FIELD_ID}`}
              onClick={(event) => {
                // The one Working renewal terms editor, with the way back to this form.
                event.preventDefault();
                startDateFixFromOffer(
                  "renewalStartDate",
                  returnId,
                  OWNER_ANSWER_COVERAGE_WORDS.returnToAnswer,
                );
                focusRenewalDashboardControl(WORKING_START_FIELD_ID);
              }}
            >
              {OWNER_ANSWER_COVERAGE_WORDS.datesLink}
            </a>
          </p>
        ) : null}
        <p className="muted">
          Other charges are not covered by this answer. They are reviewed with the tenant
          offer.
        </p>
      </fieldset>
    </div>
  );
}

/** Who approved, how and when, in words, for the review. */
export function describeOwnerApprovalInput(
  approval: OwnerApprovalInput,
  replyLabel?: (sequenceId: string, evidenceId: string) => string | null,
): string {
  const party = approval.party;
  const who =
    party?.kind === "owner"
      ? `${party.label} (owner of record)`
      : party?.kind === "representative"
        ? `${party.name} (authorized representative, ${party.capacity})`
        : "Not named";
  const channel = approval.channel;
  const how =
    channel?.kind === "linked_reply"
      ? (replyLabel?.(channel.sequenceId, channel.evidenceId) ??
        "a reply in this lease's renewal thread")
      : channel?.kind === "written"
        ? `${channel.medium} (reference ${channel.reference})`
        : channel?.kind === "conversation"
          ? `a conversation with ${channel.participants}`
          : "not named";
  const when = approval.occurredAt
    ? formatBusinessTimestamp(approval.occurredAt)
    : "not named";
  return `Approved by ${who} through ${how}, on ${when}.`;
}

/**
 * The explicit review before Save: the recommended base as it stands, the approved base, and
 * exactly what the answer covers.
 */
export function OwnerAnswerReview({
  base,
  working,
  evidence,
  saving,
  error,
  onSave,
  onChange,
}: Readonly<{
  base: ApprovedBaseInput;
  working: RenewalWorkingRecord | null | undefined;
  evidence: ReactNode;
  saving: boolean;
  error?: string | null;
  onSave: () => void;
  onChange: () => void;
}>) {
  const recommendation = recommendationFact(working);
  const recommended = recommendedRentValue(working);
  const dates = coverableRenewalDates(working);
  const same = recommended !== null && Math.abs(recommended - base.amount) < 0.005;
  // S277 R-S277-2: the recommendation's basis, from the one projection.
  const recommendedBasis =
    recommendation.kind === "unavailable" ? null : rentBasisPhrase(recommendation.entry);
  const exactTerms = base.scope === "exact_terms" && dates !== null;
  return (
    <section
      aria-label={REVIEW_OWNER_ANSWER_LABEL}
      className="ui-stack-tight renewal-owner-answer-review"
      data-renewal-field="owner-answer-review"
    >
      <h4>{REVIEW_OWNER_ANSWER_LABEL}</h4>
      <dl className="ui-rows">
        <div>
          <dt>Recommended base rent</dt>
          <dd data-renewal-field="owner-answer-recommended">
            {recommendation.kind === "unavailable" || recommended === null
              ? "Not available"
              : `${formatUsd(recommended)} per month`}
            {recommended !== null && recommendedBasis ? (
              <span className="muted" data-renewal-field="owner-answer-recommended-basis">
                , {recommendedBasis}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>{AMOUNT_APPROVED_LABEL}</dt>
          <dd data-renewal-field="owner-answer-approved">
            {formatUsd(base.amount)} per month
            {same ? ", the same as the recommendation" : null}
          </dd>
        </div>
        <div>
          <dt>Covers</dt>
          <dd data-renewal-field="owner-answer-coverage">
            {exactTerms && dates
              ? `The base rent and the renewal dates, ${formatCalendarDate(dates.start)} to ${formatCalendarDate(dates.end)}. Other charges are not covered.`
              : "The base rent only. The renewal dates and other charges are not covered."}
          </dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>{evidence}</dd>
        </div>
      </dl>
      {/* S277 R-S277-4: what this coverage means at Documents, before the answer is saved. */}
      <p data-renewal-field="owner-answer-coverage-statement" role="note">
        {exactTerms
          ? OWNER_ANSWER_COVERAGE_WORDS.exactTerms
          : OWNER_ANSWER_COVERAGE_WORDS.amountOnly}
      </p>
      <p className="muted">
        Saving records this answer and makes {formatUsd(base.amount)} the offer amount for
        this renewal. Nothing is sent.
      </p>
      <div className="ui-row">
        <Button busy={saving} disabled={saving} onClick={onSave} type="button">
          {SAVE_OWNER_ANSWER_LABEL}
        </Button>
        <Button disabled={saving} onClick={onChange} type="button" variant="secondary">
          Change the answer
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

/**
 * The manual path's approving branch: Amount approved, then who approved, how and when, then the
 * review and Save. Resolves true once the answer is saved; a refusal keeps every entry.
 */
export function ManualOwnerAnswerApproval({
  choices,
  disabled,
  onSave,
}: Readonly<{
  choices: OwnerApprovalChoices | undefined;
  disabled: boolean;
  onSave: (approval: OwnerApprovalInput, base: ApprovedBaseInput) => Promise<boolean>;
}>) {
  const working = useRenewalWorkingRecord();
  const record = working?.record ?? null;
  const [entered, setDraft] = useState<ApprovedAmountDraft>(EMPTY_APPROVED_AMOUNT);
  // S285 R-S285-4: the form opens on the coverage the owner message asked for.
  const coverage = ownerAnswerCoverage(choices, record);
  const draft = effectiveApprovedDraft(entered, coverage);
  const [review, setReview] = useState<{
    approval: OwnerApprovalInput;
    base: ApprovedBaseInput;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replyLabel = (sequenceId: string, evidenceId: string) => {
    const reply = choices?.replies.find(
      (entry) => entry.sequenceId === sequenceId && entry.evidenceId === evidenceId,
    );
    return reply
      ? `the reply received ${formatBusinessTimestamp(reply.receivedAt)} in ${reply.senderEmail}`
      : null;
  };
  async function save() {
    if (!review) return;
    setSaving(true);
    setError(null);
    const saved = await onSave(review.approval, review.base).catch(() => false);
    setSaving(false);
    if (!saved)
      setError(
        "The owner's answer was not saved. Your entries are kept; review the current values and save again.",
      );
  }
  return (
    <fieldset className="ui-stack" data-renewal-field="owner-answer-approval">
      <legend>{RECORD_OWNER_ANSWER_TITLE}</legend>
      {review ? (
        <OwnerAnswerReview
          base={review.base}
          error={error}
          evidence={describeOwnerApprovalInput(review.approval, replyLabel)}
          onChange={() => {
            setReview(null);
            setError(null);
          }}
          onSave={() => void save()}
          saving={saving}
          working={record}
        />
      ) : (
        <>
          <ApprovedAmountFields
            coverage={coverage}
            disabled={disabled}
            draft={entered}
            onChange={setDraft}
            working={record}
          />
          <OwnerApprovalEvidenceForm
            choices={choices}
            disabled={disabled}
            onRecord={(approval) => {
              const base = approvedBaseFromDraft(draft, record);
              if (typeof base !== "string") setReview({ approval, base });
            }}
            submitLabel={REVIEW_OWNER_ANSWER_LABEL}
            validate={() => {
              const base = approvedBaseFromDraft(draft, record);
              return typeof base === "string" ? base : null;
            }}
          />
        </>
      )}
    </fieldset>
  );
}

/**
 * After a saved answer: the current offer amount and Continue to Offer the tenant. The action
 * opens the existing tenant preparation; it records, sends and authorizes nothing.
 */
export function ContinueToTenantOffer({
  working,
}: Readonly<{ working: RenewalWorkingRecord | null | undefined }>) {
  const base = workingRenewalTerms(working ?? null).rent;
  // S277 R-S277-2: the offer amount's basis, such as "Approved by the owner on 11/12/2026."
  const basis = rentBasisPhrase(working?.fields.terms_rent ?? null);
  return (
    <p className="ui-row" data-renewal-field="owner-answer-continue">
      {base !== null ? (
        <span>Offer amount for this renewal: {formatUsd(base)} per month. </span>
      ) : null}
      {base !== null && basis ? (
        <span className="muted" data-renewal-field="offer-amount-basis">
          {rentBasisSentence(basis)}{" "}
        </span>
      ) : null}
      <Button
        onClick={() =>
          focusRenewalDashboardControl("renewal-outcome-offer-tenant", {
            focusContainer: true,
          })
        }
        size="compact"
        type="button"
        variant="secondary"
      >
        {CONTINUE_TO_TENANT_OFFER_LABEL}
      </Button>
    </p>
  );
}
