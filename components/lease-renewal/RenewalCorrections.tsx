"use client";
import { useRenewalSaveFocus } from "./RenewalSaveFocus";

import { renewalCardTitle } from "@/components/lease-renewal/RenewalSectionHeading";
import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import type { RenewalDiscrepancyDisposition } from "@/lib/firestore/renewal-discrepancy-dispositions";
import { RenewalFutureRent } from "./RenewalFutureRent";
import { WORKING_CURRENT_RENT_TARGET } from "./RenewalCurrentRent";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field } from "@/components/ui";
import { can, type Role } from "@/lib/auth/roles";
import { parseCurrencyInput } from "@/lib/currency-input";
import { formatMoneyReference } from "@/lib/lease-renewal/current-rent-display";
import type { DeskReconItem } from "@/lib/lease-renewal/desk-model";
import { planRentChargeRequests } from "@/lib/lease-renewal/rent-charge-intent";
import {
  SHEET_FIELD_LABELS,
  sheetFieldShape,
  parseSheetFieldIntent,
  type SheetEditableField,
} from "@/lib/lease-renewal/sheet-writeback/field-intent";
import { workingCurrentRent } from "@/lib/lease-renewal/working-record";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";

// S157 (BEH-1/3/6/8/9): the current rent is corrected by editing the working current rent in the
// Rent and charges card; it saves by itself with no request, review handoff, reconciliation
// approval or mandatory narrative. This card compares that working value with each observed
// source, lets staff adopt an observed value as an application edit, and keeps the existing
// prepare-a-preview flow for the other recognized facts, which an Editor completes alone: the
// prepared Sheet or RentVine change is reviewed and confirmed once, in its own panel.

/** Stored where the Sheet field contract expects a nonempty source note; describes, never attests. */
const STAFF_ENTRY_SOURCE_LABEL = "Staff entry";

async function post(route: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/lease-renewal/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "This preparation could not be saved.");
  return result;
}

interface ObservedSource {
  readonly label: string;
  readonly raw: string;
  readonly amount: number | null;
}

function observedCurrentRentSources(
  item: DeskReconItem | undefined,
  sheetValues: Record<string, string> | null,
): ObservedSource[] {
  const sources: ObservedSource[] = (item?.candidates ?? []).map((candidate) => {
    const parsed = parseCurrencyInput(candidate.value);
    return {
      label: candidate.source,
      raw: candidate.value,
      amount: parsed.ok && parsed.value > 0 ? parsed.value : null,
    };
  });
  const sheetListed = item?.candidates.some(
    (candidate) => candidate.sourceSystem === "Google Sheets",
  );
  if (sheetValues && "current_rent" in sheetValues && !sheetListed) {
    const parsed = parseCurrencyInput(sheetValues.current_rent);
    sources.push({
      label: "Operating Sheet",
      raw: sheetValues.current_rent,
      amount: parsed.ok && parsed.value > 0 ? parsed.value : null,
    });
  }
  return sources;
}

