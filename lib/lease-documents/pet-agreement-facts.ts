// S253: the names the pet agreement's amounts travel under. Pure and client-safe, so the lease and
// the Admin surface read the same names the calculator writes. No amount lives here: the fee is
// published by an Admin and the deposit is recorded by staff on the lease.

/** The source system of a refundable deposit staff recorded for one pet on one lease. */
export const STAFF_DEPOSIT_SOURCE_SYSTEM = "renewal_staff_deposit";
/** The published processing fee, and the pet agreement's two amount blanks. */
export const PET_PROCESSING_FEE_FACT = "charges.pet_processing_fee";
export const PET_AGREEMENT_DEPOSIT_FACT = "charges.pet_agreement_deposit";
export const PET_AGREEMENT_TOTAL_FACT = "charges.pet_agreement_total";
export const PET_FEE_CHARGE_ID = "pet_agreement:processing_fee";

/**
 * S253 (R-S253-2): what one processing fee can cover. The policy carries no default: the value is
 * unset until the business confirms it.
 */
export const PET_FEE_UNITS = ["pet", "agreement"] as const;
export type PetFeeUnit = (typeof PET_FEE_UNITS)[number];
export const PET_FEE_UNIT_LABELS: Readonly<Record<PetFeeUnit, string>> = {
  pet: "Each pet",
  agreement: "Each agreement",
};
