// S265 (R-S265-2, ARCH-S265-2): which tenant resources an offer needs, from the offer's material
// transition and inclusion decisions.
//
// This is the seam S264 feeds. Its decisions are inputs: whether an insurance transition applies,
// whether a relevant resident benefits package (RBP) is new, changed or unchanged, and whether the
// optional information form is included. Until S264 supplies them, `currentTenantResourceDecisions`
// reads today's existing message inputs and reproduces today's composition exactly:
//
//   - an insurance transition marked as applying needs its wording and the insurance flyer; an
//     insurance charge with no transition choice keeps today's advisory note (the hold S264 owns);
//   - an RBP charge marked new or changed needs the RBP flyer; unchanged or an unverified
//     comparison needs nothing (an explicit "unknown" from S264 holds the review instead);
//   - the information form is included when its link is usable for tenants, and otherwise left
//     out with no placeholder; an explicit "include" requires a usable link and its instructions.
//
// Pure and client-safe.

import type { TenantResourceId } from "./tenant-resource-evidence";

export type InsuranceTransitionDecision = "applies" | "does_not_apply" | "unknown";
export type RbpChangeDecision = "unchanged" | "new" | "changed" | "unknown";
export type InformationFormDecision = "include" | "omit" | "when_usable";

/** The decisions an offer's resources follow. S264 supplies these for its charge decisions. */
export interface TenantResourceDecisions {
  /** Null when the offer raises no insurance transition question. */
  readonly insuranceTransition: InsuranceTransitionDecision | null;
  /** Null when no relevant RBP charge governs the flyer. */
  readonly rbpChange: RbpChangeDecision | null;
  readonly informationForm: InformationFormDecision;
}

/** The part of a charge row the default decisions read. */
interface DecisionCharge {
  readonly id: string;
  readonly applicable: boolean | null;
  readonly comparison: string;
}

/**
 * Today's existing logic as the default decision source: the selected charges and the staff
 * insurance transition choice saved with the message. The first charge row per id counts, as in
 * composition.
 */
export function currentTenantResourceDecisions(input: {
  readonly charges: readonly DecisionCharge[];
  readonly insuranceTransition: { readonly applicable: boolean } | null;
}): TenantResourceDecisions {
  const first = new Map<string, DecisionCharge>();
  for (const charge of input.charges)
    if (!first.has(charge.id)) first.set(charge.id, charge);
  const insurance = first.get("insurance");
  const rbp = first.get("rbp");
  const rbpComparison = rbp?.applicable === true ? rbp.comparison : null;
  return {
    insuranceTransition: input.insuranceTransition
      ? input.insuranceTransition.applicable
        ? "applies"
        : "does_not_apply"
      : insurance?.applicable === true
        ? "unknown"
        : null,
    rbpChange:
      rbpComparison === "new" ||
      rbpComparison === "changed" ||
      rbpComparison === "unchanged"
        ? rbpComparison
        : null,
    informationForm: "when_usable",
  };
}

export type MaterialTransitionHold = "insurance_transition" | "rbp_change";

export interface TenantResourceRequirements {
  /** Resources the offer must carry, each with its wording and verified link. */
  readonly required: readonly TenantResourceId[];
  /** Whether the optional information form is part of this offer. */
  readonly informationForm: "included" | "omitted";
  /** Material transitions still unknown: their wording and flyer stay out and review waits. */
  readonly holds: readonly MaterialTransitionHold[];
}

/**
 * The resources an offer needs under its decisions. `formUsable` says whether the information
 * form's link is usable for tenants now; it only decides the default inclusion.
 */
export function projectTenantResourceRequirements(
  decisions: TenantResourceDecisions,
  formUsable: boolean,
): TenantResourceRequirements {
  const required: TenantResourceId[] = [];
  const holds: MaterialTransitionHold[] = [];
  if (decisions.insuranceTransition === "applies") required.push("insurance_flyer");
  if (decisions.insuranceTransition === "unknown") holds.push("insurance_transition");
  if (decisions.rbpChange === "new" || decisions.rbpChange === "changed")
    required.push("rbp_flyer");
  if (decisions.rbpChange === "unknown") holds.push("rbp_change");
  if (decisions.informationForm === "include") required.push("renewal_information_form");
  const informationForm =
    decisions.informationForm === "include" ||
    (decisions.informationForm === "when_usable" && formUsable)
      ? "included"
      : "omitted";
  return { required, informationForm, holds };
}
