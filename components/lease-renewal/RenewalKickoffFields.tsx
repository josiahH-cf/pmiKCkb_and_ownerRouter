"use client";

// S249: the prepared kickoff on the Now card, from the one preparation projection (ARCH-S249-1):
// the numbers check, the stored comparison and "Rent to recommend". Reading them saves nothing.
// Rent to recommend is the working renewal rent: a figure staff type is saved there with its one
// visible entry and is never replaced by a later proposal (AC-S249-5); a prefilled figure is a
// proposal until the staff member sends or types.

import { useState } from "react";

import { Button } from "@/components/ui";
import { formatUsd } from "@/lib/lease-renewal/owner-draft";
import {
  KICKOFF_WORDS,
  type RenewalPreparation,
} from "@/lib/lease-renewal/renewal-preparation";
import { comparableDistanceLabel } from "@/lib/lease-renewal/comparable-presentation";
import { parseOptionalCurrencyInput } from "@/lib/currency-input";
import { workingRenewalTerms } from "@/lib/lease-renewal/working-record";
import { focusRenewalDashboardControl } from "./RenewalDashboardNavigation";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";

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
  const typed = workingRenewalTerms(working?.record ?? null).rent;
  const proposal = preparation.rent.origin !== "typed" ? preparation.rent : null;
  const shown = typed ?? proposal?.value ?? null;
  // What staff are typing; null while they are not, so the field follows the saved or proposed rent.
  const [draft, setDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const text = draft ?? (shown === null ? "" : String(shown));
  const dirty = draft !== null;
  const basis =
    typed !== null
      ? "Entered by staff. A later proposal never replaces it."
      : proposal && proposal.value !== null
        ? `${proposal.basis} This is a proposal until you send or change it.`
        : preparation.rent.basis;
  async function save() {
    if (!working || !dirty) return;
    const parsed = parseOptionalCurrencyInput(text);
    if (!parsed.ok || parsed.value === undefined || parsed.value <= 0) {
      setNotice("Enter the monthly rent as 1500 or $1,500.00.");
      return;
    }
    if (typed !== null && Math.abs(parsed.value - typed) < 0.005) {
      setDraft(null);
      return;
    }
    const saved = await working.save("terms_rent", parsed.value);
    if (saved) {
      setDraft(null);
      setNotice("Saved as the rent to recommend.");
    } else
      setNotice(
        "The rent was not saved yet. Your entry is kept; leave the field to retry.",
      );
  }
  return (
    <div
      className="ui-stack-tight renewal-now-rent"
      data-renewal-rent-origin={typed !== null ? "typed" : (proposal?.origin ?? "none")}
    >
      <label htmlFor={id}>{KICKOFF_WORDS.rentToRecommend}</label>
      <input
        disabled={!working?.canEdit}
        id={id}
        inputMode="decimal"
        onBlur={() => void save()}
        onChange={(event) => {
          setDraft(event.target.value);
          setNotice("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
        }}
        value={text}
      />
      <p className="muted" data-renewal-field="rent-basis">
        {basis}
      </p>
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  );
}