export function RenewalCorrections({
  leaseId,
  role,
  dataCheck,
  sheetValues,
  workspaceContext,
  inventory,
  sheetPreviewHash,
  rentvinePreviewHash,
}: {
  leaseId: string;
  role: Role;
  dataCheck: readonly DeskReconItem[];
  sheetValues: Record<string, string> | null;
  workspaceContext: string | null;
  inventory: RenewalChargeInventory | null;
  sheetPreviewHash: string | null;
  rentvinePreviewHash: string | null;
  /** No longer used (S157): the review handoff is gone. Accepted so existing mounts still compile. */
  reviewHref?: string | null;
  /** No longer used (S157): proposals for review are not recorded. Accepted for existing mounts. */
  dispositions?: RenewalDiscrepancyDisposition[];
}) {
  const id = useId(),
    router = useRouter();
  const focusAfterSave = useRenewalSaveFocus();
  const working = useRenewalWorkingRecord();
  // S117 (R117.1): a known RentVine value is prefilled with its source shown; the operator can
  // edit it. The source or context note is optional.
  function prefillFor(target: SheetEditableField) {
    const item = dataCheck.find((entry) => entry.fieldKey === target);
    const rentvine = item?.candidates.filter((candidate) =>
      /rentvine/i.test(candidate.sourceSystem),
    );
    return rentvine && rentvine.length === 1 && rentvine[0].value
      ? { value: rentvine[0].value, confidence: rentvine[0].confidence }
      : null;
  }
  // The current rent is edited in the Rent and charges card, so the form opens on the renewal date.
  const [field, setField] = useState<SheetEditableField>("renewal_date"),
    [value, setValue] = useState(() => prefillFor("renewal_date")?.value ?? ""),
    [source, setSource] = useState(""),
    [destination, setDestination] = useState("sheet"),
    [pending, setPending] = useState(false),
    [notice, setNotice] = useState(""),
    [prepared, setPrepared] = useState<Record<string, string>>({}),
    [hashes, setHashes] = useState({
      sheet: sheetPreviewHash,
      rentvine: rentvinePreviewHash,
    });
  const shape = sheetFieldShape(field),
    observed = dataCheck.find((entry) => entry.fieldKey === field),
    currency = parseCurrencyInput(value),
    numeric = currency.ok ? currency.value : NaN,
    rvSupported = field === "current_rent" || field === "renewal_date",
    selectedSheet = destination !== "rentvine",
    selectedRentvine = destination !== "sheet";
  const workingRent = workingCurrentRent(working?.record);
  const currentRentSources = observedCurrentRentSources(
    dataCheck.find((entry) => entry.fieldKey === "current_rent"),
    sheetValues,
  );
  function edit(nextValue: string, nextSource = source) {
    if (shape === "boolean" || shape === "yes_no")
      nextValue = /^(yes|true)$/i.test(nextValue.trim())
        ? "true"
        : /^(no|false)$/i.test(nextValue.trim())
          ? "false"
          : "";
    if (shape === "date") {
      const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(nextValue.trim());
      if (match)
        nextValue = `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
    }
    setValue(nextValue);
    setSource(nextSource);
    setPrepared({});
  }
  const prefill = prefillFor(field);
  function choose(nextField: SheetEditableField) {
    setField(nextField);
    edit(prefillFor(nextField)?.value ?? "");
    setSource("");
    setNotice("");
    if (nextField !== "renewal_date") setDestination("sheet");
  }
  async function run(operation: () => Promise<void>) {
    setPending(true);
    setNotice("");
    try {
      await operation();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The request could not be read back. Reload before continuing.",
      );
    } finally {
      setPending(false);
    }
  }
  async function adopt(entry: ObservedSource) {
    if (!working || entry.amount === null) return;
    await working.save("current_rent", entry.amount, {
      origin: "adopted_source",
      sourceLabel: entry.label,
    });
  }
  async function prepare() {
    if (!value.trim()) throw new Error("Enter or select the reviewed value.");
    const note = source.trim();
    const intent = parseSheetFieldIntent({
      field,
      source: note || STAFF_ENTRY_SOURCE_LABEL,
      value:
        shape === "currency"
          ? numeric
          : shape === "boolean" || shape === "yes_no"
            ? value === "true"
            : value,
    });
    // S117 (ARCH-S117-1): one typed *current* intent; the mapper cannot emit a future-rent body.
    const plans = planRentChargeRequests(
      {
        scope: "current",
        field,
        value: intent.value,
        source: intent.source,
        destinations: [
          ...(selectedSheet ? (["sheet"] as const) : []),
          ...(selectedRentvine ? (["rentvine"] as const) : []),
        ],
      },
      {
        leaseId,
        workspaceContext,
        sheetRowAvailable: sheetValues !== null,
        priorHashes: hashes,
        inventory,
      },
    );
    for (const plan of plans) {
      const target = plan.destination;
      try {
        if ("refusal" in plan) throw new Error(plan.refusal);
        // S157: a narrative is optional context; it travels only when staff typed one.
        const { evidenceRef, ...body } = plan.body;
        const result = await post(plan.route, note ? { ...body, evidenceRef } : body);
        if (!result.proposal?.preview_hash)
          throw new Error(
            "No saved preview was returned. Check this source connection and reload.",
          );
        setHashes((previous) => ({
          ...previous,
          [target]: result.proposal.preview_hash,
        }));
        setPrepared((previous) => ({
          ...previous,
          [target]: "Saved: review and confirm its exact effect below",
        }));
      } catch (error) {
        setPrepared((previous) => ({
          ...previous,
          [target]:
            error instanceof Error
              ? error.message
              : "Preparation unavailable; no write confirmed",
        }));
      }
    }
    if (!focusAfterSave?.()) router.refresh();
  }
  return (
    <>
      <Card
        title={renewalCardTitle("correct-a-fact", "Correct a lease fact")}
        ariaLabel="Correct a lease fact"
      >
        <Field htmlFor={`${id}-field`} label="Fact to correct">
          <select
            id={`${id}-field`}
            value={field}
            onChange={(event) => choose(event.target.value as SheetEditableField)}
          >
            {Object.entries(SHEET_FIELD_LABELS)
              .filter(
                ([key]) =>
                  key === "current_rent" ||
                  key === "renewal_date" ||
                  key in (sheetValues ?? {}),
              )
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
        </Field>
        {field === "current_rent" ? (
          <div className="ui-stack-tight" data-current-rent-correction>
            <p>
              The current rent is corrected by editing the working current rent. It saves
              on its own and stays until you change it.{" "}
              <a className="text-link" href={`#${WORKING_CURRENT_RENT_TARGET}`}>
                Edit the working current rent
              </a>
            </p>
            {currentRentSources.length > 0 ? (
              <ul aria-label="Observed current rent by source" className="ui-rows">
                {currentRentSources.map((entry) => {
                  const state =
                    entry.amount === null
                      ? "unreadable"
                      : workingRent === null
                        ? "no_working_value"
                        : entry.amount === workingRent
                          ? "matches"
                          : "differs";
                  return (
                    <li data-source-comparison={state} key={entry.label}>
                      <strong>{entry.label}</strong>: {entry.raw || "blank"}.{" "}
                      <span className="muted">
                        {state === "unreadable"
                          ? "Not a currency amount."
                          : state === "no_working_value"
                            ? "No working value is saved yet."
                            : state === "matches"
                              ? "Matches the working value."
                              : `Differs from the working value ${formatMoneyReference(workingRent!)}. The working value stays until you change it.`}
                      </span>
                      {working?.canEdit &&
                      entry.amount !== null &&
                      state !== "matches" ? (
                        <>
                          {" "}
                          <Button
                            onClick={() => void adopt(entry)}
                            size="compact"
                            variant="tertiary"
                          >
                            Use the {entry.label} value
                          </Button>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">No observed current rent is available to compare.</p>
            )}
            <p className="muted">
              Using a source value changes the working value in this app only. RentVine
              changes only through Prepare RentVine rent charge update beside the working
              current rent; the Sheet changes only under{" "}
              <a className="text-link" href="#operating-sheet-title">
                Review Sheet updates
              </a>
              .
            </p>
          </div>
        ) : (
          <>
            <div aria-label="Observed source values">
              {observed?.candidates.map((candidate, index) => (
                <p key={`${candidate.source}-${index}`}>
                  <Button
                    variant="secondary"
                    onClick={() => edit(candidate.value, `Reviewed ${candidate.source}`)}
                  >
                    Use {candidate.source}: {candidate.value || "blank"}
                  </Button>
                </p>
              ))}
              {sheetValues &&
              field in sheetValues &&
              !observed?.candidates.some(
                (candidate) => candidate.sourceSystem === "Google Sheets",
              ) ? (
                <p>
                  <Button
                    variant="secondary"
                    onClick={() => edit(sheetValues[field], "Reviewed operating Sheet")}
                  >
                    Use operating Sheet: {sheetValues[field] || "blank"}
                  </Button>
                </p>
              ) : null}
            </div>
            <Field
              htmlFor={`${id}-value`}
              label={`Reviewed ${SHEET_FIELD_LABELS[field].toLowerCase()}`}
              required
            >
              {shape === "yes_no" || shape === "boolean" ? (
                <select
                  id={`${id}-value`}
                  value={value}
                  onChange={(event) => edit(event.target.value)}
                >
                  <option value="">Select recorded value</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input
                  id={`${id}-value`}
                  type={shape === "date" ? "date" : "text"}
                  inputMode={shape === "currency" ? "decimal" : undefined}
                  value={value}
                  onChange={(event) => edit(event.target.value)}
                />
              )}
            </Field>
            {prefill && value === prefill.value ? (
              <p className="muted">
                Prefilled from RentVine ({prefill.confidence}); edit it if the reviewed
                value differs.
              </p>
            ) : null}
            <Field htmlFor={`${id}-source`} label="Source or context (optional)">
              <input
                id={`${id}-source`}
                maxLength={240}
                value={source}
                onChange={(event) => edit(value, event.target.value)}
              />
            </Field>
            <Field htmlFor={`${id}-destination`} label="Destinations">
              <select
                id={`${id}-destination`}
                value={destination}
                onChange={(event) => {
                  setDestination(event.target.value);
                  setPrepared({});
                }}
              >
                <option value="sheet">Operating Sheet</option>
                <option value="rentvine" disabled={!rvSupported}>
                  RentVine
                </option>
                <option value="both" disabled={!rvSupported}>
                  Both, confirmed separately
                </option>
              </select>
            </Field>
            {selectedRentvine && field === "renewal_date" ? (
              <p>
                The Sheet&apos;s renewal date maps to the reviewed RentVine lease end date
                for this update. Fresh lease start and increase-eligibility dates remain
                unchanged.
              </p>
            ) : null}
            <Button
              disabled={pending || !can(role, "edit") || !value.trim()}
              onClick={() => void run(prepare)}
            >
              Prepare selected destination previews
            </Button>
            {!can(role, "edit") ? (
              <p>
                Preparing corrections requires Editor access.{" "}
                <RequestAccessLink surface="renewal_corrections.edit" />
              </p>
            ) : null}
            {notice ? <p role="status">{notice}</p> : null}
            <ul aria-label="Destination preparation results">
              {Object.entries(prepared).map(([target, result]) => (
                <li key={target}>
                  <a
                    href={
                      target === "sheet"
                        ? "#operating-sheet-title"
                        : "#rentvine-updates-title"
                    }
                  >
                    {target === "sheet" ? "Operating Sheet" : "RentVine"}
                  </a>
                  : {result}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <div id="renewal-future-rent" tabIndex={-1}>
        <RenewalFutureRent
          initialInventory={inventory}
          initialPreviewHash={rentvinePreviewHash}
        />
      </div>
    </>
  );
}
