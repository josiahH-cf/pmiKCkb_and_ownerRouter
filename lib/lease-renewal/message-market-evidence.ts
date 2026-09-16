import {
  APPROVED_SUGGESTION_SOURCE,
  ownerDraftMarketFromBasis,
} from "@/lib/lease-renewal/owner-draft";
import { matchesStartingRange } from "@/lib/lease-renewal/market-starting-range";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";

/**
 * S118 (R118.3, R118.4): the market evidence the comparison-based owner message may carry.
 * A starting range from current rent is never comparable-rent evidence, and a recommendation
 * that is still RentCast's returned point estimate enters the message only through the existing
 * Admin approval of that exact number or after staff enter their own reviewed recommendation.
 */
export const STARTING_RANGE_MESSAGE_REQUIREMENT =
  "The saved low and high are the starting range from current rent, not market evidence. Review actual comparable rents with their source.";

export const PROVIDER_RECOMMENDATION_NOTICE =
  "The saved PMI recommendation is the RentCast point estimate as returned. It enters the owner message only after an Admin approves that exact number, or after staff enter a reviewed recommendation with its source.";

export interface MessageMarketEvidenceInput {
  preparation: RenewalWorkspaceState["preparation"];
  /** The fresh reconciled contractual base rent, when available. */
  currentBaseRent: number | null;
  /** The Admin-approved comp-derived number verified for this lease, when one exists. */
  approvedSuggestionValue: number | null;
}

export interface MessageMarketEvidence {
  range: { low: number; high: number; source: string } | null;
  suggestedRent: { value: number; source: string } | null;
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
  const recommendation = market?.pmiNumber;
  if (recommendation !== undefined && preparation?.source) {
    if (market?.recommendationBasis === "provider") {
      if (
        input.approvedSuggestionValue !== null &&
        input.approvedSuggestionValue === recommendation
      )
        suggestedRent = { value: recommendation, source: APPROVED_SUGGESTION_SOURCE };
      else notices.push(PROVIDER_RECOMMENDATION_NOTICE);
    } else suggestedRent = { value: recommendation, source: preparation.source };
  }

  return {
    range,
    suggestedRent,
    rangeRequirement: startingOnly ? STARTING_RANGE_MESSAGE_REQUIREMENT : null,
    notices,
  };
}
