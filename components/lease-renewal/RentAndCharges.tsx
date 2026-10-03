// S117 (R117.1, R117.2, R117.4) + S153: the Rent and charges card as the one working area.
//
// It shows the operational current rent with its provenance, the single current rent-account
// charge with its own billing period, the contractual, aggregate and listing amounts under their
// own labels, every recurring charge with its account-derived classification (current charges
// first, the rest behind a disclosure), the working current rent beside its sources, and each
// destination's own update state. Server-safe: no hooks or fetch here; the working field, the
// RentVine update offer and the live app-saved rows are the client pieces in RenewalCurrentRent.

import { renewalCardTitle } from "@/components/lease-renewal/RenewalSectionHeading";
import {
  RenewalCurrentRent,
  RentChargeUpdateStatus,
  WORKING_CURRENT_RENT_TARGET,
} from "@/components/lease-renewal/RenewalCurrentRent";
import { Card } from "@/components/ui";
import {
  CHARGE_CLASSIFICATION_LABELS,
  chargeBillingPeriod,
  chargeDisplayName,
  chargeScheduleLabel,
  chargeScheduleText,
  splitChargesBySchedule,
} from "@/lib/lease-renewal/current-rent-display";
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
} from "@/lib/lease-renewal/desk-destinations";
import type { RentChargeOutcomeRow } from "@/lib/lease-renewal/rent-charge-outcomes";
import type {
  RenewalChargeInventory,
  RenewalChargeOption,
} from "@/lib/lease-renewal/writeback/charge-inventory-model";

function ChargeRow({ charge }: Readonly<{ charge: RenewalChargeOption }>) {
  return (
    <li>
      <strong>{chargeDisplayName(charge)}</strong>: {chargeScheduleText(charge)}.{" "}
      {chargeBillingPeriod(charge)}.{" "}
      <span className="muted">
        {CHARGE_CLASSIFICATION_LABELS[charge.classification]};{" "}
        {chargeScheduleLabel(charge.current)}.
      </span>
    </li>
  );
}

export function RentAndCharges({
  summary,
  chargeInventory = null,
  rentChargeStatus = null,
}: Readonly<{
  summary: {
    currentRent: number | null;
    leaseTotalRent?: number | null;
    unitListedRent?: number | null;
    sourceDestinations?: { rentvine?: { href: string; label: string } | null } | null;
  };
  chargeInventory?: RenewalChargeInventory | null;
  rentChargeStatus?: readonly RentChargeOutcomeRow[] | null;
}>) {
  const rentvine = summary.sourceDestinations?.rentvine ?? null;
  const rows = rentChargeStatus ?? [];
  // The saved RentVine preview the page showed; a replacement prepared here is bound to it.
  const rentvinePreviewHash =
    rows.find((row) => row.destination === "rentvine" && row.previewHash)?.previewHash ??
    null;
  const charges = chargeInventory ? splitChargesBySchedule(chargeInventory) : null;
  return (
    <Card title={renewalCardTitle("rent-and-charges", "Rent and charges")}>
      <RenewalCurrentRent
        chargeInventory={chargeInventory}
        rentvineHref={rentvine?.href ?? null}
        rentvinePreviewHash={rentvinePreviewHash}
        summary={summary}
      />
      <section aria-label="Recurring charges (RentVine)" className="ui-stack-tight">
        <h3>Recurring charges (RentVine)</h3>
        {charges ? (
          charges.current.length > 0 ? (
            <ul aria-label="Current charges" className="ui-rows">
              {charges.current.map((charge) => (
                <ChargeRow charge={charge} key={charge.id} />
              ))}
            </ul>
          ) : (
            <p className="muted">
              {chargeInventory!.charges.length === 0
                ? "No recurring charges returned for this lease."
                : "No recurring charge is within the current schedule."}
            </p>
          )
        ) : (
          <p className="muted">The recurring charge list is unavailable right now.</p>
        )}
        {charges && charges.other.length > 0 ? (
          <details>
            <summary>
              Charges outside the current schedule ({charges.other.length})
            </summary>
            <ul aria-label="Earlier and future charges" className="ui-rows">
              {charges.other.map((charge) => (
                <ChargeRow charge={charge} key={charge.id} />
              ))}
            </ul>
          </details>
        ) : null}
        <p className="muted">
          Each amount keeps its own meaning: other recurring charges are listed beside the
          rent, never added to it. One-time fees, deposits, ledger history, party changes
          and insurance enrollment are outside these RentVine actions
          {rentvine ? (
            <>
              ; handle those in the{" "}
              <a
                className="text-link"
                href={rentvine.href}
                rel={EXTERNAL_LINK_REL}
                target={EXTERNAL_LINK_TARGET}
              >
                RentVine lease record
              </a>
            </>
          ) : null}
          .
        </p>
      </section>
      <ul aria-label="What to change" className="ui-rows">
        <li>
          <a className="text-link" href={`#${WORKING_CURRENT_RENT_TARGET}`}>
            Correct the current rent
          </a>{" "}
          <span className="muted">
            Edit the working current rent above. It saves in the app by itself; RentVine
            and the Sheet change only through a separately confirmed update.
          </span>
        </li>
        <li>
          <a className="text-link" href="#renewal-future-rent">
            Prepare future renewal rent
          </a>{" "}
          <span className="muted">
            Uses the working renewal terms. Today&apos;s billing and the Sheet current
            rent stay unchanged until the confirmed RentVine change takes effect.
          </span>
        </li>
      </ul>
      <RentChargeUpdateStatus rows={rows} />
    </Card>
  );
}
