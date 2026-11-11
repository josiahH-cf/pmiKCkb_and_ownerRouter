"use client";

// S261 (R-S261-1, BEH-S261-1): the current base rent as staff read it on Check the numbers and in
// Ask the owner, from the one base decision (lib/lease-renewal/current-rent). A separate recurring
// charge such as pet rent is named apart from the base; the payment total and the recurring
// inventory stay in the read-only verification. A missing or conflicting base names each differing
// source and leads to the existing working current rent correction. Reading it saves nothing.

import { Button } from "@/components/ui";
import {
  CURRENT_BASE_RENT_LABEL,
  currentBaseRent,
  type CurrentBaseRent,
} from "@/lib/lease-renewal/current-rent";
import { formatUsd } from "@/lib/lease-renewal/owner-draft";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";
import { focusRenewalDashboardControl } from "./RenewalDashboardNavigation";
import { useRenewalFocusView } from "./RenewalFocusViewContext";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";

/** The lease facts the base decision reads on the lease page. */
export interface CurrentBaseRentFacts {
  /** The RentVine contractual base rent from the lease detail. */
  readonly contractualRent: number | null;
  /** The RentVine lease total of every active recurring charge; never the base. */
  readonly providerTotal?: number | null;
  /** The unit's listed rent; a reference, never the base. */
  readonly listedRent?: number | null;
  /** Null when the recurring charge read failed; undefined when this page did not read it. */
  readonly chargeInventory?: RenewalChargeInventory | null;
}

/** The one base decision with the lease's live working record. */
export function useCurrentBaseRent(facts: CurrentBaseRentFacts): CurrentBaseRent {
  const working = useRenewalWorkingRecord();
  return currentBaseRent({
    working: working?.record ?? null,
    inventory: facts.chargeInventory,
    contractualRent: facts.contractualRent,
    providerTotal: facts.providerTotal ?? null,
    listedRent: facts.listedRent ?? null,
  });
}

export const CORRECT_CURRENT_BASE_RENT_LABEL = "Correct the current base rent";

function separateChargesLine(base: CurrentBaseRent): string | null {
  if (base.separateCharges.length === 0) return null;
  return `Separate charges, not part of base rent: ${base.separateCharges
    .map((charge) => `${charge.label}: ${formatUsd(charge.amount)}`)
    .join(", ")}.`;
}

/**
 * Check the numbers: Current base rent first, any separate charge apart, and the check with the
 * existing correction when the base is missing, conflicting or not confirmed by billing.
 * `placement="full"` renders only in Full view; the Now card carries it in Guided view.
 */
export function CurrentBaseRentSummary({
  facts,
  placement = "now",
  primaryId,
}: Readonly<{
  facts: CurrentBaseRentFacts;
  placement?: "now" | "full";
  /**
   * S269: when the current base rent is Check the numbers' first fix, its one correction is the
   * Now card's primary action (with this id), so no second button repeats it.
   */
  primaryId?: string;
}>) {
  const working = useRenewalWorkingRecord();
  const view = useRenewalFocusView();
  const base = useCurrentBaseRent(facts);
  if (placement === "full" && view?.view !== "full") return null;
  const check = base.check;
  const leads = check !== null && (base.state === "needs_verification" || check.leads);
  const separate = separateChargesLine(base);
  return (
    <section
      aria-label={CURRENT_BASE_RENT_LABEL}
      className="ui-stack-tight renewal-base-rent"
      data-current-rent-basis={base.basis}
      data-renewal-base-rent={base.state}
    >
      <p data-renewal-field="current-base-rent">
        <strong>{CURRENT_BASE_RENT_LABEL}</strong>:{" "}
        {base.amount === null ? (
          "Needs verification"
        ) : (
          <>
            {formatUsd(base.amount)} <span className="muted">{base.label}</span>
          </>
        )}
      </p>
      {separate ? <p data-renewal-field="separate-charges">{separate}</p> : null}
      {check ? (
        <div
          className="ui-stack-tight"
          data-renewal-base-rent-check={check.kind}
          data-renewal-field="base-rent-check"
        >
          <p className={leads ? undefined : "muted"}>{check.text}</p>
          {leads && working?.canEdit ? (
            <p>
              <Button
                data-renewal-now-primary={primaryId ? true : undefined}
                data-renewal-now-target={primaryId ? base.correctionTarget : undefined}
                data-renewal-work-primary={primaryId ? true : undefined}
                id={primaryId}
                onClick={() => focusRenewalDashboardControl(base.correctionTarget)}
                size="compact"
                variant={
                  primaryId || base.state === "needs_verification"
                    ? "primary"
                    : "secondary"
                }
              >
                {CORRECT_CURRENT_BASE_RENT_LABEL}
              </Button>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Ask the owner: the current base rent, read only, with the same decision and wording. */
export function OwnerCurrentBaseRent({
  facts,
}: Readonly<{ facts: CurrentBaseRentFacts }>) {
  const base = useCurrentBaseRent(facts);
  return (
    <p data-renewal-base-rent={base.state} data-renewal-field="owner-current-base-rent">
      {CURRENT_BASE_RENT_LABEL}:{" "}
      <strong>
        {base.amount === null ? "Needs verification" : formatUsd(base.amount)}
      </strong>
      {base.amount === null && base.check ? (
        <>
          {" "}
          <span className="muted">{base.check.text}</span>
        </>
      ) : null}
    </p>
  );
}
