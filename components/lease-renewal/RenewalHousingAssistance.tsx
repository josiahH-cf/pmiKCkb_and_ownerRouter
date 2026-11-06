"use client";

// S251: Housing assistance recorded once on the lease, and the assisted order's own controls.
//
// The field is optional (R-S251-1): not set asks nothing, renders no prompt, blocker or required
// mark (AC-S251-2), and nothing is preselected. It saves by itself on the lease-bound working
// record with who and when (R-S251-2), carries across renewal cycles until staff change it
// (R-S251-3) and is never written to RentVine or the operating Sheet. RentVine wording that
// mentions housing assistance shows a suggestion and saves nothing (R-S251-10).

import { useId, useState } from "react";

import { Button, Field } from "@/components/ui";
import { formatBusinessTimestamp } from "@/lib/date-display";
import { HOUSING_ASSISTANCE_SUGGESTION } from "@/lib/lease-renewal/cohort";
import {
  ASSISTED_CONTROL_IDS,
  ASSISTED_RENEWAL_ANSWERS,
  ASSISTED_RENT_CHOICES,
  assistedProgramContactLabel,
} from "@/lib/lease-renewal/renewal-path";
import {
  housingAssistanceFact,
  workingEntry,
  workingRenewalTerms,
  type HousingAssistanceValue,
} from "@/lib/lease-renewal/working-record";
import { currentRentChoice } from "@/lib/lease-renewal/workspace-state";
import { useRenewalManualWorkspace } from "./RenewalManualWorkspace";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";

const FIELD = "housing_assistance";

