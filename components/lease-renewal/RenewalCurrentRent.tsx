"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";

// S153/S157/S160: the current-rent facts inside the Rent and charges card.
//
// The operational current rent follows the one shared meaning (lib/lease-renewal/current-rent):
// a retained staff working value, then the single current rent-account charge, then the
// contractual lease amount, each under its own label. Several candidates, an unclear schedule, no
// rent charge or an unavailable inventory are shown as they are, with the helper's attention; no
// amount is summed, split or chosen here. The working current rent is edited in place and saves
// by itself (S157), and the RentVine rent charge update is offered beside it from that value
// (S160) and then reviewed and confirmed in the existing RentVine updates panel. Nothing here
// changes a source.

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui";
import { operationalCurrentRent } from "@/lib/lease-renewal/current-rent";
import {
  CHARGE_CLASSIFICATION_LABELS,
  chargeAmountNumber,
  chargeBillingPeriod,
  chargeDisplayName,
  chargeScheduleLabel,
  chargeScheduleText,
  describeRenewalTerms,
  formatMoneyReference,
  inventoryLeaseDates,
} from "@/lib/lease-renewal/current-rent-display";
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
} from "@/lib/lease-renewal/desk-destinations";
import { effectiveRenewalTerms } from "@/lib/lease-renewal/effective-terms";
import { planRentChargeRequests } from "@/lib/lease-renewal/rent-charge-intent";
import type { RentChargeOutcomeRow } from "@/lib/lease-renewal/rent-charge-outcomes";
import { workingCurrentRent } from "@/lib/lease-renewal/working-record";
import type {
  RenewalChargeInventory,
  RenewalChargeOption,
} from "@/lib/lease-renewal/writeback/charge-inventory-model";
import { useRenewalManualWorkspace } from "./RenewalManualWorkspace";
import { useRenewalWorkingRecord, WorkingMoneyField } from "./RenewalWorkingRecord";

export const WORKING_CURRENT_RENT_TARGET = "renewal-working-current-rent";
const RENTVINE_UPDATES_ANCHOR = "#rentvine-updates-title";

const money = formatMoneyReference;

function RentvineUpdatesLink() {
  return (
    <a className="text-link" href={RENTVINE_UPDATES_ANCHOR}>
      RentVine updates
    </a>
  );
}

function ChargeEvidence({ charge }: Readonly<{ charge: RenewalChargeOption }>) {
  return (
    <>
      <strong>{chargeDisplayName(charge)}</strong>: {chargeScheduleText(charge)}.{" "}
      {chargeBillingPeriod(charge)}.{" "}
      <span className="muted">
        {CHARGE_CLASSIFICATION_LABELS[charge.classification]};{" "}
        {chargeScheduleLabel(charge.current)}.
      </span>
    </>
  );
}

type UpdateOffer =
  | {
      readonly ready: true;
      readonly from: number;
      readonly to: number;
      readonly note: ReactNode;
    }
  | { readonly ready: false; readonly note: ReactNode };

