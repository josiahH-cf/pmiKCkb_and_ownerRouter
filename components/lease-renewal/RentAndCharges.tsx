// S117 (R117.1, R117.2, R117.4): the Rent and charges card as the one working area.
//
// It shows the owning current values with their source, every recurring charge with its
// account-derived classification, the intents an operator can start here, and each destination's
// own update state. Server-safe: no hooks, no fetch. The editing controls themselves stay in the
// page-supplied panels rendered beside this card inside the same working area.

import { renewalCardTitle } from "@/components/lease-renewal/RenewalSectionHeading";
import { Card } from "@/components/ui";
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
} from "@/lib/lease-renewal/desk-destinations";
import type { RentChargeOutcomeRow } from "@/lib/lease-renewal/rent-charge-outcomes";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";

function formatCurrencyReference(value: number): string {
  return value.toFixed(2);
}

const CLASSIFICATION_LABELS = {
  rent: "Rent account",
  non_rent: "Other recurring charge",
  unknown: "Account classification unavailable",
} as const;

function scheduleLabel(current: boolean | null): string {
  if (current === true) return "within current schedule";
  if (current === false) return "outside current schedule";
  return "schedule boundary needs review";
}

export function RentAndCharges({
  summary,
  chargeInventory = null,
  rentChargeStatus = null,
  controlsAvailable,
}: Readonly<{
  summary: {
    currentRent: number | null;
    leaseTotalRent?: number | null;
    unitListedRent?: number | null;
    sourceDestinations?: { rentvine?: { href: string; label: string } | null } | null;
  };
  chargeInventory?: RenewalChargeInventory | null;
  rentChargeStatus?: readonly RentChargeOutcomeRow[] | null;
  /** False for an inspection-only lease: the same facts and charges, no edit intents. */
  controlsAvailable: boolean;
}>) {
  const rentvine = summary.sourceDestinations?.rentvine ?? null;
  const rows = rentChargeStatus ?? [];
  return (
    <Card title={renewalCardTitle("rent-and-charges", "Rent and charges")}>
      <dl className="ui-stack-tight">
        <div>
          <dt>Current contractual base rent</dt>
          <dd>
            {summary.currentRent == null
              ? "Needs verification"
              : formatCurrencyReference(summary.currentRent)}{" "}
            <span className="muted">RentVine lease detail</span>
          </dd>
        </div>
        <div>
          <dt>Lease total (RentVine)</dt>
          <dd>
            {summary.leaseTotalRent == null
              ? "Unavailable"
              : formatCurrencyReference(summary.leaseTotalRent)}{" "}
            <span className="muted">
              RentVine lease total; the sum of active recurring charges
            </span>
          </dd>
        </div>
        <div>
          <dt>Unit listed rent (reference)</dt>
          <dd>
            {summary.unitListedRent == null
              ? "Unavailable"
              : formatCurrencyReference(summary.unitListedRent)}{" "}
            <span className="muted">
              RentVine unit listing; a reference, not a lease term
            </span>
          </dd>
        </div>
      </dl>
      <section aria-label="Recurring charges (RentVine)" className="ui-stack-tight">
        <h3>Recurring charges (RentVine)</h3>
        {chargeInventory ? (
          chargeInventory.charges.length > 0 ? (
            <ul className="ui-rows">
              {chargeInventory.charges.map((charge) => (
                <li key={charge.id}>
                  <strong>{charge.accountLabel ?? charge.projection.description}</strong>:{" "}
                  {charge.projection.amount} every {charge.projection.frequency} month(s)
                  on day {charge.projection.dayDue}; {charge.projection.startDate} to{" "}
                  {charge.projection.endDate ?? "no end date"}.{" "}
                  <span className="muted">
                    {CLASSIFICATION_LABELS[charge.classification]};{" "}
                    {scheduleLabel(charge.current)}.
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No recurring charges returned for this lease.</p>
          )
        ) : (
          <p className="muted">The recurring charge list is unavailable right now.</p>
        )}
        <p className="muted">
          Individual charges do not redefine contractual base rent. One-time fees,
          deposits, ledger history, party changes and insurance enrollment are outside
          these RentVine actions
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
      {controlsAvailable ? (
        <>
          <ul aria-label="What to change" className="ui-rows">
            <li>
              <a className="text-link" href="#renewal-correct-a-fact">
                Correct a current fact
              </a>{" "}
              <span className="muted">
                Fixes a value that is wrong today. The app saves the reviewed value first;
                each Sheet or RentVine update is then prepared and confirmed separately.
              </span>
            </li>
            <li>
              <a className="text-link" href="#renewal-future-rent">
                Prepare future approved rent
              </a>{" "}
              <span className="muted">
                Uses the owner-approved terms already recorded. Today&apos;s billing and
                the Sheet current rent stay unchanged until the Admin-confirmed RentVine
                change takes effect.
              </span>
            </li>
          </ul>
          <section aria-label="Update status by destination" className="ui-stack-tight">
            <h3>Update status by destination</h3>
            {rows.length === 0 ? (
              <p className="muted">
                No rent or charge update is recorded, prepared or waiting for this lease.
              </p>
            ) : (
              <ul className="ui-rows">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    data-outcome-state={row.state}
                    data-outcome-destination={row.destination}
                  >
                    <div {...(row.state === "mismatch" ? { role: "status" } : {})}>
                      <strong>{row.label}</strong>: {row.stateLabel}.{" "}
                      <span className={row.attention ? undefined : "muted"}>
                        {row.detail}
                      </span>
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
        </>
      ) : null}
    </Card>
  );
}
