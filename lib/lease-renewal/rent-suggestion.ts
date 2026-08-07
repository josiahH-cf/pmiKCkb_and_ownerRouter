// Comp-derived SUGGESTED renewal rent number (S29, owner decision D-RENT-SUGGEST 2026-07-23).
//
// The owner opened exactly one door in the former owner-rent hard exclusion: the app MAY compute a
// comp-derived SUGGESTED renewal rent number from comp data. That number does nothing on its own — it
// enters a draft ONLY after an explicit, per-number Admin approval (see rent-suggestion-approval.ts and
// the Firestore control plane), and a human still reviews and sends the renewal email.
//
// GOVERNANCE: this module is the PURE compute core. It is deterministic and side-effect free: no
// wall-clock reads, no I/O, no network, no filesystem, and NO model/LLM call. Given a comp set it returns the
// comp MEDIAN clamped to a sane band around current rent, ALWAYS carried with the backing comp sources.
// Given no comps it returns `needs_verification` with `suggestedRent: null` — it NEVER fabricates a
// number, and it NEVER emits a `suggestedRent` without a non-empty `comps` source list.

import type { RenewalMarketBasis } from "@/lib/lease-renewal/renewal-progress";

/** One comparable rent that backs a suggestion. Always shown beside the suggested number. */
export interface CompSource {
  /** The comparable monthly rent. Only finite, positive values contribute to the suggestion. */
  rent: number;
  /** Human attribution for this comp (e.g. "Zillow low", "PMI rental analysis", "RentCast median"). */
  source: string;
  /** Optional address or descriptive label for display. */
  label?: string;
}

/** Bounds the suggestion to a sane band around the current rent so one outlier comp cannot run away. */
export interface RentSuggestionPolicy {
  /**
   * The largest fractional distance from current rent the suggestion may sit (e.g. 0.15 = within 15%
   * of current rent). Applied only when a positive current rent is supplied. Defaults to 0.15.
   */
  maxDeviationFraction?: number;
}

export interface RentSuggestionInput {
  /** The comparable rents to aggregate. May be empty; an empty or all-invalid set yields no number. */
  comps: readonly CompSource[];
  /** Current base rent (read-authoritative). Used only to clamp the suggestion into a sane band. */
  currentRent?: number;
  policy?: RentSuggestionPolicy;
}

export type RentSuggestionStatus = "suggested" | "needs_verification";

/** How the suggested number was derived (S62 widens the original comp-median-only union). */
export type RentSuggestionMethod = "comp_median" | "owner_policy_percent";

export interface RentSuggestion {
  /** The suggested monthly rent, or null when there is no defensible basis (never fabricated). */
  suggestedRent: number | null;
  /** The derivation method: the comp median (S29) or an owner-policy percentage rule (S62). */
  method: RentSuggestionMethod;
  /** The sources that produced the number. Non-empty exactly when `suggestedRent` is non-null. */
  comps: CompSource[];
  status: RentSuggestionStatus;
  /** Plain-English explanation of how the number was derived, for display beside it. */
  rationale: string;
  /**
   * S62 precedence context (AC-S62-6): when an owner-policy rule proposes the number and a comp
   * median also exists, the median stays VISIBLE here rather than being silently discarded.
   */
  context?: { compMedian: number | null };
}

const DEFAULT_MAX_DEVIATION_FRACTION = 0.15;

const NEEDS_VERIFICATION: RentSuggestion = Object.freeze({
  suggestedRent: null,
  method: "comp_median",
  comps: [],
  status: "needs_verification",
  rationale: "No comparable rents are available, so the number needs verification.",
});

