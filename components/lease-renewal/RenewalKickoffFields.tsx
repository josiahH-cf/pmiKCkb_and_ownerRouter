"use client";

// S249: the prepared kickoff on the Now card, from the one preparation projection (ARCH-S249-1):
// the numbers check, the stored comparison and "Rent to recommend". Reading them saves nothing.
// Rent to recommend is the working renewal rent: a figure staff type is saved there with its one
// visible entry and is never replaced by a later proposal (AC-S249-5); a prefilled figure is a
// proposal until the staff member sends or types.

import { useLayoutEffect, useRef, useState } from "react";

import { Button, Field } from "@/components/ui";
import { AUTOSAVE_IDLE, AutosaveStatus, withEdited } from "./AutosaveStatus";
import { useWorkingFieldEditor } from "./WorkingFieldEditor";
import { formatUsd } from "@/lib/lease-renewal/owner-draft";
import {
  KICKOFF_WORDS,
  type RenewalPreparation,
} from "@/lib/lease-renewal/renewal-preparation";
import { comparableDistanceLabel } from "@/lib/lease-renewal/comparable-presentation";
import { parseOptionalCurrencyInput } from "@/lib/currency-input";
import { workingRenewalTerms } from "@/lib/lease-renewal/working-record";
import {
  focusRenewalDashboardControl,
  isRenewalPresentationMove,
} from "./RenewalDashboardNavigation";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import { workingRecommendationBasis } from "@/lib/lease-renewal/kickoff-facts";

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
}: Readonly<{ preparation: RenewalPreparation; action?: React.ReactNode }>) {
  const comparison = preparation.comparison;
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
      {comparison.firstComps.length > 0 ? (
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
      {comparison.fix || action ? (
        <p className="ui-row">
          {action}
          {comparison.fix ? (
            <Button
              onClick={() => focusRenewalDashboardControl(comparison.fix!.target)}
              size="compact"
              variant="secondary"
            >
              {comparison.fix.label}
            </Button>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}

/**
 * R-S249-5: the one "Rent to recommend" field. It shows the typed working renewal rent, else the
 * proposal with its basis in words. Typing saves the working renewal rent when the field is left.
 */
export function RentToRecommendField({
  preparation,
}: Readonly<{ preparation: RenewalPreparation }>) {
  const working = useRenewalWorkingRecord();
  const id = "renewal-now-rent-to-recommend";
  const input = useRef<HTMLInputElement>(null);
  const editor = useWorkingFieldEditor(working, "terms_rent", input);
  const typed = workingRenewalTerms(working?.record ?? null).rent;
  const proposal = preparation.rent.origin !== "typed" ? preparation.rent : null;
  const shown = typed ?? proposal?.value ?? null;
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
        ? `${proposal.basis} This is a proposal until you send or change it.`
        : preparation.rent.basis;
  async function save(value = text): Promise<boolean> {
    if (editor.shared) value = editor.draft()?.text ?? value;
    if (!working) return false;
    if (!editor.dirty()) return true;
    const generation = editor.version();
    const parsed = parseOptionalCurrencyInput(value);
    if (!parsed.ok || parsed.value === undefined || parsed.value <= 0) {
      setNotice("Enter the monthly rent as 1500 or $1,500.00.");
      return false;
    }
    if (
      typed !== null &&
      Math.abs(parsed.value - typed) < 0.005 &&
      !["failed", "saving"].includes(working.states?.terms_rent?.phase ?? "idle")
    ) {
      if (editor.confirmed(generation)) setDraft(null);
      return true;
    }
    const saved = await working.save("terms_rent", parsed.value, {
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
      <AutosaveStatus
        state={withEdited(working?.states?.terms_rent ?? AUTOSAVE_IDLE, dirty)}
        subject={KICKOFF_WORDS.rentToRecommend}
        onRetry={() => void editor.flush()}
      />
    </div>
  );
}
