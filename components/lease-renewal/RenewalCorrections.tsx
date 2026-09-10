"use client";

import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { currentRentReviewFromDisposition } from "@/lib/lease-renewal/correction-review";
import type { RenewalDiscrepancyDisposition } from "@/lib/firestore/renewal-discrepancy-dispositions";
import { RenewalFutureRent } from "./RenewalFutureRent";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field } from "@/components/ui";
import { can, type Role } from "@/lib/auth/roles";
import { parseCurrencyInput } from "@/lib/currency-input";
import type { DeskReconItem } from "@/lib/lease-renewal/desk-model";
import {
  SHEET_FIELD_LABELS,
  sheetFieldShape,
  parseSheetFieldIntent,
  type SheetEditableField,
} from "@/lib/lease-renewal/sheet-writeback/field-intent";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";

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
export function RenewalCorrections({
  leaseId,
  role,
  dataCheck,
  sheetValues,
  workspaceContext,
  inventory,
  sheetPreviewHash,
  rentvinePreviewHash,
  reviewHref,
  dispositions = [],
}: {
  leaseId: string;
  role: Role;
  dataCheck: readonly DeskReconItem[];
  sheetValues: Record<string, string> | null;
  workspaceContext: string | null;
  inventory: RenewalChargeInventory | null;
  sheetPreviewHash: string | null;
  rentvinePreviewHash: string | null;
  reviewHref: string | null;
  dispositions?: RenewalDiscrepancyDisposition[];
}) {
  const id = useId(),
    router = useRouter();
  const [field, setField] = useState<SheetEditableField>("current_rent"),
    [value, setValue] = useState(""),
    [source, setSource] = useState(""),
    [destination, setDestination] = useState("sheet"),
    [chargeId, setChargeId] = useState(""),
    [pending, setPending] = useState(false),
    [notice, setNotice] = useState(""),
    [approval, setApproval] = useState<{
      token: string;
      value: string;
      source: string;
    } | null>(null),
    [confirmApproval, setConfirmApproval] = useState(false),
    [prepared, setPrepared] = useState<Record<string, string>>({}),
    [hashes, setHashes] = useState({
      sheet: sheetPreviewHash,
      rentvine: rentvinePreviewHash,
    });
  const proposedReview = [...dispositions]
    .reverse()
    .map(currentRentReviewFromDisposition)
    .find(Boolean);
  const shape = sheetFieldShape(field),
    observed = dataCheck.find((entry) => entry.fieldKey === field),
    currency = parseCurrencyInput(value),
    numeric = currency.ok ? currency.value : NaN,
    rvSupported = field === "current_rent" || field === "renewal_date",
    selectedSheet = destination !== "rentvine",
    selectedRentvine = destination !== "sheet";
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
    setApproval(null);
    setConfirmApproval(false);
    setPrepared({});
  }
  function choose(nextField: SheetEditableField) {
    setField(nextField);
    edit("");
    setSource("");
    setChargeId("");
    if (nextField !== "current_rent" && nextField !== "renewal_date")
      setDestination("sheet");
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
  async function requestReview() {
    if (!observed?.candidateFingerprint || !currency.ok || numeric <= 0 || !source.trim())
      throw new Error("Select a valid current-rent value and its reviewed source first.");
    await post("correction-review", {
      schemaVersion: "renewal-current-rent-review/v1",
      leaseId,
      value: numeric,
      source,
      destination: selectedRentvine ? "both" : "sheet",
      candidateFingerprint: observed.candidateFingerprint,
    });
    setNotice(
      "Saved for an Admin to review on this lease. The proposed amount and source remain available after reload; no approval or provider write was made.",
    );
    router.refresh();
  }
  async function resolveRent() {
    if (
      !observed?.sourceTriggerKey ||
      !observed.candidateFingerprint ||
      !currency.ok ||
      numeric <= 0 ||
      !source.trim()
    )
      throw new Error(
        "Select the current source decision and a valid amount and source first.",
      );
    const result = await post("resolve", {
      run_id: "live-review",
      intent: "current_fact_correction",
      source_trigger_key: observed.sourceTriggerKey,
      candidate_fingerprint: observed.candidateFingerprint,
      kind: "corrected_value",
      corrected_value: numeric.toFixed(2),
      reason: source,
    });
    if (!result.authorization_token)
      throw new Error(
        "The saved decision has no current approval handoff. Reload this lease.",
      );
    setApproval({ token: result.authorization_token, value: numeric.toFixed(2), source });
    setNotice(
      "Current-rent decision saved. An Admin must review its approval before the separately confirmed Sheet update.",
    );
  }
  async function approveRent() {
    if (!approval || !observed?.sourceTriggerKey) return;
    await post("writeback-approvals", {
      run_id: "live-review",
      source_trigger_key: observed.sourceTriggerKey,
      authorization_token: approval.token,
      decision: "approve",
      reason: approval.source,
    });
    setConfirmApproval(false);
    setNotice(
      "This exact current-rent decision is approved. Prepare the destination preview; approval has not written to either source.",
    );
  }
  async function prepare() {
    const intent = parseSheetFieldIntent({
      field,
      source,
      value:
        shape === "currency"
          ? numeric
          : shape === "boolean" || shape === "yes_no"
            ? value === "true"
            : value,
    });
    if (!value.trim()) throw new Error("Enter or select the reviewed value.");
    const destinations = [
      ...(selectedSheet ? ["sheet"] : []),
      ...(selectedRentvine ? ["rentvine"] : []),
    ];
    for (const target of destinations) {
      try {
        let result;
        if (target === "sheet") {
          if (!workspaceContext || !sheetValues)
            throw new Error(
              "An exact existing Sheet row is unavailable. Use the existing missing-row append below when applicable.",
            );
          result = await post("operating-sheet", {
            operation: "propose",
            workspaceContext,
            expectedPriorPreviewHash: hashes.sheet,
            ...(field === "current_rent"
              ? { intent: "update_approved_current_rent", expectedCurrentRent: numeric }
              : { intent: "update_field", fieldIntent: intent }),
          });
        } else {
          if (!inventory || !rvSupported)
            throw new Error("This field has no supported RentVine operation here.");
          const charge = inventory.charges.find(
            (entry) =>
              entry.id === chargeId &&
              entry.classification === "rent" &&
              entry.current === true,
          );
          if (field === "current_rent" && !charge)
            throw new Error(
              "Select the exact current rent-account charge; aggregate rent cannot be divided automatically.",
            );
          result = await post("rentvine-writeback", {
            operation: "propose",
            leaseId,
            expectedPriorPreviewHash: hashes.rentvine,
            evidenceRef: source,
            ...(field === "current_rent" ? { businessIntent: "current_base" } : {}),
            effects:
              field === "current_rent"
                ? [
                    {
                      kind: "recurring_charge_update",
                      chargeId: charge!.id,
                      changes: { amount: numeric.toFixed(2) },
                    },
                  ]
                : [{ kind: "renewal_dates_update", after: { endDate: value } }],
          });
        }
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
          [target]: "Saved: awaiting its separate exact confirmation below",
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
    router.refresh();
  }
  return (
    <Card title="Correct a lease fact" ariaLabel="Correct a lease fact">
      <p>
        Enter one reviewed value and choose its supported destinations. Each destination
        has its own preview, confirmation and receipt.
      </p>
      <p>
        <a href="#renewal-manual-owner_response">
          Record future owner-approved renewal terms
        </a>
        . Future rent does not replace the Sheet’s current rent or today’s billing.
      </p>
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
      <Field htmlFor={`${id}-source`} label="Value source / reason">
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
      {selectedRentvine && field === "current_rent" ? (
        <>
          <Field htmlFor={`${id}-charge`} label="Current rent billing item">
            <select
              id={`${id}-charge`}
              value={chargeId}
              onChange={(event) => setChargeId(event.target.value)}
            >
              <option value="">Choose the reviewed current charge</option>
              {inventory?.charges
                .filter(
                  (charge) => charge.classification === "rent" && charge.current === true,
                )
                .map((charge) => (
                  <option key={charge.id} value={charge.id}>
                    {charge.accountLabel ?? charge.projection.description} :{" "}
                    {charge.projection.amount} · {charge.projection.startDate} to{" "}
                    {charge.projection.endDate ?? "open-ended"}
                  </option>
                ))}
            </select>
          </Field>
          <p>
            This updates the selected recurring charge. Refreshed lease base rent is
            checked separately; RentVine exposes no general base-rent setter.
          </p>
        </>
      ) : null}
      {selectedRentvine && field === "renewal_date" ? (
        <p>
          The Sheet’s renewal date maps to the reviewed RentVine lease end date for this
          update. Fresh lease start and increase-eligibility dates remain unchanged.
        </p>
      ) : null}
      {field === "current_rent" && selectedSheet ? (
        <div className="ui-stack">
          <p>
            The existing current-rent reconciliation and Admin approval are required
            before a Sheet preview.
          </p>
          {proposedReview ? (
            <div>
              <p>
                Staff-proposed current rent: {proposedReview.value.toFixed(2)} ·{" "}
                {proposedReview.source} · {proposedReview.recordedAt}.
                {proposedReview.candidateFingerprint !== observed?.candidateFingerprint
                  ? " Source facts changed; review the current sources before a decision."
                  : " Awaiting current-source review and approval."}
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  edit(proposedReview.value.toFixed(2), proposedReview.source);
                  setDestination(proposedReview.destination);
                }}
              >
                Use saved current-rent proposal
              </Button>
            </div>
          ) : null}
          <Button
            variant="secondary"
            disabled={
              pending || !observed?.candidateFingerprint || !value || !source.trim()
            }
            onClick={() => void run(requestReview)}
          >
            Save current-rent proposal for review
          </Button>
          {can(role, "approve") && observed?.sourceTriggerKey ? (
            <Button
              variant="secondary"
              disabled={pending || !value || !source.trim()}
              onClick={() => void run(resolveRent)}
            >
              Save current-rent decision for approval
            </Button>
          ) : (
            <p>
              {reviewHref ? (
                <a href={reviewHref}>Open current-rent review handoff</a>
              ) : (
                "A current source decision must be available before this Sheet correction."
              )}
            </p>
          )}
          {!can(role, "approve") ? (
            <p>
              Current-rent decisions require Approver access.{" "}
              <RequestAccessLink surface="renewal_corrections.review" />
            </p>
          ) : null}
          {approval && !can(role, "manageAdmin") ? (
            <p>
              Approval of this value requires Admin access.{" "}
              <RequestAccessLink surface="renewal_corrections.approve" />
            </p>
          ) : null}
          {approval && can(role, "manageAdmin") ? (
            confirmApproval ? (
              <div role="group" aria-label="Confirm current-rent approval">
                <p>
                  Approve current base rent {approval.value} from {approval.source}. This
                  approves a proposal; provider writes still require their exact
                  confirmations.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => setConfirmApproval(false)}
                  disabled={pending}
                >
                  Cancel approval
                </Button>
                <Button onClick={() => void run(approveRent)} disabled={pending}>
                  Confirm approval of this value
                </Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setConfirmApproval(true)}>
                Review approval of {approval.value}
              </Button>
            )
          ) : null}
        </div>
      ) : null}
      <Button
        disabled={pending || !can(role, "edit") || !value.trim() || !source.trim()}
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
                target === "sheet" ? "#operating-sheet-title" : "#rentvine-updates-title"
              }
            >
              {target === "sheet" ? "Operating Sheet" : "RentVine"}
            </a>
            : {result}
          </li>
        ))}
      </ul>
      <RenewalFutureRent
        initialInventory={inventory}
        initialPreviewHash={rentvinePreviewHash}
      />
    </Card>
  );
}