export function RenewalCurrentRent({
  summary,
  chargeInventory,
  rentvinePreviewHash,
  rentvineHref = null,
}: Readonly<{
  summary: {
    currentRent: number | null;
    leaseTotalRent?: number | null;
    unitListedRent?: number | null;
  };
  /** Null when the recurring charge read is unavailable. */
  chargeInventory: RenewalChargeInventory | null;
  /** The saved RentVine preview this page showed; a replacement is bound to it. */
  rentvinePreviewHash: string | null;
  rentvineHref?: string | null;
}>) {
  const context = useRenewalWorkingRecord();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<
    | { kind: "prepared"; from: number; to: number }
    | { kind: "refused"; message: string }
    | null
  >(null);
  // A preview this control saved supersedes the page's hash until the page delivers a newer one.
  const [saved, setSaved] = useState<{ basedOn: string | null; value: string } | null>(
    null,
  );
  const previewHash =
    saved && saved.basedOn === rentvinePreviewHash ? saved.value : rentvinePreviewHash;

  const rent = operationalCurrentRent({
    working: context?.record ?? null,
    inventory: chargeInventory,
    contractualRent: summary.currentRent,
  });
  const working = rent.workingRent;
  const chargeAmount = rent.rentCharge ? chargeAmountNumber(rent.rentCharge) : null;
  const sources: { label: string; amount: number }[] = [];
  if (chargeAmount !== null)
    sources.push({ label: "RentVine rent charge", amount: chargeAmount });
  if (rent.contractualRent !== null)
    sources.push({
      label: "RentVine contractual lease rent",
      amount: rent.contractualRent,
    });
  const fieldSource = sources[0]
    ? { label: sources[0].label, value: sources[0].amount }
    : null;

  const offer: UpdateOffer | null = (() => {
    if (!context) return null;
    if (!context.canEdit)
      return {
        ready: false,
        note: "Preparing a RentVine update needs Editor access. The facts above stay readable.",
      };
    if (working === null)
      return {
        ready: false,
        note: "Enter a working current rent to prepare a RentVine rent charge update.",
      };
    switch (rent.chargeEvidence) {
      case "unavailable":
        return {
          ready: false,
          note: "The recurring charge list is unavailable right now, so the rent charge to update is not identified. Refresh this lease to read it again.",
        };
      case "several":
        return {
          ready: false,
          note: (
            <>
              RentVine lists more than one current rent-account charge, so this shortcut
              cannot pick one. Choose the exact charge under <RentvineUpdatesLink />.
            </>
          ),
        };
      case "unclear":
        return {
          ready: false,
          note: (
            <>
              The charge that may be the rent charge is not confirmed as current, so this
              shortcut cannot pick it. Choose the exact charge under{" "}
              <RentvineUpdatesLink />.
            </>
          ),
        };
      case "none":
        return {
          ready: false,
          note: (
            <>
              RentVine lists no current rent-account recurring charge to update. Review
              the charges in the{" "}
              {rentvineHref ? (
                <a
                  className="text-link"
                  href={rentvineHref}
                  rel={EXTERNAL_LINK_REL}
                  target={EXTERNAL_LINK_TARGET}
                >
                  RentVine lease record
                </a>
              ) : (
                "RentVine lease record"
              )}
              , then refresh this lease.
            </>
          ),
        };
      case "not_read":
        return {
          ready: false,
          note: "The recurring charge list was not read for this view, so the rent charge to update is not identified.",
        };
      case "single": {
        if (chargeAmount === null)
          return {
            ready: false,
            note: "The RentVine rent charge amount could not be read as a number, so it is shown as recorded and not updated from here.",
          };
        if (chargeAmount === working)
          return {
            ready: false,
            note: `The RentVine rent charge already reads ${money(chargeAmount)}, the same as the working value. There is nothing to update.`,
          };
        return {
          ready: true,
          from: chargeAmount,
          to: working,
          note: `Prepares a RentVine update of the rent charge ${chargeDisplayName(rent.rentCharge!)} from ${money(chargeAmount)} to ${money(working)}. Nothing changes until you review and confirm the exact effect under RentVine updates.`,
        };
      }
    }
  })();

  async function prepare() {
    if (!context || !offer?.ready || !rent.rentCharge || working === null) return;
    setPending(true);
    setNotice(null);
    try {
      // S117 (ARCH-S117-1): the one typed current intent; the amount is the working value itself.
      const [plan] = planRentChargeRequests(
        {
          scope: "current",
          field: "current_rent",
          value: working,
          source: "",
          destinations: ["rentvine"],
          chargeId: rent.rentCharge.id,
        },
        {
          leaseId: context.leaseId,
          workspaceContext: null,
          sheetRowAvailable: false,
          priorHashes: { sheet: null, rentvine: previewHash },
          inventory: chargeInventory,
        },
      );
      if (!plan || "refusal" in plan)
        throw new Error(plan?.refusal ?? "This update could not be prepared.");
      // S157: no narrative is required, so none is sent unless staff typed one.
      const { evidenceRef, ...body } = plan.body;
      const response = await fetch(`/api/lease-renewal/${plan.route}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(evidenceRef ? { ...body, evidenceRef } : body),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        proposal?: { preview_hash?: string };
      };
      if (!response.ok)
        throw new Error(result.error ?? "This update could not be prepared.");
      if (!result.proposal?.preview_hash)
        throw new Error(
          "No saved preview was returned. Check the RentVine connection and reload this lease.",
        );
      setSaved({ basedOn: rentvinePreviewHash, value: result.proposal.preview_hash });
      setNotice({ kind: "prepared", from: offer.from, to: offer.to });
      router.refresh();
    } catch (error) {
      setNotice({
        kind: "refused",
        message:
          error instanceof Error
            ? error.message
            : "This update could not be prepared. Nothing was changed.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="ui-stack"
      data-current-rent-basis={rent.basis}
      data-current-rent-evidence={rent.chargeEvidence}
    >
      <dl className="ui-stack-tight">
        <div>
          <dt>Current rent</dt>
          <dd data-rent-fact="operational">
            {rent.amount === null ? "Needs verification" : money(rent.amount)}{" "}
            <span className="muted">{rent.label}</span>
          </dd>
        </div>
        <div>
          <dt>Current rent charge (RentVine)</dt>
          <dd data-rent-fact="rent-charge">
            {rent.chargeEvidence === "single" && rent.rentCharge ? (
              <>
                <ChargeEvidence charge={rent.rentCharge} />{" "}
                {chargeInventory ? (
                  <span className="muted">{inventoryLeaseDates(chargeInventory)}.</span>
                ) : null}
              </>
            ) : rent.candidates.length > 0 ? (
              <>
                <ul className="ui-rows">
                  {rent.candidates.map((charge) => (
                    <li key={charge.id}>
                      <ChargeEvidence charge={charge} />
                    </li>
                  ))}
                </ul>
                {chargeInventory ? (
                  <span className="muted">{inventoryLeaseDates(chargeInventory)}.</span>
                ) : null}
              </>
            ) : (
              <span className="muted">
                {rent.chargeEvidence === "none"
                  ? "None identified in the current schedule."
                  : rent.chargeEvidence === "unavailable"
                    ? "Unavailable right now."
                    : "Not read for this view."}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Contractual lease rent</dt>
          <dd data-rent-fact="contractual">
            {summary.currentRent == null
              ? "Needs verification"
              : money(summary.currentRent)}{" "}
            <span className="muted">
              RentVine lease detail; the lease&apos;s own rent term
            </span>
          </dd>
        </div>
        <div>
          <dt>Lease total (RentVine)</dt>
          <dd data-rent-fact="lease-total">
            {summary.leaseTotalRent == null
              ? "Unavailable"
              : money(summary.leaseTotalRent)}{" "}
            <span className="muted">
              RentVine lease total; the sum of active recurring charges, never the rent
            </span>
          </dd>
        </div>
        <div>
          <dt>Unit listed rent (reference)</dt>
          <dd data-rent-fact="listing">
            {summary.unitListedRent == null
              ? "Unavailable"
              : money(summary.unitListedRent)}{" "}
            <span className="muted">
              RentVine unit listing; a reference, not a lease term
            </span>
          </dd>
        </div>
      </dl>
      {rent.attention ? (
        <p className="muted" data-rent-attention role="note">
          {rent.attention}
        </p>
      ) : null}
      {context ? (
        <div className="ui-stack-tight" id={WORKING_CURRENT_RENT_TARGET} tabIndex={-1}>
          <WorkingMoneyField
            field="current_rent"
            hint="Saved in the app. RentVine and Sheet updates require confirmation."
            source={fieldSource}
          />
          {working !== null && sources.length > 0 ? (
            <ul
              aria-label="Working value compared with each source"
              className="ui-rows muted"
            >
              {sources.map((source) => {
                const matches = source.amount === working;
                return (
                  <li
                    key={source.label}
                    data-source-comparison={matches ? "matches" : "differs"}
                  >
                    {source.label}: {money(source.amount)},{" "}
                    {matches
                      ? "matches the working value."
                      : `differs from the working value ${money(working)}. The working value stays until you change it.`}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {offer ? (
            <div className="ui-stack-tight" data-rent-update>
              {offer.ready ? (
                <Button
                  disabled={pending}
                  onClick={() => void prepare()}
                  size="compact"
                  variant="secondary"
                >
                  Prepare RentVine rent charge update
                </Button>
              ) : null}
              <p className="muted" data-rent-update-note>
                {offer.note}
              </p>
              {notice ? (
                <p role="status">
                  {notice.kind === "prepared" ? (
                    <>
                      RentVine rent charge update prepared: {money(notice.from)} to{" "}
                      {money(notice.to)}. Review and confirm the exact effect under{" "}
                      <RentvineUpdatesLink />. Nothing has changed in RentVine yet.
                    </>
                  ) : (
                    notice.message
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Update status by destination. The app-saved working values are read live from the working
 * record so they never lag a save; each prepared, failed, applied or read-back source update
 * keeps its own row from the page's projection.
 */
export function RentChargeUpdateStatus({
  rows,
}: Readonly<{ rows: readonly RentChargeOutcomeRow[] }>) {
  const context = useRenewalWorkingRecord();
  const manual = useRenewalManualWorkspace();
  const record = context?.record ?? null;
  const working = workingCurrentRent(record);
  const termsText = describeRenewalTerms(
    effectiveRenewalTerms(record, manual?.state ?? null),
  );
  const sourceRows = rows.filter((row) => row.destination !== "app");
  const empty = working === null && termsText === null && sourceRows.length === 0;
  return (
    <section aria-label="Update status by destination" className="ui-stack-tight">
      <h3>Update status by destination</h3>
      {empty ? (
        <p className="muted">
          No rent or charge update is recorded, prepared or waiting for this lease.
        </p>
      ) : (
        <ul className="ui-rows">
          {working !== null ? (
            <li data-outcome-state="recorded" data-outcome-destination="app">
              <div>
                <strong>Working current rent (app record)</strong>: Saved in the app.{" "}
                <span className="muted">
                  {money(working)}. Saved in the app only; RentVine and the Sheet change
                  only through a confirmed update.
                </span>{" "}
                <a className="text-link" href={`#${WORKING_CURRENT_RENT_TARGET}`}>
                  Review
                </a>
              </div>
            </li>
          ) : null}
          {termsText ? (
            <li data-outcome-state="recorded" data-outcome-destination="app">
              <div>
                <strong>Working renewal terms (app record)</strong>: Saved in the app.{" "}
                <span className="muted">
                  {termsText}. Today&apos;s rent and the Sheet current rent stay as they
                  are until a confirmed source update.
                </span>{" "}
                <a className="text-link" href="#renewal-future-rent">
                  Review
                </a>
              </div>
            </li>
          ) : null}
          {sourceRows.map((row) => (
            <li
              key={row.id}
              data-outcome-state={row.state}
              data-outcome-destination={row.destination}
            >
              <div {...(row.state === "mismatch" ? { role: "status" } : {})}>
                <strong>{row.label}</strong>: {row.stateLabel}.{" "}
                <span className={row.attention ? undefined : "muted"}>{row.detail}</span>
                {row.anchor ? (
                  <>
                    {" "}
                    <a className="text-link" href={row.anchor}>
                      Review
                    </a>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