function isUsableRent(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** The owner-policy rule shape the pure computation needs (mirrors the S62 store's rule). */
export interface OwnerPolicyPercentInput {
  portfolioId: string;
  percent: number;
  note?: string;
}

/**
 * S62: compute the owner-policy suggested renewal rent — the authoritative current rent increased
 * by the rule's flat percentage, rounded by the existing whole-dollar convention. Pure and
 * deterministic. A zero, missing, or non-numeric base REFUSES with an explicit reason rather than
 * computing a percentage of nothing (AC-S62-5), and an invalid percentage refuses too. The result
 * enters the SAME `suggested` state the S29 approval FSM guards, so approval semantics are
 * unchanged rather than special-cased.
 */
export function computeOwnerPolicySuggestion(input: {
  currentRent: number | null | undefined;
  rule: OwnerPolicyPercentInput;
}): RentSuggestion {
  const { rule } = input;
  const label = `Owner policy: +${rule.percent}% (portfolio ${rule.portfolioId})`;
  if (
    typeof input.currentRent !== "number" ||
    !Number.isFinite(input.currentRent) ||
    input.currentRent <= 0
  ) {
    return {
      suggestedRent: null,
      method: "owner_policy_percent",
      comps: [],
      status: "needs_verification",
      rationale: `${label} cannot be applied: the authoritative current rent is missing or zero, and a percentage of nothing is not a number. Needs verification.`,
    };
  }
  if (
    typeof rule.percent !== "number" ||
    !Number.isFinite(rule.percent) ||
    rule.percent <= 0
  ) {
    return {
      suggestedRent: null,
      method: "owner_policy_percent",
      comps: [],
      status: "needs_verification",
      rationale:
        "The owner-policy percentage is not a usable number. Needs verification.",
    };
  }
  const suggested = Math.round(input.currentRent * (1 + rule.percent / 100));
  return {
    suggestedRent: suggested,
    method: "owner_policy_percent",
    comps: [
      {
        rent: suggested,
        source: label,
        ...(rule.note ? { label: rule.note } : {}),
      },
    ],
    status: "suggested",
    rationale: `${label}: ${formatWhole(input.currentRent)} current rent plus ${rule.percent}% is ${formatWhole(suggested)}.${rule.note ? ` Rule note: ${rule.note}` : ""}`,
  };
}

function median(sortedAscending: readonly number[]): number {
  const middle = Math.floor(sortedAscending.length / 2);
  if (sortedAscending.length % 2 === 1) {
    return sortedAscending[middle];
  }
  return (sortedAscending[middle - 1] + sortedAscending[middle]) / 2;
}

/**
 * Compute the comp-derived suggested renewal rent. Pure and deterministic: the same input always yields
 * a deep-equal result. Returns `needs_verification` with a null number when no comp is usable, and never
 * returns a number without the backing comp sources.
 */
export function computeRentSuggestion(input: RentSuggestionInput): RentSuggestion {
  const usableComps = input.comps.filter((comp) => isUsableRent(comp.rent));
  if (usableComps.length === 0) {
    // Return a fresh object (not the frozen template) so callers may safely read/spread it.
    return { ...NEEDS_VERIFICATION, comps: [] };
  }

  const rents = usableComps.map((comp) => comp.rent).sort((left, right) => left - right);
  const rawMedian = median(rents);

  let suggested = Math.round(rawMedian);
  let clampNote = "";
  const currentRent = input.currentRent;
  if (
    typeof currentRent === "number" &&
    Number.isFinite(currentRent) &&
    currentRent > 0
  ) {
    const deviation =
      input.policy?.maxDeviationFraction ?? DEFAULT_MAX_DEVIATION_FRACTION;
    const low = Math.round(currentRent * (1 - deviation));
    const high = Math.round(currentRent * (1 + deviation));
    const clamped = Math.min(Math.max(suggested, low), high);
    if (clamped !== suggested) {
      const pct = Math.round(deviation * 100);
      clampNote = `, held within ${pct}% of the current rent of ${formatWhole(currentRent)}`;
      suggested = clamped;
    }
  }

  return {
    suggestedRent: suggested,
    method: "comp_median",
    comps: usableComps.map((comp) => ({ ...comp })),
    status: "suggested",
    rationale: `Median of ${rents.length} comparable ${rents.length === 1 ? "rent" : "rents"} (${rents
      .map(formatWhole)
      .join(", ")}) is ${formatWhole(suggested)}${clampNote}.`,
  };
}

function formatWhole(amount: number): string {
  return "$" + String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Map the operator's already-captured comp basis (Zillow low/high plus the PMI rental-analysis number)
 * onto the comp set the suggestion aggregates. Every value is the operator's OWN input; this only
 * relabels the present, usable numbers as comps and never synthesizes one. Until S28's live comp
 * provider lands, this is the input to `computeRentSuggestion` for a live lease. Pure and deterministic.
 */
export function compsFromMarketBasis(market: RenewalMarketBasis): CompSource[] {
  const comps: CompSource[] = [];
  if (market.zillowLow !== undefined && isUsableRent(market.zillowLow)) {
    comps.push({ rent: market.zillowLow, source: "Zillow low" });
  }
  if (market.zillowHigh !== undefined && isUsableRent(market.zillowHigh)) {
    comps.push({ rent: market.zillowHigh, source: "Zillow high" });
  }
  if (market.pmiNumber !== undefined && isUsableRent(market.pmiNumber)) {
    comps.push({ rent: market.pmiNumber, source: "PMI rental analysis" });
  }
  return comps;
}
