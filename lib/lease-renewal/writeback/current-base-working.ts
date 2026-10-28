// S237 R-S237-2 (amended 2026-10-28): a current base-rent preview prepared from the saved Working
// current rent, with no separate staff source note, is bound to that saved value at preparation,
// at confirmation and inside the one-attempt claim, mirroring the Sheet claim. The RentVine panel's
// direct "Correct current base-rent billing" entry carries its own staff evidence note and stays a
// deliberate staff path, so it is not bound here.

import {
  workingCurrentRent,
  type RenewalWorkingRecord,
} from "@/lib/lease-renewal/working-record";

/** Stored on a preview prepared without a separate staff source note; describes, never attests. */
export const STAFF_WORKING_VALUE_EVIDENCE = "Staff working value";

/** Whether this preview was prepared from the saved Working current rent. */
export function isWorkingBoundCurrentBase(proposal: {
  readonly businessIntent?: "current_base" | "future_rent";
  readonly evidenceRef?: string;
}): boolean {
  return (
    proposal.businessIntent === "current_base" &&
    proposal.evidenceRef === STAFF_WORKING_VALUE_EVIDENCE
  );
}

/** Whether a charge-amount effect still equals the saved Working current rent, in whole cents. */
export function currentBaseMatchesWorking(
  effect: { readonly kind: string; readonly changes?: { readonly amount?: string } },
  working: RenewalWorkingRecord | null | undefined,
): boolean {
  const current = workingCurrentRent(working);
  const amount = Number(
    effect.kind === "recurring_charge_update" ? effect.changes?.amount : NaN,
  );
  return (
    current !== null &&
    Number.isFinite(amount) &&
    Math.round(amount * 100) === Math.round(current * 100)
  );
}

export const WORKING_VALUE_CHANGED_MESSAGE =
  "The saved working current rent is not the amount in this preview, so nothing new was sent to RentVine. Save the working value, then prepare a fresh preview.";
