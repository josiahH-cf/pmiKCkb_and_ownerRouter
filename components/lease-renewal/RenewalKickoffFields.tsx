"use client";

// S249: the prepared kickoff on the Now card, from the one preparation projection (ARCH-S249-1):
// the numbers check, the stored comparison and "Rent to recommend". Reading them saves nothing.
// Rent to recommend is the working renewal rent: a figure staff type is saved there with its one
// visible entry and is never replaced by a later proposal (AC-S249-5); a prefilled figure is a
// proposal until the staff member sends or types.

import { useLayoutEffect, useRef, useState } from "react";

import { Button, ConfirmationDialog, Field } from "@/components/ui";
import { AUTOSAVE_IDLE, AutosaveStatus, withEdited } from "./AutosaveStatus";
import { useWorkingFieldEditor } from "./WorkingFieldEditor";
import { formatUsd } from "@/lib/lease-renewal/owner-draft";
import {
  KICKOFF_FIX_TARGETS,
  KICKOFF_WORDS,
  type RenewalPreparation,
} from "@/lib/lease-renewal/renewal-preparation";
import { comparableDistanceLabel } from "@/lib/lease-renewal/comparable-presentation";
import { parseOptionalCurrencyInput } from "@/lib/currency-input";
import {
  offerAdoptionCandidate,
  recommendationFact,
  recommendationField,
  recommendedRentValue,
} from "@/lib/lease-renewal/current-cycle-terms";
import {
  focusRenewalDashboardControl,
  isRenewalPresentationMove,
} from "./RenewalDashboardNavigation";
import { HeldWorkingValueNote, useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import { useRenewalFocusView } from "./RenewalFocusViewContext";
import { workingRecommendationBasis } from "@/lib/lease-renewal/kickoff-facts";
import {
  OwnerCurrentBaseRent,
  type CurrentBaseRentFacts,
} from "./RenewalCurrentBaseRent";

/** The one Rent to recommend editor, in Compare market rent. */
const RENT_TO_RECOMMEND_TARGET = KICKOFF_FIX_TARGETS.rentToRecommend;

export function PreparedNumbersCheck({
  preparation,
}: Readonly<{ preparation: RenewalPreparation }>) {
  const numbers = preparation.numbers;
  return (
    <section
      aria-label="Numbers check"
      className="ui-stack-tight renewal-now-numbers"
      data-renewal-numbers={numbers.state}
    >
      <p>
        <strong data-renewal-field="numbers-line">{numbers.line}</strong>
        {numbers.facts.length > 0 ? `: ${numbers.facts.join(", ")}.` : null}
      </p>
      {numbers.sheetNotes.map((note) => (
        <p className="muted" data-renewal-field="sheet-note" key={note}>
          {note}
        </p>
      ))}
      <p className="muted" data-renewal-field="numbers-charges-note">
        {numbers.chargesNote}
      </p>
      {preparation.charges ? (
        // E: the lease page's own charge read, an extra fact beside the shared check.
        <p data-renewal-charges={preparation.charges.state}>
          {preparation.charges.line}.
          {preparation.charges.state === "difference" ? (
            <>
              {" "}
              <Button
                onClick={() =>
                  preparation.charges?.state === "difference"
                    ? focusRenewalDashboardControl(preparation.charges.fix.target)
                    : undefined
                }
                size="compact"
                variant="secondary"
              >
                {preparation.charges.fix.label}
              </Button>
            </>
          ) : null}
        </p>
      ) : null}
      {numbers.state === "difference" ? (
        <p>
          <Button
            onClick={() => focusRenewalDashboardControl(numbers.fix.target)}
            size="compact"
            variant="secondary"
          >
            {numbers.fix.label}
          </Button>
        </p>
      ) : null}
    </section>
  );
}

export function StoredComparisonSummary({
  preparation,
  action = null,
  readOnly = false,
  compact = false,
  showFix = true,
}: Readonly<{
  preparation: RenewalPreparation;
  action?: React.ReactNode;
  readOnly?: boolean;
  /** S269/S270: the estimate or range only; the comparable rows are read in Verification. */
  compact?: boolean;
  /** False where the outcome's one primary action already carries this fix. */
  showFix?: boolean;
}>) {
  const comparison = preparation.comparison;
  const fix = showFix ? comparison.fix : null;
  return (
    <section
      aria-label="Stored comparison"
      className="ui-stack-tight renewal-now-comparison"
      data-renewal-comparison={comparison.state}
    >
      <p>
        <span data-renewal-field="comparison-line">{comparison.line}</span>
        {comparison.ageLine ? (
          <span className="muted" data-renewal-field="comparison-age">
            {" "}
            · {comparison.ageLine}
          </span>
        ) : null}
      </p>
      {!compact && comparison.firstComps.length > 0 ? (
        <ol aria-label="Comparables" className="renewal-now-comps">
          {comparison.firstComps.map((comp, index) => (
            <li key={`${index}:${comp.rent}`}>
              Comparable {index + 1}
              {comp.bedrooms !== undefined ? `, ${comp.bedrooms} bedrooms` : ""}:{" "}
              {formatUsd(comp.rent)} per month ·{" "}
              {comparableDistanceLabel(comp.distanceMiles)}
            </li>
          ))}
        </ol>
      ) : null}
      {!readOnly && (fix || action) ? (
        <p className="ui-row">
          {action}
          {fix ? (
            <Button
              onClick={() => focusRenewalDashboardControl(fix.target)}
              size="compact"
              variant="secondary"
            >
              {fix.label}
            </Button>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}

/** S262: the one deliberate change of the working renewal base from Rent to recommend. */
export const USE_FOR_OFFER_LABEL = "Use this amount for the offer";

/**
 * R-S249-5: the one "Rent to recommend" field. It shows the typed working renewal rent, else the
 * proposal with its basis in words. Typing saves the working renewal rent when the field is left.
 * S262 R-S262-2: once a recorded owner answer or a deliberate adoption gives the working renewal
 * base its own value, this field edits Rent to recommend as its own fact and leaves the offer
 * basis and any approval coverage as they are. "Use this amount for the offer" is the one
 * deliberate way to move a differing recommendation into the working base.
 */
export function RentToRecommendField({
  preparation,
  placement = "any",
}: Readonly<{
  preparation: RenewalPreparation | null;
  /**
   * S269: Guided view holds this one editor in Compare market rent's active Work on the Now card;
   * `full` mounts it only in Full view. The typed entry is kept by the working record provider, so
   * switching views keeps it (S247).
   */
  placement?: "any" | "full";
}>) {
  const view = useRenewalFocusView();
  if (placement === "full" && view && view.view !== "full") return null;
  return <RentToRecommendEditor preparation={preparation} />;
}

function RentToRecommendEditor({
  preparation,
}: Readonly<{ preparation: RenewalPreparation | null }>) {
  const working = useRenewalWorkingRecord();
  const id = "renewal-now-rent-to-recommend";
  const input = useRef<HTMLInputElement>(null);
  const field = recommendationField(working?.record);
  const fact = recommendationFact(working?.record);
  const editor = useWorkingFieldEditor(working, field, input);
  const typed = recommendedRentValue(working?.record);
  const proposal =
    preparation?.rent.origin === "typed" ? null : (preparation?.rent ?? null);
  const shown = typed;
  const adoption = offerAdoptionCandidate(working?.record);
  const [adopting, setAdopting] = useState<"review" | "saving" | "refused" | null>(null);
  const adoptTrigger = useRef<HTMLButtonElement>(null);
  const baseState = working?.states?.terms_rent;
  async function adopt() {
    if (!working || !adoption) return;
    setAdopting("saving");
    const saved = await working.save("terms_rent", adoption.value, {
      recommendationRevision: adoption.recommendationRevision,
    });
    setAdopting(saved ? null : "refused");
  }
  // What staff are typing; null while they are not, so the field follows the saved or proposed rent.
  const [draft, setDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const sharedDraft = editor.draft();
  const text =
    sharedDraft?.text ??
    (editor.shared
      ? shown === null
        ? ""
        : String(shown)
      : (draft ?? (shown === null ? "" : String(shown))));
  const dirty = editor.shared ? sharedDraft !== null : draft !== null;
  const basis =
    typed !== null
      ? (workingRecommendationBasis(working?.record) ??
        "Entered by staff. A later proposal never replaces it.")
      : proposal && proposal.value !== null
        ? `Suggested ${formatUsd(proposal.value)}. ${proposal.basis}`
        : (preparation?.rent.basis ??
          "No suggested rent is available. Enter a recommendation if you have a basis.");
  async function save(value = text): Promise<boolean> {
    if (editor.shared) value = editor.draft()?.text ?? value;
    if (!working) return false;
    if (!editor.dirty()) return true;
    const generation = editor.version();
    if (value.trim() === "" && typed !== null) {
      const cleared = await working.save(field, null, {
        editorVersion: generation,
      });
      if (cleared && editor.confirmed(generation)) setDraft(null);
      return cleared;
    }
    const parsed = parseOptionalCurrencyInput(value);
    if (!parsed.ok || parsed.value === undefined || parsed.value <= 0) {
      setNotice("Enter the monthly rent as 1500 or $1,500.00.");
      return false;
    }
    if (
      typed !== null &&
      Math.abs(parsed.value - typed) < 0.005 &&
      !["failed", "saving"].includes(working.states?.[field]?.phase ?? "idle")
    ) {
      if (editor.confirmed(generation)) setDraft(null);
      return true;
    }
    const saved = await working.save(field, parsed.value, {
      editorVersion: generation,
    });
    if (saved && editor.confirmed(generation)) {
      setDraft(null);
      setNotice("");
    }
    return saved;
  }
  useLayoutEffect(() => {
    editor.commit(() => save());
  });
  return (
    <div
      className="ui-stack-tight renewal-now-rent"
      data-renewal-rent-origin={typed !== null ? "typed" : (proposal?.origin ?? "none")}
    >
      <Field
        htmlFor={id}
        label={KICKOFF_WORDS.rentToRecommend}
        required
        error={notice || undefined}
      >
        <input
          disabled={!working?.canEdit}
          id={id}
          required
          ref={input}
          inputMode="decimal"
          onBlur={(event) => {
            if (!isRenewalPresentationMove(event.relatedTarget)) void editor.flush();
          }}
          onChange={(event) => {
            const value = event.target.value;
            editor.edited(value);
            editor.commit(() => save(value));
            setDraft(value);
            setNotice("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void editor.flush();
            }
          }}
          value={text}
        />
      </Field>
      <p className="muted" data-renewal-field="rent-basis">
        {basis}
      </p>
      {fact.kind === "unavailable" ? (
        // S262: the recorded owner answer set the offer amount and no earlier recommendation
        // can be established; the approved rent is never copied back into this field.
        <p className="muted" data-renewal-field="recommendation-unavailable">
          The earlier recommendation is not available. The offer amount is the amount
          recorded from the owner&apos;s answer.
        </p>
      ) : null}
      <HeldWorkingValueNote field={field} format={(value) => formatUsd(Number(value))} />
      <AutosaveStatus
        state={withEdited(working?.states?.[field] ?? AUTOSAVE_IDLE, dirty)}
        subject={KICKOFF_WORDS.rentToRecommend}
        onRetry={() => void editor.flush()}
      />
      {adoption && working?.canEdit && !dirty ? (
        <p data-renewal-field="use-for-offer">
          <span className="muted">
            The offer uses{" "}
            {adoption.workingValue === null
              ? "no amount yet"
              : formatUsd(adoption.workingValue)}
            .{" "}
          </span>
          <Button
            onClick={() => setAdopting("review")}
            ref={adoptTrigger}
            size="compact"
            variant="secondary"
          >
            {USE_FOR_OFFER_LABEL}
          </Button>
        </p>
      ) : null}
      {adoption ? (
        <ConfirmationDialog
          busy={adopting === "saving"}
          confirmLabel={`Use ${formatUsd(adoption.value)} for the offer`}
          error={
            adopting === "refused"
              ? baseState?.phase === "failed"
                ? baseState.message
                : "The offer amount was not changed."
              : undefined
          }
          onCancel={() => setAdopting(null)}
          onConfirm={() => void adopt()}
          open={adopting !== null}
          title={`${USE_FOR_OFFER_LABEL}?`}
          triggerRef={adoptTrigger}
        >
          <p>
            The offer amount changes from{" "}
            {adoption.workingValue === null
              ? "no amount"
              : formatUsd(adoption.workingValue)}{" "}
            to {formatUsd(adoption.value)}, the current Rent to recommend.
          </p>
          <p>
            The owner&apos;s recorded answer stays as recorded. This is not an owner
            approval: an approval of the earlier amount no longer covers the offer, and
            prepared offer previews are reviewed again.
          </p>
        </ConfirmationDialog>
      ) : null}
    </div>
  );
}

/**
 * The owner outcome reads the current base rent and the working amount, and links to the only
 * editor of Rent to recommend in Compare market rent (S261: one editor per value).
 */
export function RentRecommendationSummary({
  preparation,
  base = null,
}: Readonly<{
  preparation: RenewalPreparation | null;
  /** S261: the lease facts the one base decision reads; absent where the page has none. */
  base?: CurrentBaseRentFacts | null;
}>) {
  const working = useRenewalWorkingRecord();
  // S262 R-S262-2: Rent to recommend's own value once it is its own fact; an unavailable
  // recommendation is never filled from the approved rent.
  const rent =
    recommendationFact(working?.record).kind === "unavailable"
      ? null
      : (recommendedRentValue(working?.record) ?? preparation?.rent.value ?? null);
  const target = RENT_TO_RECOMMEND_TARGET;
  return (
    <div className="ui-stack-tight" data-renewal-field="owner-pricing-summary">
      {base ? <OwnerCurrentBaseRent facts={base} /> : null}
      <p data-renewal-field="owner-recommended-rent">
        {KICKOFF_WORDS.rentToRecommend}:{" "}
        <strong>{rent === null ? "Not set" : formatUsd(rent)}</strong>{" "}
        <a
          className="text-link"
          href={`#${target}`}
          onClick={(event) => {
            // The link opens the editor in the step that owns it, in this view.
            event.preventDefault();
            focusRenewalDashboardControl(target);
          }}
        >
          {working?.canEdit ? "Edit rent to recommend" : "View rent to recommend"}
        </a>
      </p>
    </div>
  );
}