const usd = (amount: number) =>
  `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/**
 * S251 R-S251-6: whether "Keep the current rent" would replace a working rent staff already
 * saved (a different amount). Such a replacement is asked for first, never made silently.
 */
export function keepCurrentRentReplaces(
  savedWorkingRent: number | null,
  currentRent: number | null,
): boolean {
  return (
    savedWorkingRent !== null &&
    currentRent !== null &&
    currentRent > 0 &&
    Math.abs(savedWorkingRent - currentRent) >= 0.005
  );
}

/** The words the field and the desk read (R-S251-1). */
export const HOUSING_ASSISTANCE_WORDS = {
  field: "Housing assistance",
  no: "No",
  yes: "Yes",
  program: "Program name",
  contact: "Program contact (optional)",
  notes: "Notes (optional)",
  clear: "Clear the field",
} as const;

function attribution(entry: ReturnType<typeof workingEntry>): string | null {
  if (!entry) return null;
  return `${entry.value === null ? "Cleared" : "Saved"} by ${entry.recordedByLabel}, ${formatBusinessTimestamp(entry.recordedAt)}`;
}

/**
 * R-S251-1 / R-S251-2: "Housing assistance": not set, No, or Yes with the program name and an
 * optional contact and notes. It sits on the Check the numbers step and in Lease information.
 */
export function HousingAssistanceField({
  mention = false,
  placement,
}: Readonly<{
  /** RentVine text mentions housing assistance: a suggestion only (R-S251-10). */
  mention?: boolean;
  placement: "now" | "lease-information";
}>) {
  const working = useRenewalWorkingRecord();
  const id = useId();
  const entry = workingEntry(working?.record, FIELD);
  const saved = housingAssistanceFact(working?.record);
  const [status, setStatus] = useState<"no" | "yes" | null>(saved?.status ?? null);
  const [program, setProgram] = useState(saved?.status === "yes" ? saved.program : "");
  const [contact, setContact] = useState(
    saved?.status === "yes" ? (saved.contact ?? "") : "",
  );
  const [notes, setNotes] = useState(saved?.status === "yes" ? (saved.notes ?? "") : "");
  const [notice, setNotice] = useState("");
  const [programTouched, setProgramTouched] = useState(false);
  // Adopt a newer saved value (the other placement, a reload) while nothing here is being typed.
  const [seen, setSeen] = useState(entry?.revision ?? 0);
  if ((entry?.revision ?? 0) !== seen) {
    setSeen(entry?.revision ?? 0);
    setStatus(saved?.status ?? null);
    setProgram(saved?.status === "yes" ? saved.program : "");
    setContact(saved?.status === "yes" ? (saved.contact ?? "") : "");
    setNotes(saved?.status === "yes" ? (saved.notes ?? "") : "");
    setProgramTouched(false);
  }
  if (!working) return null;
  const state = working.states[FIELD];
  async function save(value: HousingAssistanceValue | null) {
    if (!working) return;
    if (JSON.stringify(value) === JSON.stringify(saved)) return;
    const ok = await working.save(FIELD, value);
    setNotice(
      ok
        ? value === null
          ? "Housing assistance cleared for this lease."
          : "Housing assistance saved for this lease."
        : "Housing assistance was not saved yet. Your entry is kept.",
    );
  }
  const yesValue = (): HousingAssistanceValue | null =>
    program.trim()
      ? {
          status: "yes",
          program: program.trim(),
          ...(contact.trim() ? { contact: contact.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }
      : null;
  return (
    <div
      className="ui-stack-tight renewal-housing-assistance"
      data-renewal-housing-assistance={saved?.status ?? "not_set"}
      data-renewal-housing-placement={placement}
      id={
        placement === "now"
          ? "renewal-now-housing-assistance"
          : "renewal-lease-housing-assistance"
      }
    >
      <fieldset className="ui-stack-tight">
        <legend>{HOUSING_ASSISTANCE_WORDS.field}</legend>
        {mention && !saved ? (
          <p className="muted" data-renewal-field="housing-assistance-suggestion">
            {HOUSING_ASSISTANCE_SUGGESTION}
          </p>
        ) : null}
        {(
          [
            ["no", HOUSING_ASSISTANCE_WORDS.no],
            ["yes", HOUSING_ASSISTANCE_WORDS.yes],
          ] as const
        ).map(([value, label]) => (
          <label className="ui-row" key={value}>
            <input
              checked={status === value}
              disabled={!working.canEdit}
              name={`${id}-status`}
              onChange={() => {
                setStatus(value);
                setProgramTouched(false);
                setNotice("");
                if (value === "no") void save({ status: "no" });
              }}
              type="radio"
              value={value}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {status === "yes" ? (
        <>
          <Field
            htmlFor={`${id}-program`}
            label={HOUSING_ASSISTANCE_WORDS.program}
            required
            hint={
              !program.trim()
                ? "Enter the program name to save Housing assistance as Yes."
                : undefined
            }
            error={
              programTouched && !program.trim()
                ? "Enter a program name for this lease."
                : undefined
            }
          >
            <input
              disabled={!working.canEdit}
              id={`${id}-program`}
              maxLength={120}
              onBlur={() => {
                setProgramTouched(true);
                const value = yesValue();
                if (value) void save(value);
              }}
              onChange={(event) => setProgram(event.target.value)}
              value={program}
              required
            />
          </Field>
          <Field htmlFor={`${id}-contact`} label={HOUSING_ASSISTANCE_WORDS.contact}>
            <input
              disabled={!working.canEdit}
              id={`${id}-contact`}
              maxLength={200}
              onBlur={() => {
                const value = yesValue();
                if (value) void save(value);
              }}
              onChange={(event) => setContact(event.target.value)}
              value={contact}
            />
          </Field>
          <Field htmlFor={`${id}-notes`} label={HOUSING_ASSISTANCE_WORDS.notes}>
            <textarea
              disabled={!working.canEdit}
              id={`${id}-notes`}
              maxLength={1000}
              onBlur={() => {
                const value = yesValue();
                if (value) void save(value);
              }}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              value={notes}
            />
          </Field>
        </>
      ) : null}
      {saved && working.canEdit ? (
        <p>
          <Button
            onClick={() => {
              setStatus(null);
              setProgram("");
              setContact("");
              setNotes("");
              void save(null);
            }}
            size="compact"
            variant="tertiary"
          >
            {HOUSING_ASSISTANCE_WORDS.clear}
          </Button>
        </p>
      ) : null}
      {attribution(entry) ? (
        <p className="muted working-field-attribution">{attribution(entry)}</p>
      ) : null}
      {state?.phase === "failed" ? (
        <p role="alert">{state.message ?? "The field was not saved."}</p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  );
}

function toIso(local: string): string | null {
  if (!local) return null;
  const when = new Date(local);
  return Number.isNaN(when.getTime()) ? null : when.toISOString();
}

/**
 * S251 R-S251-5 / R-S251-6: the assisted order's two choices, in the owner section where the Now
 * card reveals them in place. "Ask the owner whether to renew this tenant" (Renew, Do not renew,
 * No answer yet) records who answered, how and when on the existing owner response; Do not renew
 * moves the lease to the existing non-renewal handoff. "Rent for this renewal" (Keep the current
 * rent, Propose a change) is recorded for this cycle; Keep also sets the working rent to the
 * current rent as a recorded staff choice. Nothing is preselected; neither control disables any
 * other step (S156).
 */
export function AssistedRenewalControls({
  currentRent = null,
}: Readonly<{ currentRent?: number | null }>) {
  const manual = useRenewalManualWorkspace();
  const working = useRenewalWorkingRecord();
  const id = useId();
  const [answer, setAnswer] = useState<string | null>(null);
  const [who, setWho] = useState("");
  const [when, setWhen] = useState("");
  const [rent, setRent] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  // A working rent staff already saved is never replaced without asking.
  const [confirmReplace, setConfirmReplace] = useState(false);
  if (!manual) return null;
  const fact = housingAssistanceFact(working?.record);
  const program = fact?.status === "yes" ? fact.program : null;
  const recordedAnswer = manual.state?.ownerResponse?.outcome ?? null;
  const recordedRent = currentRentChoice(manual.state);
  const savedWorkingRent = workingRenewalTerms(working?.record ?? null).rent;
  const replaces = keepCurrentRentReplaces(savedWorkingRent, currentRent);
  async function recordAnswer() {
    if (!manual || !answer) return;
    const occurredAt = toIso(when);
    try {
      await manual.record({
        kind: "owner_response",
        outcome: answer as "renew_tenant" | "declined_non_renewal" | "no_response",
        ...(who.trim() ? { source: who.trim() } : {}),
        ...(occurredAt ? { occurredAt } : {}),
      });
      setAnswer(null);
      setNotice("The owner's answer is recorded.");
    } catch {
      setNotice("The owner's answer was not recorded yet. Your choice is kept.");
    }
  }
  /**
   * Record the rent choice. Keep the current rent with a different working rent already saved
   * asks first: replace it with the current rent, or record the choice and keep the saved rent.
   */
  async function recordRent(replaceSaved?: boolean) {
    if (!manual || !rent) return;
    if (rent === "keep_current" && replaces && replaceSaved === undefined) {
      setConfirmReplace(true);
      return;
    }
    setConfirmReplace(false);
    try {
      await manual.record({
        kind: "rent_choice",
        choice: rent as "keep_current" | "propose_change",
      });
      if (rent === "keep_current" && replaceSaved === false)
        setNotice(
          "Recorded: keep the current rent. The working rent you saved stays as it is; change it in Working renewal terms when you are ready.",
        );
      // Keep sets the working rent to the current rent as a recorded staff choice.
      else if (
        rent === "keep_current" &&
        working &&
        currentRent !== null &&
        currentRent > 0
      ) {
        const ok = await working.save("terms_rent", currentRent, {
          origin: "adopted_source",
          sourceLabel: "RentVine contractual base rent",
          context: "Keep the current rent",
        });
        setNotice(
          ok
            ? "Recorded: keep the current rent. The working rent is the current rent."
            : "The choice is recorded; the working rent was not saved yet. Enter it as the working renewal rent.",
        );
      } else setNotice("The rent choice is recorded.");
      setRent(null);
    } catch {
      setNotice("The rent choice was not recorded yet. Your choice is kept.");
    }
  }
  const recordedAnswerLabel = ASSISTED_RENEWAL_ANSWERS.find(
    (option) => option.value === recordedAnswer,
  )?.label;
  return (
    <div className="ui-stack" data-renewal-assisted-controls>
      <p className="muted">
        {assistedProgramContactLabel(program)} first, recorded as the program contact
        above.
      </p>
      <section
        aria-label="Ask the owner whether to renew this tenant"
        className="ui-stack-tight"
        id={ASSISTED_CONTROL_IDS.renewalAnswer}
        tabIndex={-1}
      >
        <h3>Ask the owner whether to renew this tenant</h3>
        <p className="muted">
          Record the contact you made with the owner another way, or send the standard
          owner message.
          {recordedAnswerLabel ? ` Recorded: ${recordedAnswerLabel}.` : ""}
          {recordedAnswer === "approved_terms"
            ? " The owner approved the terms, which answers renewing and the rent together."
            : ""}
        </p>
        <fieldset className="ui-stack-tight">
          <legend>The owner&rsquo;s answer</legend>
          {ASSISTED_RENEWAL_ANSWERS.map((option) => (
            <label className="ui-row" key={option.value}>
              <input
                checked={answer === option.value}
                disabled={manual.pending}
                name={`${id}-answer`}
                onChange={() => setAnswer(option.value)}
                type="radio"
                value={option.value}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <Field
          htmlFor={`${id}-who`}
          label="Who answered and how (optional)"
          hint="For example the owner by phone."
        >
          <input
            disabled={manual.pending}
            id={`${id}-who`}
            maxLength={240}
            onChange={(event) => setWho(event.target.value)}
            value={who}
          />
        </Field>
        <Field htmlFor={`${id}-when`} label="When (optional)">
          <input
            disabled={manual.pending}
            id={`${id}-when`}
            onChange={(event) => setWhen(event.target.value)}
            type="datetime-local"
            value={when}
          />
        </Field>
        <p>
          <Button
            disabled={manual.pending || !answer}
            onClick={() => void recordAnswer()}
            size="compact"
          >
            Record the owner&rsquo;s answer
          </Button>
        </p>
      </section>
      <section
        aria-label="Rent for this renewal"
        className="ui-stack-tight"
        id={ASSISTED_CONTROL_IDS.rentChoice}
        tabIndex={-1}
      >
        <h3>Rent for this renewal</h3>
        {recordedRent ? (
          <p className="muted" data-renewal-field="assisted-rent-recorded">
            Recorded:{" "}
            {ASSISTED_RENT_CHOICES.find((option) => option.value === recordedRent)?.label}
            .
          </p>
        ) : null}
        <fieldset className="ui-stack-tight">
          <legend>Rent choice</legend>
          {ASSISTED_RENT_CHOICES.map((option) => (
            <label className="ui-row" key={option.value}>
              <input
                checked={rent === option.value}
                disabled={manual.pending}
                name={`${id}-rent`}
                onChange={() => {
                  setRent(option.value);
                  setConfirmReplace(false);
                }}
                type="radio"
                value={option.value}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <p>
          <Button
            disabled={manual.pending || !rent}
            onClick={() => void recordRent()}
            size="compact"
          >
            Record the rent choice
          </Button>
        </p>
        {confirmReplace && savedWorkingRent !== null && currentRent !== null ? (
          <div
            className="ui-stack-tight"
            data-renewal-field="assisted-rent-replace"
            role="group"
            aria-label="Replace the saved working rent?"
          >
            <p>
              The working rent you saved is {usd(savedWorkingRent)}. Keep the current rent
              sets it to {usd(currentRent)}.
            </p>
            <p className="ui-row">
              <Button
                disabled={manual.pending}
                onClick={() => void recordRent(true)}
                size="compact"
              >
                Replace it with the current rent
              </Button>
              <Button
                disabled={manual.pending}
                onClick={() => void recordRent(false)}
                size="compact"
                variant="secondary"
              >
                Keep the saved working rent
              </Button>
            </p>
          </div>
        ) : null}
      </section>
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  );
}
