// S153: plain display helpers for the rent and charge facts. Pure: they format what the charge
// inventory and the working record already say and never choose, sum or relabel an amount.

import { formatCalendarDate, formatSourceCalendarDate } from "@/lib/date-display";
import type { EffectiveRenewalTerms } from "./effective-terms";
import type {
  RenewalChargeInventory,
  RenewalChargeOption,
} from "./writeback/charge-inventory-model";

/** The card's reference formatting for a money amount, matching the existing lease facts. */
export function formatMoneyReference(value: number): string {
  return value.toFixed(2);
}

export const CHARGE_CLASSIFICATION_LABELS = {
  rent: "Rent account",
  non_rent: "Other recurring charge",
  unknown: "Account classification unavailable",
} as const;

export function chargeScheduleLabel(current: boolean | null): string {
  if (current === true) return "within current schedule";
  if (current === false) return "outside current schedule";
  return "schedule boundary needs review";
}

/** The provider amount as a number, or null when it is not one. */
export function chargeAmountNumber(charge: RenewalChargeOption): number | null {
  const amount = Number(charge.projection.amount);
  return Number.isFinite(amount) ? amount : null;
}

export function chargeDisplayName(charge: RenewalChargeOption): string {
  return charge.accountLabel ?? charge.projection.description;
}

/** "1180.00 every 1 month(s) on day 1" in the provider's own schedule terms. */
export function chargeScheduleText(charge: RenewalChargeOption): string {
  const { amount, frequency, dayDue } = charge.projection;
  return `${amount} every ${frequency} month(s) on day ${dayDue}`;
}

/** The charge's own billing period, labelled as such and never as the lease dates. */
export function chargeBillingPeriod(charge: RenewalChargeOption): string {
  return `Billing period: ${formatSourceCalendarDate(charge.projection.startDate)} to ${formatSourceCalendarDate(charge.projection.endDate, "no end date")}`;
}

/** The lease dates RentVine reported with the inventory, labelled as lease dates. */
export function inventoryLeaseDates(inventory: RenewalChargeInventory): string {
  return `Lease dates (RentVine): ${formatSourceCalendarDate(inventory.leaseDates.startDate)} to ${formatSourceCalendarDate(inventory.leaseDates.endDate, "no end date")}`;
}

/** Charges that apply now or whose schedule boundary is unconfirmed, then the rest. */
export function splitChargesBySchedule(inventory: RenewalChargeInventory): {
  current: RenewalChargeOption[];
  other: RenewalChargeOption[];
} {
  const current = inventory.charges.filter((charge) => charge.current !== false);
  const other = inventory.charges.filter((charge) => charge.current === false);
  // Rent-account charges first within each group; the inventory's own order otherwise.
  const rank = (charge: RenewalChargeOption) =>
    charge.classification === "rent" ? 0 : 1;
  return {
    current: [...current].sort((left, right) => rank(left) - rank(right)),
    other,
  };
}

/**
 * The working renewal terms in one line, showing only the fields that exist and naming what an
 * operation that needs all three is still missing. Null when no field has been entered.
 */
export function describeRenewalTerms(
  terms: EffectiveRenewalTerms,
  money: (value: number) => string = formatMoneyReference,
): string | null {
  const parts: string[] = [];
  if (terms.rent !== null) parts.push(`Rent ${money(terms.rent)}`);
  if (terms.effectiveDate !== null)
    parts.push(`effective ${formatCalendarDate(terms.effectiveDate)}`);
  if (terms.endDate !== null) parts.push(`to ${formatCalendarDate(terms.endDate)}`);
  if (parts.length === 0) return null;
  const text = parts.join(" ");
  return terms.complete ? text : `${text} (still needed: ${terms.missing.join(", ")})`;
}
