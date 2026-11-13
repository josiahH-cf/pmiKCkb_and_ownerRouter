"use client";

// S264 (R-S264-1/2/3/5/7, BEH-S264-1..5/7): "Review offer charges", the one place staff review
// which charges apply to the tenant offer. It sits in the tenant preparation owner and is the same
// control and saved record in Guided and Full: each RentVine line and each case entry is its own
// row with its source, staff include or leave out each line (leaving one out needs its reason),
// correct an amount or date with its source, add a fee for this lease only, and decide the
// insurance and Resident Benefits Package transitions with their source. Exact totals follow.
// Ended, not yet started and rent-account lines, and separate requirements, are inspectable in the
// tenant offer's evidence. Every entry saves with the tenant message through its existing save.

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button, Field } from "@/components/ui";
import { formatCalendarDate } from "@/lib/date-display";
import { MESSAGE_CHARGES } from "@/lib/lease-renewal/renewal-message-content";
import { MESSAGE_CONTROL_IDS } from "@/lib/lease-renewal/message-readiness";
import {
  OFFER_CASE_FAMILIES,
  cadenceLabel,
  describeMonthlyTotal,
  describeOneTimeTotal,
  formatCents,
  isOneTimeFamily,
  moneyToCents,
  offerChargeRowControlId,
  reviewedStampFor,
  type OfferCaseEntry,
  type OfferCaseFamily,
  type OfferChargeDecision,
  type OfferChargeReview,
  type OfferChargeRow,
  type OfferChargeSelection,
} from "@/lib/lease-renewal/offer-charges";
import { useWorkingBaseWords } from "./RenewalRentBasis";

/** The id of the host the tenant offer's evidence area provides for inspectable rows. */
export const OFFER_CHARGE_EVIDENCE_HOST_ID = "renewal-offer-charge-evidence";

const STATUS_WORDS: Record<OfferChargeRow["status"], string> = {
  selected: "Included",
  excluded: "Left out",
  needs_decision: "Needs a decision",
  needs_review: "Needs review again",
  historical: "Ended before the renewal",
  future: "Starts after the renewal begins",
  rent: "Rent account line, part of the base rent",
  separate: "Separate requirement, not an offer charge",
};

/** The recurring families a line no mapping names may be classified as, for one lease. */
const CLASSIFICATION_FAMILIES = ["pet", "utilities", "rbp", "insurance"] as const;

const INSPECT_ONLY: ReadonlySet<OfferChargeRow["status"]> = new Set([
  "historical",
  "future",
  "rent",
  "separate",
]);

function amountWords(row: Pick<OfferChargeRow, "amountCents" | "cadence">): string {
  const amount =
    row.amountCents === null ? "Amount not entered" : formatCents(row.amountCents);
  return row.cadence ? `${amount} ${cadenceLabel(row.cadence)}` : amount;
}

