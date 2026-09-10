import type { LeaseDateState, RecurringChargeProjection } from "./proposal-contract";

export interface RenewalChargeOption {
  id: string;
  accountId: string;
  accountLabel: string | null;
  classification: "rent" | "non_rent" | "unknown";
  /** Null includes unknown dates and the unverified end-date inclusivity boundary. */
  current: boolean | null;
  projection: RecurringChargeProjection;
}
export interface RenewalChargeInventory {
  leaseId: string;
  leaseDates: LeaseDateState;
  asOfDate: string;
  charges: RenewalChargeOption[];
}
export function chargeDateIso(value: string | null): string | null {
  if (value === null) return null;
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const iso = us ? `${us[3]}-${us[1]}-${us[2]}` : value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) &&
    Number.isFinite(Date.parse(iso)) &&
    new Date(iso).toISOString().slice(0, 10) === iso
    ? iso
    : null;
}
