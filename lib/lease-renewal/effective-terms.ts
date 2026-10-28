// S156 (ARCH-S156): the renewal terms staff are working with. They are the lease-bound working
// terms, one independently saved field at a time. S234 R-S234-2 / ARCH-S234-3: terms recorded on
// an earlier owner response are history and never fill a field staff have not entered. Owner
// approval and tenant acceptance are recorded facts only: neither is a prerequisite for using
// these terms.

import {
  workingRenewalTerms,
  type CompleteRenewalTerms,
  type RenewalWorkingRecord,
} from "./working-record";

export type EffectiveTermSource = "working";

export interface EffectiveRenewalTerms {
  rent: number | null;
  effectiveDate: string | null;
  endDate: string | null;
  /** Where each present field comes from. */
  sources: {
    rent: EffectiveTermSource | null;
    effectiveDate: EffectiveTermSource | null;
    endDate: EffectiveTermSource | null;
  };
  /** Identifies the terms an exact action was prepared from; never a permission. */
  revision: number;
  /** All three present and in order: usable by an operation that consumes complete terms. */
  complete: CompleteRenewalTerms | null;
  /** What an operation that needs complete terms is still missing, in plain words. */
  missing: readonly string[];
}

export function effectiveRenewalTerms(
  working: RenewalWorkingRecord | null | undefined,
): EffectiveRenewalTerms {
  const own = workingRenewalTerms(working);
  const pick = <T>(mine: T | null) =>
    mine !== null
      ? { value: mine, source: "working" as const }
      : { value: null, source: null };
  const rent = pick(own.rent);
  const effectiveDate = pick(own.effectiveDate);
  const endDate = pick(own.endDate);
  const missing: string[] = [];
  if (rent.value === null) missing.push("the renewal rent");
  if (effectiveDate.value === null) missing.push("the effective date");
  if (endDate.value === null) missing.push("the end date");
  const ordered =
    effectiveDate.value !== null &&
    endDate.value !== null &&
    endDate.value > effectiveDate.value;
  if (effectiveDate.value !== null && endDate.value !== null && !ordered)
    missing.push("an end date after the effective date");
  return {
    rent: rent.value,
    effectiveDate: effectiveDate.value,
    endDate: endDate.value,
    sources: {
      rent: rent.source,
      effectiveDate: effectiveDate.source,
      endDate: endDate.source,
    },
    revision: Math.max(1, own.revision),
    complete:
      rent.value !== null &&
      effectiveDate.value !== null &&
      endDate.value !== null &&
      ordered
        ? {
            rent: rent.value,
            effectiveDate: effectiveDate.value,
            endDate: endDate.value,
          }
        : null,
    missing,
  };
}

/** True while the terms an exact action was prepared from are still the current working terms. */
export function sameRenewalTerms(
  current: CompleteRenewalTerms | null,
  bound: CompleteRenewalTerms,
): boolean {
  return (
    current !== null &&
    current.rent === bound.rent &&
    current.effectiveDate === bound.effectiveDate &&
    current.endDate === bound.endDate
  );
}