function dollarsText(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

/** A typed evidence entry: blank is none; anything else is kept exactly as typed. */
function evidence(value: string): string | null {
  return value.trim() ? value : null;
}

export interface RenewalOfferChargesProps {
  readonly review: OfferChargeReview;
  readonly selection: OfferChargeSelection;
  readonly canEdit: boolean;
  /** A change to the local review; it saves with the message. */
  readonly onChange: (next: OfferChargeSelection) => void;
  /** Save now (a choice saves when made, typed text when its field is left). */
  readonly onCommit: () => void;
  /** Where the tenant offer's evidence area holds inspectable rows; inline when absent. */
  readonly evidenceHost?: HTMLElement | null;
  readonly unfinished?: boolean;
}

export function RenewalOfferCharges({
  review,
  selection,
  canEdit,
  onChange,
  onCommit,
  evidenceHost,
  unfinished,
}: RenewalOfferChargesProps) {
  const base = useId();
  // An amount that is not dollars and cents is named at its field and never saved.
  const [amountErrors, setAmountErrors] = useState<Record<string, string>>({});
  const amountTyped = (
    field: string,
    typed: string,
    save: (cents: number | null) => void,
  ) => {
    const value = typed.trim();
    const cents = value ? moneyToCents(value) : null;
    setAmountErrors((current) => {
      const next = { ...current };
      if (value && cents === null)
        next[field] = "Enter the amount in dollars and cents, like 45.00.";
      else delete next[field];
      return next;
    });
    if (value && cents === null) return;
    save(cents);
    onCommit();
  };
  const decisionFor = (rowKey: string) =>
    selection.decisions.find((entry) => entry.rowKey === rowKey) ?? null;
  const setDecision = (row: OfferChargeRow, next: OfferChargeDecision | null) =>
    onChange({
      ...selection,
      decisions: [
        ...selection.decisions.filter((entry) => entry.rowKey !== row.rowKey),
        ...(next ? [next] : []),
      ],
    });
  const decide = (row: OfferChargeRow, choice: "" | "include" | "exclude") => {
    const prior = decisionFor(row.rowKey);
    setDecision(
      row,
      choice
        ? {
            rowKey: row.rowKey,
            choice,
            reason: prior?.reason ?? null,
            renewalAmountCents:
              choice === "include" ? (prior?.renewalAmountCents ?? null) : null,
            effectiveDate: choice === "include" ? (prior?.effectiveDate ?? null) : null,
            correctionSource:
              choice === "include" ? (prior?.correctionSource ?? null) : null,
            reviewed: reviewedStampFor(review, row),
          }
        : null,
    );
    onCommit();
  };
  const patchDecision = (row: OfferChargeRow, patch: Partial<OfferChargeDecision>) => {
    const prior = decisionFor(row.rowKey);
    if (!prior) return;
    setDecision(row, { ...prior, ...patch });
  };
  const confirmAgain = (row: OfferChargeRow) => {
    const prior = decisionFor(row.rowKey);
    if (!prior) return;
    setDecision(row, { ...prior, reviewed: reviewedStampFor(review, row) });
    onCommit();
  };
  const patchCase = (id: string, patch: Partial<OfferCaseEntry>) =>
    onChange({
      ...selection,
      caseEntries: selection.caseEntries.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    });
  const removeCase = (id: string) => {
    onChange({
      ...selection,
      caseEntries: selection.caseEntries.filter((entry) => entry.id !== id),
    });
    onCommit();
  };
  const setInsurance = (patch: { choice?: string; source?: string | null }) => {
    const prior = selection.transitions.insurance;
    const choice = patch.choice !== undefined ? patch.choice : (prior?.choice ?? "");
    onChange({
      ...selection,
      transitions: {
        ...selection.transitions,
        insurance:
          choice === "applies" || choice === "does_not_apply"
            ? {
                choice,
                source:
                  patch.source !== undefined ? patch.source : (prior?.source ?? null),
              }
            : null,
      },
    });
  };
  const setRbp = (patch: { choice?: string; source?: string | null }) => {
    const prior = selection.transitions.rbp;
    const choice = patch.choice !== undefined ? patch.choice : (prior?.choice ?? "");
    onChange({
      ...selection,
      transitions: {
        ...selection.transitions,
        rbp:
          choice === "unchanged" || choice === "new" || choice === "changed"
            ? {
                choice,
                source:
                  patch.source !== undefined ? patch.source : (prior?.source ?? null),
              }
            : null,
      },
    });
  };

  const caseFor = (row: OfferChargeRow) =>
    row.origin === "case"
      ? (selection.caseEntries.find((entry) => `case:${entry.id}` === row.rowKey) ?? null)
      : null;
  const oneTime = (row: OfferChargeRow) => row.cadence?.kind === "one_time";
  const working = review.rows.filter(
    (row) => !INSPECT_ONLY.has(row.status) && !oneTime(row),
  );
  const fees = review.rows.filter((row) => !INSPECT_ONLY.has(row.status) && oneTime(row));
  const inspect = review.rows.filter((row) => INSPECT_ONLY.has(row.status));
  const totals = review.totals;
  // S277 R-S277-2: the stored base's basis, only while it is the amount these totals show.
  const baseWords = useWorkingBaseWords(
    totals.baseCents === null ? null : totals.baseCents / 100,
  );

  const rowItem = (row: OfferChargeRow): ReactNode => {
    const decision = decisionFor(row.rowKey);
    const entry = caseFor(row);
    const id = offerChargeRowControlId(row.rowKey);
    const proposed = row.status === "selected" && !decision && row.origin === "rentvine";
    // The reason stays visible once entered, so typing it never removes its own field.
    const needsReason =
      decision?.choice === "exclude" ||
      (decision?.choice === "include" &&
        (decision.reason !== null ||
          row.gaps.some((gap) => gap.startsWith("Say why this line applies"))));
    return (
      <li
        data-offer-charge-row={row.rowKey}
        data-offer-charge-status={row.status}
        data-offer-charge-origin={row.origin}
        id={id}
        key={row.rowKey}
        tabIndex={-1}
      >
        <p>
          <strong>{row.label}</strong>: {amountWords(row)}
          {row.effectiveFrom
            ? `, from ${formatCalendarDate(row.effectiveFrom)}`
            : ""}.{" "}
          <span data-offer-charge-state>
            {proposed ? "Proposed: included" : STATUS_WORDS[row.status]}
            {row.status === "selected" && row.comparison
              ? `, ${row.comparison === "unchanged" ? "stays the same" : row.comparison === "changed" ? "changed" : "new"}`
              : ""}
          </span>
        </p>
        <p className="muted">Source: {row.sourceLabel}.</p>
        {row.trigger ? <p className="muted">Trigger: {row.trigger}.</p> : null}
        {row.gaps.map((gap) => (
          <p data-offer-charge-gap key={gap} role="note">
            {gap}
          </p>
        ))}
        {row.choices.length ? (
          <Field
            htmlFor={`${base}-${id}-choice`}
            label={`Does ${row.label} apply to this offer?`}
          >
            <select
              disabled={!canEdit}
              id={`${base}-${id}-choice`}
              value={decision?.choice ?? ""}
              onChange={(event) =>
                decide(row, event.target.value as "" | "include" | "exclude")
              }
            >
              <option value="">{proposed ? "Proposed: include" : "Not decided"}</option>
              {row.choices.includes("include") ? (
                <option value="include">Include in this offer</option>
              ) : null}
              <option value="exclude">Leave out of this offer</option>
            </select>
          </Field>
        ) : null}
        {decision && needsReason ? (
          <Field
            htmlFor={`${base}-${id}-reason`}
            label={
              decision.choice === "exclude"
                ? "Why it does not apply (its evidence)"
                : "Why it applies (its source)"
            }
          >
            <input
              disabled={!canEdit}
              id={`${base}-${id}-reason`}
              maxLength={300}
              value={decision.reason ?? ""}
              onBlur={onCommit}
              onChange={(event) =>
                patchDecision(row, { reason: evidence(event.target.value) })
              }
            />
          </Field>
        ) : null}
        {decision?.choice === "include" &&
        row.origin === "rentvine" &&
        row.mappingEntryId === null ? (
          <Field
            htmlFor={`${base}-${id}-classification`}
            label="What this charge is for this lease"
            hint="For this lease only. A shared meaning is an Admin's offer charge mapping."
          >
            <select
              disabled={!canEdit}
              id={`${base}-${id}-classification`}
              value={decision.classification ?? ""}
              onChange={(event) => {
                patchDecision(row, {
                  classification:
                    (event.target.value as NonNullable<
                      OfferChargeDecision["classification"]
                    >) || null,
                });
                onCommit();
              }}
            >
              <option value="">Choose what it is</option>
              {CLASSIFICATION_FAMILIES.map((family) => (
                <option key={family} value={family}>
                  {MESSAGE_CHARGES[family]}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {decision?.choice === "include" && row.origin === "rentvine" ? (
          <details>
            <summary>Correct the renewal amount or date</summary>
            <Field
              error={amountErrors[`${id}-amount`]}
              htmlFor={`${base}-${id}-amount`}
              label="Renewal amount if it differs ($)"
              hint={
                row.sourceAmountCents === null
                  ? undefined
                  : `RentVine has ${formatCents(row.sourceAmountCents)}.`
              }
            >
              <input
                disabled={!canEdit}
                id={`${base}-${id}-amount`}
                inputMode="decimal"
                defaultValue={dollarsText(decision.renewalAmountCents)}
                onBlur={(event) =>
                  amountTyped(`${id}-amount`, event.target.value, (cents) =>
                    patchDecision(row, { renewalAmountCents: cents }),
                  )
                }
              />
            </Field>
            <Field
              htmlFor={`${base}-${id}-date`}
              label="Date it applies from if it differs"
            >
              <input
                disabled={!canEdit}
                id={`${base}-${id}-date`}
                type="date"
                value={decision.effectiveDate ?? ""}
                onChange={(event) =>
                  patchDecision(row, { effectiveDate: event.target.value || null })
                }
                onBlur={onCommit}
              />
            </Field>
            <Field htmlFor={`${base}-${id}-correction`} label="Source of the correction">
              <input
                disabled={!canEdit}
                id={`${base}-${id}-correction`}
                maxLength={300}
                value={decision.correctionSource ?? ""}
                onBlur={onCommit}
                onChange={(event) =>
                  patchDecision(row, { correctionSource: evidence(event.target.value) })
                }
              />
            </Field>
          </details>
        ) : null}
        {row.status === "needs_review" && decision && canEdit ? (
          <Button onClick={() => confirmAgain(row)} size="compact" variant="secondary">
            Confirm this line again
          </Button>
        ) : null}
        {entry ? (
          <div className="ui-stack-tight" data-offer-charge-case={entry.id}>
            <Field
              error={amountErrors[`${id}-case-amount`]}
              htmlFor={`${base}-${id}-case-amount`}
              label={`${row.label} amount ($)`}
            >
              <input
                disabled={!canEdit}
                id={`${base}-${id}-case-amount`}
                inputMode="decimal"
                defaultValue={dollarsText(entry.amountCents)}
                onBlur={(event) =>
                  amountTyped(`${id}-case-amount`, event.target.value, (cents) =>
                    patchCase(entry.id, { amountCents: cents }),
                  )
                }
              />
            </Field>
            <Field htmlFor={`${base}-${id}-case-date`} label="Date it applies from">
              <input
                disabled={!canEdit}
                id={`${base}-${id}-case-date`}
                type="date"
                value={entry.effectiveDate ?? ""}
                onChange={(event) =>
                  patchCase(entry.id, { effectiveDate: event.target.value || null })
                }
                onBlur={onCommit}
              />
            </Field>
            {isOneTimeFamily(entry.family) ? (
              <Field
                htmlFor={`${base}-${id}-case-trigger`}
                label="What triggers this fee for this lease"
              >
                <input
                  disabled={!canEdit}
                  id={`${base}-${id}-case-trigger`}
                  maxLength={300}
                  value={entry.trigger ?? ""}
                  onBlur={onCommit}
                  onChange={(event) =>
                    patchCase(entry.id, { trigger: evidence(event.target.value) })
                  }
                />
              </Field>
            ) : null}
            <Field
              htmlFor={`${base}-${id}-case-source`}
              label="Authorized case source or approved policy"
            >
              <input
                disabled={!canEdit}
                id={`${base}-${id}-case-source`}
                maxLength={300}
                value={entry.source ?? ""}
                onBlur={onCommit}
                onChange={(event) =>
                  patchCase(entry.id, { source: evidence(event.target.value) })
                }
              />
            </Field>
            {canEdit ? (
              <Button
                onClick={() => removeCase(entry.id)}
                size="compact"
                variant="tertiary"
              >
                Remove this charge
              </Button>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  const inspectList = inspect.length ? (
    <div className="ui-stack-tight" data-offer-charge-evidence>
      <p>
        <strong>Charge lines that do not apply to this renewal</strong>
      </p>
      <ul className="ui-rows">
        {inspect.map((row) => (
          <li
            data-offer-charge-row={row.rowKey}
            data-offer-charge-status={row.status}
            key={row.rowKey}
          >
            {row.label}: {amountWords(row)}
            {row.sourceStart ? `, from ${formatCalendarDate(row.sourceStart)}` : ""}
            {row.sourceEnd ? ` to ${formatCalendarDate(row.sourceEnd)}` : ""}.{" "}
            {STATUS_WORDS[row.status]}
            {row.requirement ? `: ${row.requirement}` : ""}. Source: {row.sourceLabel}.
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  const insurance = review.transitions.insurance;
  const rbp = review.transitions.rbp;
  const savedInsurance = selection.transitions.insurance;
  const savedRbp = selection.transitions.rbp;

  // S269: an open transition choice that leads the review sits before the line lists.
  const transitionLeads = review.lead !== null && review.lead.rowKey === null;
  const transitionsBlock = (
    <>
      {insurance.relevant ? (
        <div className="ui-stack-tight" data-offer-charge-transition="insurance">
          <Field
            htmlFor={MESSAGE_CONTROL_IDS.insurance("tenant")}
            label="Does the insurance transition apply to this renewal?"
          >
            <select
              disabled={!canEdit}
              id={MESSAGE_CONTROL_IDS.insurance("tenant")}
              value={savedInsurance?.choice ?? ""}
              onChange={(event) => {
                setInsurance({ choice: event.target.value });
                onCommit();
              }}
            >
              <option value="">Not decided (source pending)</option>
              <option value="applies">Applies</option>
              <option value="does_not_apply">Does not apply</option>
            </select>
          </Field>
          <Field
            htmlFor={`${base}-insurance-source`}
            label="Source for the insurance decision"
          >
            <input
              disabled={!canEdit || !savedInsurance}
              id={`${base}-insurance-source`}
              maxLength={300}
              value={savedInsurance?.source ?? ""}
              onBlur={onCommit}
              onChange={(event) => setInsurance({ source: evidence(event.target.value) })}
            />
          </Field>
          {insurance.choice && !insurance.source ? (
            <p role="note">
              Add its source; until then the transition stays source pending.
            </p>
          ) : null}
        </div>
      ) : null}
      {rbp.relevant ? (
        <div className="ui-stack-tight" data-offer-charge-transition="rbp">
          <Field
            htmlFor={MESSAGE_CONTROL_IDS.rbpChange}
            label="Is the Resident Benefits Package new, changed or unchanged?"
          >
            <select
              disabled={!canEdit}
              id={MESSAGE_CONTROL_IDS.rbpChange}
              value={savedRbp?.choice ?? ""}
              onChange={(event) => {
                setRbp({ choice: event.target.value });
                onCommit();
              }}
            >
              <option value="">Not decided (source pending)</option>
              <option value="unchanged">Unchanged</option>
              <option value="new">New</option>
              <option value="changed">Changed</option>
            </select>
          </Field>
          <Field htmlFor={`${base}-rbp-source`} label="Source for the package decision">
            <input
              disabled={!canEdit || !savedRbp}
              id={`${base}-rbp-source`}
              maxLength={300}
              value={savedRbp?.source ?? ""}
              onBlur={onCommit}
              onChange={(event) => setRbp({ source: evidence(event.target.value) })}
            />
          </Field>
          {rbp.choice && !rbp.source ? (
            <p role="note">
              Add its source; until then the package change stays source pending.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );

  return (
    <section
      aria-label="Review offer charges"
      className="ui-stack-tight renewal-offer-charges"
      data-renewal-offer-charges
      data-offer-charges-source={review.source}
      id={MESSAGE_CONTROL_IDS.offerCharges}
      tabIndex={-1}
    >
      <h3>Review offer charges</h3>
      {review.lead ? (
        <p data-offer-charges-lead role="note">
          First: {review.lead.text}
        </p>
      ) : (
        <p className="muted" data-offer-charges-lead="resolved">
          Every charge line for this offer is decided.
        </p>
      )}
      {review.source === "unavailable" ? (
        <p role="alert">
          The current RentVine charges could not be read. Refresh this lease to review
          them.
        </p>
      ) : review.source === "not_read" ? (
        <p className="muted">
          RentVine charges are not read here. A charge for this lease only is added with
          its case source.
        </p>
      ) : null}
      {unfinished ? (
        <p role="status">
          A charge entry is not finished, so the last saved review is kept until it is.
        </p>
      ) : null}
      {transitionLeads ? transitionsBlock : null}
      {working.length ? (
        <ul
          aria-label="Recurring charges"
          className="ui-rows"
          data-offer-charge-list="recurring"
        >
          {working.map(rowItem)}
        </ul>
      ) : (
        <p className="muted">No recurring charge lines apply to this renewal.</p>
      )}
      <div className="ui-stack-tight" data-offer-charge-list="one_time">
        <p>
          <strong>One-time fees</strong>
        </p>
        {fees.length ? (
          <ul aria-label="One-time fees" className="ui-rows">
            {fees.map(rowItem)}
          </ul>
        ) : (
          <p className="muted">
            No one-time fee is selected. A fee applies only with its approved policy or an
            authorized case source.
          </p>
        )}
      </div>
      {transitionLeads ? null : transitionsBlock}
      <dl className="renewal-offer-totals" data-offer-charge-totals>
        <dt>Renewal base rent</dt>
        <dd data-offer-charge-total="base">
          {totals.baseCents === null
            ? "Not entered yet"
            : `${formatCents(totals.baseCents)} per month`}
          {/* S277 R-S277-2: the basis of the renewal base rent, from the one projection. */}
          {baseWords ? (
            <span className="muted" data-renewal-field="renewal-base-rent-basis">
              , {baseWords.basis}.
            </span>
          ) : null}
        </dd>
        {totals.monthlyLines.map((line) => (
          <div key={line.rowKey}>
            <dt>{line.label}</dt>
            <dd data-offer-charge-total-line={line.rowKey}>
              {line.amountCents === null
                ? "Amount not entered"
                : `${formatCents(line.amountCents)} per month`}
            </dd>
          </div>
        ))}
        <dt>Monthly</dt>
        <dd
          data-offer-charge-total="monthly"
          data-offer-charge-complete={totals.monthlyComplete ? "true" : "false"}
        >
          {describeMonthlyTotal(totals)}
        </dd>
        {totals.otherRecurring.map((line) => (
          <div key={line.rowKey}>
            <dt>{line.label}</dt>
            <dd data-offer-charge-total-line={line.rowKey}>
              {line.amountCents === null
                ? "Amount not entered"
                : formatCents(line.amountCents)}{" "}
              every {line.months} months, not part of the monthly total
            </dd>
          </div>
        ))}
        {totals.oneTimeLines.map((line) => (
          <div key={line.rowKey}>
            <dt>{line.label}</dt>
            <dd data-offer-charge-total-line={line.rowKey}>
              {line.amountCents === null
                ? "Amount not entered"
                : `${formatCents(line.amountCents)} one time`}
            </dd>
          </div>
        ))}
        <dt>One time</dt>
        <dd
          data-offer-charge-total="one_time"
          data-offer-charge-complete={totals.oneTimeComplete ? "true" : "false"}
        >
          {describeOneTimeTotal(totals)}
        </dd>
      </dl>
      {totals.gaps.length ? (
        <ul aria-label="What the totals still need" data-offer-charge-total-gaps>
          {totals.gaps.map((gap) => (
            <li key={gap}>{gap}</li>
          ))}
        </ul>
      ) : null}
      {review.legacyNotes.map((note) => (
        <p className="muted" data-offer-charge-legacy-note key={note}>
          {note}
        </p>
      ))}
      {inspectList && evidenceHost ? createPortal(inspectList, evidenceHost) : null}
      {inspectList && !evidenceHost ? (
        <details>
          <summary>Charge lines that do not apply ({inspect.length})</summary>
          {inspectList}
        </details>
      ) : null}
    </section>
  );
}

/**
 * S264 with S270: "Add a charge for this lease only" is an optional choice, so it sits in the
 * outcome's options group (Tenant offer options and record of contact). It edits the same
 * selection the review owns and saves through the same message save; the new row then appears in
 * Review offer charges until its amount, date, trigger and source are entered.
 */
export function RenewalOfferChargeAdd({
  selection,
  canEdit,
  onChange,
  onCommit,
}: Pick<RenewalOfferChargesProps, "selection" | "canEdit" | "onChange" | "onCommit">) {
  const base = useId();
  const [newFamily, setNewFamily] = useState<OfferCaseFamily | "">("");
  const addCase = () => {
    if (!newFamily) return;
    onChange({
      ...selection,
      caseEntries: [
        ...selection.caseEntries,
        {
          id: crypto.randomUUID(),
          family: newFamily,
          amountCents: null,
          effectiveDate: null,
          trigger: null,
          source: null,
        },
      ],
    });
    setNewFamily("");
    onCommit();
  };
  if (!canEdit) return null;
  return (
    <div className="ui-row">
      <Field htmlFor={`${base}-add`} label="Add a charge for this lease only">
        <select
          id={`${base}-add`}
          value={newFamily}
          onChange={(event) => setNewFamily(event.target.value as OfferCaseFamily | "")}
        >
          <option value="">Choose a charge</option>
          {OFFER_CASE_FAMILIES.map((family) => (
            <option key={family} value={family}>
              {MESSAGE_CHARGES[family]}
              {isOneTimeFamily(family) ? " (one time)" : " (monthly)"}
            </option>
          ))}
        </select>
      </Field>
      <Button disabled={!newFamily} onClick={addCase} size="compact" variant="secondary">
        Add this charge
      </Button>
    </div>
  );
}

/**
 * The host element the tenant offer's read-only Verification renders (Guided or Full), followed as
 * the view mounts and replaces it. The page owns that element; this only finds it.
 */
export function useOfferChargeEvidenceHost(active: boolean): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!active) return;
    const find = () => setHost(document.getElementById(OFFER_CHARGE_EVIDENCE_HOST_ID));
    queueMicrotask(find);
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active]);
  return active ? host : null;
}
