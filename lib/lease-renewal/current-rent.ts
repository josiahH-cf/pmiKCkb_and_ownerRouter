// S153 (ARCH-S153-1/2/3): the one shared meaning of "current rent" for the desk, the lease
// workspace and newly prepared messages.
//
// Precedence: a retained staff working value, then the single current rent-account recurring
// charge, then the contractual lease amount under its own label. The charge inventory stays the
// owner of charge identity and schedule interpretation: several current rent candidates, an
// unclear schedule boundary or an unclassified account are reported as they are. Nothing here
// sums, splits, divides or selects a charge, and a contractual, aggregate or listing amount is
// never relabeled as rent billing.
//
// S261 (R-S261-1, ARCH-S261-1): `currentBaseRent` is the one current base rent decision every
// surface that asks for base reads: the desk and its batch rows, the comparison preparation,
// Check the numbers in both views, Ask the owner and the owner message. It keeps this precedence
// and adds what "verified" means: a single rent-account charge or a contractual amount that the
// other source contradicts is not guessed; the base then needs verification, with the exact
// differing sources and the existing working current rent correction as its fix.

import { workingCurrentRent, type RenewalWorkingRecord } from "./working-record";
import { WORKING_CURRENT_RENT_TARGET } from "./workspace-targets";
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

function usableAmount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function operationalCurrentRent(input: {
  working?: RenewalWorkingRecord | null;
  /**
   * The working current rent as an amount, for a consumer that holds only the amount (a desk
   * row). Read only when `working` is not given.
   */
  workingRent?: number | null;
  /** Undefined: this consumer does not read charges. Null: the read is unavailable. */
  inventory?: RenewalChargeInventory | null;
  contractualRent: number | null;
}): OperationalCurrentRent {
  const workingRent =
    input.working !== undefined
      ? workingCurrentRent(input.working)
      : usableAmount(input.workingRent);
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

// ---- S261: the one current base rent decision ---------------------------------------------------

/** The label every surface uses for the base amount. */
export const CURRENT_BASE_RENT_LABEL = "Current base rent";

export type CurrentBaseRentState = "ready" | "needs_verification";

/**
 * Why the base needs a look: two sources disagree (`conflict`), several possible rent charges
 * (`ambiguous`), the charge evidence does not confirm the contractual base (`unconfirmed`), the
 * charge read failed (`unavailable`), or there is no base at all (`missing`).
 */
export type CurrentBaseRentCheckKind =
  | "conflict"
  | "ambiguous"
  | "unconfirmed"
  | "unavailable"
  | "missing";

export interface CurrentBaseRentSource {
  readonly label: string;
  readonly amount: number;
}

export interface CurrentBaseRentCheck {
  readonly kind: CurrentBaseRentCheckKind;
  /** What staff verify, in plain words, naming each differing amount and the correction. */
  readonly text: string;
  /** True when the existing correction should lead the work for the numbers. */
  readonly leads: boolean;
  /** The source amounts the text names, each under its own label. */
  readonly sources: readonly CurrentBaseRentSource[];
}

export interface CurrentBaseRentCharge {
  readonly id: string;
  readonly label: string;
  readonly amount: number;
}

export interface CurrentBaseRent extends OperationalCurrentRent {
  readonly state: CurrentBaseRentState;
  readonly check: CurrentBaseRentCheck | null;
  /** Current recurring charges outside the rent account (for example pet rent), each its own fact. */
  readonly separateCharges: readonly CurrentBaseRentCharge[];
  /** The provider's lease total of every active recurring charge; never the base. */
  readonly providerTotal: number | null;
  /** The unit's listed rent; a reference, never the base. */
  readonly listedRent: number | null;
  /** The existing working current rent correction that resolves a check. */
  readonly correctionTarget: typeof WORKING_CURRENT_RENT_TARGET;
}

const baseMoney = (amount: number) =>
  `$${(Number.isInteger(amount) ? String(amount) : amount.toFixed(2)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  )}`;

const sameAmount = (left: number, right: number) => Math.abs(left - right) < 0.005;

const SOURCE_LABELS = {
  rentCharge: "RentVine rent charge",
  contractual: "RentVine contractual base rent",
  total: "RentVine lease total",
} as const;

const CORRECT_BASE =
  "Verify the base rent on the lease and enter it as the working current rent.";

function chargeLabel(charge: RenewalChargeOption): string {
  return charge.accountLabel ?? charge.projection.description;
}

function amountList(amounts: readonly number[]): string {
  const words = amounts.map(baseMoney);
  return words.length <= 2
    ? words.join(" and ")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * S261 R-S261-1: the current base rent, once, for every consumer. The working correction leads;
 * then the single current rent-account charge and the contractual amount, each only while the
 * other source does not contradict it. A total, a listing, an unclassified charge or a sum is never
 * the base. When the base cannot be verified the amount is null and `check` names what to verify.
 */
export function currentBaseRent(input: {
  working?: RenewalWorkingRecord | null;
  workingRent?: number | null;
  /** Undefined: this consumer does not read charges. Null: the read is unavailable. */
  inventory?: RenewalChargeInventory | null;
  contractualRent: number | null;
  providerTotal?: number | null;
  listedRent?: number | null;
}): CurrentBaseRent {
  const rent = operationalCurrentRent(input);
  const providerTotal = usableAmount(input.providerTotal);
  const listedRent = usableAmount(input.listedRent);
  const separateCharges: CurrentBaseRentCharge[] = [];
  for (const charge of input.inventory?.charges ?? []) {
    const amount = chargeAmount(charge);
    if (
      charge.classification !== "non_rent" ||
      charge.current !== true ||
      amount === null
    )
      continue;
    separateCharges.push({ id: charge.id, label: chargeLabel(charge), amount });
  }
  const decided: Omit<CurrentBaseRent, "state" | "check"> = {
    ...rent,
    separateCharges,
    providerTotal,
    listedRent,
    correctionTarget: WORKING_CURRENT_RENT_TARGET,
  };
  const ready = (check: CurrentBaseRentCheck | null): CurrentBaseRent => ({
    ...decided,
    state: "ready",
    check,
  });
  const verify = (check: CurrentBaseRentCheck): CurrentBaseRent => ({
    ...decided,
    amount: null,
    state: "needs_verification",
    check,
  });
  const contractual = rent.contractualRent;
  const candidates = rent.candidates.flatMap((charge) => {
    const amount = chargeAmount(charge);
    return amount === null ? [] : [{ label: chargeLabel(charge), amount }];
  });
  const totalNote =
    providerTotal === null
      ? ""
      : ` The ${SOURCE_LABELS.total} of ${baseMoney(providerTotal)} includes every recurring charge, so it is not the base rent.`;

  if (rent.basis === "working") return ready(null);

  if (rent.basis === "rent_charge" && rent.amount !== null) {
    const charged = rent.amount;
    if (contractual === null || sameAmount(contractual, charged)) return ready(null);
    return verify({
      kind: "conflict",
      leads: true,
      sources: [
        { label: SOURCE_LABELS.rentCharge, amount: charged },
        { label: SOURCE_LABELS.contractual, amount: contractual },
      ],
      text: `The ${SOURCE_LABELS.rentCharge} is ${baseMoney(charged)} and the ${SOURCE_LABELS.contractual} is ${baseMoney(contractual)}, so the base rent is not confirmed. ${CORRECT_BASE}`,
    });
  }

  if (rent.basis === "contractual" && contractual !== null) {
    const contractSource = { label: SOURCE_LABELS.contractual, amount: contractual };
    const amounts = candidates.map((entry) => entry.amount);
    switch (rent.chargeEvidence) {
      case "unavailable":
        return ready({
          kind: "unavailable",
          leads: false,
          sources: [contractSource],
          text: `The recurring charge list could not be read, so the ${SOURCE_LABELS.contractual} of ${baseMoney(contractual)} is not confirmed by a rent charge. Refresh this lease to read it again, or correct the current base rent if the lease says otherwise.`,
        });
      case "none":
        return ready({
          kind: "unconfirmed",
          leads: true,
          sources: [contractSource],
          text: `RentVine lists no current rent charge, so the ${SOURCE_LABELS.contractual} of ${baseMoney(contractual)} is not confirmed by billing. Correct the current base rent if the lease says otherwise.`,
        });
      case "unclear":
        return ready({
          kind: "unconfirmed",
          leads: true,
          sources: [contractSource, ...candidates],
          text: `A possible rent charge (${amountList(amounts)}) is not confirmed as current, so this uses the ${SOURCE_LABELS.contractual} of ${baseMoney(contractual)}. Correct the current base rent if the lease says otherwise.`,
        });
      case "several":
        if (amounts.some((amount) => sameAmount(amount, contractual)))
          return ready({
            kind: "ambiguous",
            leads: true,
            sources: [contractSource, ...candidates],
            text: `RentVine lists ${amounts.length} current rent charges (${amountList(amounts)}); none is chosen or added together. This uses the ${SOURCE_LABELS.contractual} of ${baseMoney(contractual)}. Correct the current base rent if the lease says otherwise.`,
          });
        return verify({
          kind: "conflict",
          leads: true,
          sources: [contractSource, ...candidates],
          text: `The ${SOURCE_LABELS.contractual} of ${baseMoney(contractual)} matches none of the ${amounts.length} current rent charges (${amountList(amounts)}), so the base rent is not confirmed. ${CORRECT_BASE}`,
        });
      default:
        // The charges were not read for this consumer (the desk): the typed contractual amount.
        return ready(null);
    }
  }

  // No working correction, no single rent charge and no contractual amount.
  if (candidates.length > 0)
    return verify({
      kind: "ambiguous",
      leads: true,
      sources: candidates,
      text: `RentVine reports no contractual base rent, and its possible rent charges (${amountList(candidates.map((entry) => entry.amount))}) are not one confirmed amount.${totalNote} ${CORRECT_BASE}`,
    });
  return verify({
    kind: "missing",
    leads: true,
    sources:
      providerTotal === null
        ? []
        : [{ label: SOURCE_LABELS.total, amount: providerTotal }],
    text:
      rent.chargeEvidence === "unavailable"
        ? `RentVine reports no contractual base rent, and the recurring charge list could not be read.${totalNote} Refresh this lease, or verify the base rent on the lease and enter it as the working current rent.`
        : `RentVine reports no contractual base rent and no current rent charge.${totalNote} ${CORRECT_BASE}`,
  });
}
