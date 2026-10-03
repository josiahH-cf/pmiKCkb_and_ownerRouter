// S156 (ARCH-S156): the renewal terms staff are working with. They are the lease-bound working
// terms, one independently saved field at a time; a field staff have not entered falls back to
// the same field of owner-approved terms already recorded on the work record. Owner approval and
// tenant acceptance are recorded facts only: neither is a prerequisite for using these terms.

import {
  workingRenewalTerms,
  type CompleteRenewalTerms,
  type RenewalWorkingRecord,
} from "./working-record";
import { currentManualOwnerTerms, type RenewalWorkspaceState } from "./workspace-state";

export type EffectiveTermSource = "working" | "owner_response";

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
  state: RenewalWorkspaceState | null | undefined,
): EffectiveRenewalTerms {
  const own = workingRenewalTerms(working);
  const recorded = state ? currentManualOwnerTerms(state) : null;
  const pick = <T>(mine: T | null, theirs: T | undefined) =>
    mine !== null
      ? { value: mine, source: "working" as const }
      : theirs !== undefined
        ? { value: theirs, source: "owner_response" as const }
        : { value: null, source: null };
  const rent = pick(own.rent, recorded?.rent);
  const effectiveDate = pick(own.effectiveDate, recorded?.effectiveDate);
  const endDate = pick(own.endDate, recorded?.endDate);
  const usesRecorded = [rent, effectiveDate, endDate].some(
    (field) => field.source === "owner_response",
  );
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
    revision: Math.max(1, own.revision, usesRecorded ? (state?.termsRevision ?? 0) : 0),
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
