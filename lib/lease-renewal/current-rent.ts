// S153 (ARCH-S153-1/2/3): the one shared meaning of "current rent" for the desk, the lease
// workspace and newly prepared messages.
//
// Precedence: a retained staff working value, then the single current rent-account recurring
// charge, then the contractual lease amount under its own label. The charge inventory stays the
// owner of charge identity and schedule interpretation: several current rent candidates, an
// unclear schedule boundary or an unclassified account are reported as they are. Nothing here
// sums, splits, divides or selects a charge, and a contractual, aggregate or listing amount is
// never relabeled as rent billing.

import { workingCurrentRent, type RenewalWorkingRecord } from "./working-record";
import type {
  RenewalChargeInventory,
  RenewalChargeOption,
} from "./writeback/charge-inventory-model";

export type CurrentRentBasis = "working" | "rent_charge" | "contractual" | "none";

export type CurrentRentChargeEvidence =
  /** The inventory was not read for this consumer (for example the desk list). */
  | "not_read"
  /** The inventory read failed or is unavailable right now. */
  | "unavailable"
  /** Exactly one current rent-account charge. */
  | "single"
  /** More than one current rent-account charge; none is selected and none are added. */
  | "several"
  /** A rent or unclassified charge whose schedule or account cannot be confirmed as current. */
  | "unclear"
  /** The inventory holds no current rent-account charge. */
  | "none";

export interface OperationalCurrentRent {
  /** The amount consumers use as current rent; null when no actual amount exists. */
  amount: number | null;
  basis: CurrentRentBasis;
  /** A short provenance label for the amount, safe to show beside it. */
  label: string;
  chargeEvidence: CurrentRentChargeEvidence;
  /** The single identified current rent charge, when there is exactly one. */
  rentCharge: RenewalChargeOption | null;
  /** Every charge that could be the current rent charge, shown as actual evidence. */
  candidates: readonly RenewalChargeOption[];
  /** The contractual lease amount, kept available under its own meaning. */
  contractualRent: number | null;
  /** The working value, when staff retained one. */
  workingRent: number | null;
  /** Plain advisory text when the charge evidence is ambiguous or missing; null otherwise. */
  attention: string | null;
}

export const CURRENT_RENT_LABELS = {
  working: "Staff working value",
  rent_charge: "RentVine rent-account recurring charge",
  contractual: "RentVine contractual lease amount",
  none: "No current rent amount available",
} as const satisfies Record<CurrentRentBasis, string>;

function chargeAmount(charge: RenewalChargeOption): number | null {
  const amount = Number(charge.projection.amount);
  return Number.isFinite(amount) ? amount : null;
}

/** Current rent-account charges, and those that might be, straight from the inventory. */
export function currentRentCandidates(inventory: RenewalChargeInventory): {
  certain: RenewalChargeOption[];
  uncertain: RenewalChargeOption[];
} {
  const certain: RenewalChargeOption[] = [];
  const uncertain: RenewalChargeOption[] = [];
  for (const charge of inventory.charges) {
    if (charge.current === false || charge.classification === "non_rent") continue;
    if (
      charge.classification === "rent" &&
      charge.current === true &&
      chargeAmount(charge) !== null
    )
      certain.push(charge);
    else uncertain.push(charge);
  }
  return { certain, uncertain };
}

export function operationalCurrentRent(input: {
  working?: RenewalWorkingRecord | null;
  /** Undefined: this consumer does not read charges. Null: the read is unavailable. */
  inventory?: RenewalChargeInventory | null;
  contractualRent: number | null;
}): OperationalCurrentRent {
  const workingRent = workingCurrentRent(input.working);
  const contractualRent = input.contractualRent;
  let chargeEvidence: CurrentRentChargeEvidence = "not_read";
  let rentCharge: RenewalChargeOption | null = null;
  let candidates: readonly RenewalChargeOption[] = [];
  let attention: string | null = null;
  if (input.inventory === null) {
    chargeEvidence = "unavailable";
    attention =
      "The recurring charge list is unavailable right now, so rent billing is not confirmed.";
  } else if (input.inventory) {
    const { certain, uncertain } = currentRentCandidates(input.inventory);
    candidates = [...certain, ...uncertain];
    if (certain.length === 1 && uncertain.length === 0) {
      chargeEvidence = "single";
      rentCharge = certain[0]!;
    } else if (certain.length > 1) {
      chargeEvidence = "several";
      attention =
        "RentVine lists more than one current rent-account charge. Each is shown as recorded; none is selected or added together.";
    } else if (uncertain.length > 0) {
      chargeEvidence = "unclear";
      attention =
        "A charge that may be the rent charge has an account or schedule that is not confirmed as current. It is shown as recorded.";
    } else {
      chargeEvidence = "none";
      attention =
        "RentVine lists no current rent-account recurring charge for this lease.";
    }
  }
  const base = { chargeEvidence, rentCharge, candidates, contractualRent, workingRent };
  if (workingRent !== null)
    return {
      ...base,
      amount: workingRent,
      basis: "working",
      label: CURRENT_RENT_LABELS.working,
      attention,
    };
  if (rentCharge)
    return {
      ...base,
      amount: chargeAmount(rentCharge),
      basis: "rent_charge",
      label: CURRENT_RENT_LABELS.rent_charge,
      attention,
    };
  if (contractualRent !== null)
    return {
      ...base,
      amount: contractualRent,
      basis: "contractual",
      label: CURRENT_RENT_LABELS.contractual,
      attention,
    };
  return {
    ...base,
    amount: null,
    basis: "none",
    label: CURRENT_RENT_LABELS.none,
    attention,
  };
}
