import { ownerDraftMarketFromBasis } from "@/lib/lease-renewal/owner-draft";
import { matchesStartingRange } from "@/lib/lease-renewal/market-starting-range";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";

/**
 * S118 (R118.3, R118.4): the market evidence the comparison-based owner message may carry.
 * A starting range is not comparable evidence. S183/S195: a working offer is staff-selected once;
 * a provider point estimate remains explicitly reference-only. No per-number approval precedes
 * editing or the exact human Send/Schedule authorization.
 */
export const STARTING_RANGE_MESSAGE_REQUIREMENT =
  "The saved low and high are the starting range from current rent, not market evidence. Review actual comparable rents with their source.";

export const PROVIDER_RECOMMENDATION_NOTICE =
  "The RentCast point estimate is reference context. Staff select their working offer separately.";

export interface MessageMarketEvidenceInput {
  preparation: RenewalWorkspaceState["preparation"];
  /** The fresh reconciled contractual base rent, when available. */
  currentBaseRent: number | null;
  /** Historical compatibility input; prior approvals remain history, never a new preparation gate. */
  approvedSuggestionValue?: number | null;
  selectedWorkingOffer?: { value: number; source: string } | null;
}

export interface MessageMarketEvidence {
  range: { low: number; high: number; source: string } | null;
  suggestedRent: {
    value: number;
    source: string;
    kind?: "working_offer" | "provider_reference" | "reviewed";
  } | null;
  /** Replaces the generic range requirement when the saved range is only the starting rule. */
  rangeRequirement: string | null;
  notices: string[];
}

export function projectMessageMarketEvidence(
  input: MessageMarketEvidenceInput,
): MessageMarketEvidence {
  const preparation = input.preparation;
  const market = preparation?.market;
  const ownerMarket = market ? ownerDraftMarketFromBasis(market) : {};
  const notices: string[] = [];
  const rangeSource = market?.provider ? ownerMarket.rangeSource : preparation?.source;
  const startingOnly = Boolean(
    market &&
    !market.provider &&
    market.rangeLow !== undefined &&
    market.rangeHigh !== undefined &&
    (market.rangeBasis === "starting_rule" ||
      (input.currentBaseRent !== null &&
        matchesStartingRange(
          { low: market.rangeLow, high: market.rangeHigh },
          input.currentBaseRent,
        ))),
  );
  const range =
    !startingOnly &&
    ownerMarket.rangeLow !== undefined &&
    ownerMarket.rangeHigh !== undefined &&
    rangeSource
      ? { low: ownerMarket.rangeLow, high: ownerMarket.rangeHigh, source: rangeSource }
      : null;

  let suggestedRent: MessageMarketEvidence["suggestedRent"] = null;
  const selected = input.selectedWorkingOffer;
  const recommendation = market?.pmiNumber;
  if (
    selected &&
    Number.isFinite(selected.value) &&
    selected.value > 0 &&
    selected.source.trim()
  )
    suggestedRent = { ...selected, kind: "working_offer" };
  else if (
    recommendation !== undefined &&
    Number.isFinite(recommendation) &&
    recommendation > 0 &&
    preparation?.source
  ) {
    const providerReference = market?.recommendationBasis === "provider";
    suggestedRent = {
      value: recommendation,
      source: providerReference
        ? `${market.provider?.source ?? "Provider"} point estimate (reference only)`
        : preparation.source,
      kind: providerReference ? "provider_reference" : "reviewed",
    };
  }

  return {
    range,
    suggestedRent,
    rangeRequirement: startingOnly ? STARTING_RANGE_MESSAGE_REQUIREMENT : null,
    notices,
  };
}
