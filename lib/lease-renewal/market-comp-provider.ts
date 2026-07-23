// Market-comp PROVIDER seam (S28a). A pluggable abstraction for a comparable-rent range shown as
// REFERENCE ONLY next to the owner-decision form. It NEVER fills or moves the offered-rent number (that
// stays the operator's decision; the comp-derived SUGGESTED number is the separate Admin-approval-gated
// S29). Absent data yields `confidence:"Needs Verification"` with no numbers — never a fabricated value,
// preserving the no-invented-number invariant (F-NEGOTIATION-EXCLUDED until S29, then S29's gate).
//
// Two adapters implement the same interface: ManualMarketCompProvider reproduces exactly today's
// operator-typed behavior with no network call (the default, works day one with no owner step), and the
// RentCastMarketCompProvider (built behind this interface, inert until its gate flips) queries the
// licensed rental-listings search API. Selecting the adapter is prod-fenced by config exactly like
// createMaintenanceImageStore. The ONLY external datum is the property address (D07/D08 boundary,
// matching market-links.ts) — never tenant PII, never a rent figure.

import type { RenewalMarketBasis } from "@/lib/lease-renewal/renewal-progress";
import {
  RentCastMarketCompProvider,
  type MarketCompTransport,
} from "@/lib/lease-renewal/providers/rentcast-market-comp-provider";

/** In-boundary query for a comp lookup. The address is the only external datum; no tenant PII, no rent. */
export interface MarketCompQuery {
  /** The property address label (in-boundary; never written to git). */
  addressLabel: string;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: string;
}

/** A DISPLAY-only comparable-rent result. Any numeric field is optional; absent → Needs Verification. */
export interface MarketCompResult {
  rangeLow?: number;
  rangeHigh?: number;
  /** The point estimate (RentCast: the MEDIAN of the comps; Manual: the operator's own PMI number). */
  pointEstimate?: number;
  /** How many comparable listings backed the result (RentCast only). */
  compCount?: number;
  /** Attribution shown on the reference display and carried onto the owner-draft comp fact. */
  source: string;
  /** ISO timestamp the result was retrieved (RentCast receipt); omitted for the manual echo. */
  retrievedAt?: string;
  confidence: "Likely" | "Needs Verification";
}

export interface MarketCompProvider {
  lookup(query: MarketCompQuery): Promise<MarketCompResult>;
}

/** The attribution label the manual pass-through wears. */
export const MANUAL_MARKET_COMP_SOURCE = "Manual entry";

/**
 * The manual adapter: passes the operator's OWN entered comp numbers straight through as a result, with
 * NO network call and no synthesis. Given any of the operator's Zillow low/high or PMI number it returns
 * exactly those (source "Manual entry", confidence "Likely"); given nothing it returns a numberless
 * "Needs Verification" result. It never invents a value (D19 / F-NEGOTIATION-EXCLUDED).
 */
export class ManualMarketCompProvider implements MarketCompProvider {
  constructor(private readonly basis: RenewalMarketBasis = {}) {}

  async lookup(_query: MarketCompQuery): Promise<MarketCompResult> {
    void _query;
    const { zillowLow, zillowHigh, pmiNumber } = this.basis;
    const hasAny =
      zillowLow !== undefined || zillowHigh !== undefined || pmiNumber !== undefined;
    if (!hasAny) {
      return { source: MANUAL_MARKET_COMP_SOURCE, confidence: "Needs Verification" };
    }
    return {
      ...(zillowLow !== undefined ? { rangeLow: zillowLow } : {}),
      ...(zillowHigh !== undefined ? { rangeHigh: zillowHigh } : {}),
      ...(pmiNumber !== undefined ? { pointEstimate: pmiNumber } : {}),
      source: MANUAL_MARKET_COMP_SOURCE,
      confidence: "Likely",
    };
  }
}

export type MarketCompProviderKind = "manual" | "rentcast";

export interface MarketCompProviderConfig {
  /** Which adapter to build. Prod-fenced upstream; defaults to "manual" until the RentCast gate flips. */
  provider: MarketCompProviderKind;
  /** The operator's own entered numbers, for the manual pass-through. */
  basis?: RenewalMarketBasis;
  /** RentCast API key (env/Secret Manager only). Absent → the RentCast adapter fails closed. */
  rentcastApiKey?: string;
}

/**
 * Build the configured market-comp provider. Selection is prod-fenced by the caller (config), exactly like
 * createMaintenanceImageStore: the default is the manual adapter (works with no owner step), and the
 * RentCast adapter is chosen only when config selects it AND (in the route) its gate is open. The
 * `transport` option is injected in tests so no unit test makes a network call.
 */
export function createMarketCompProvider(
  config: MarketCompProviderConfig,
  options: { transport?: MarketCompTransport; nowIso?: () => string } = {},
): MarketCompProvider {
  if (config.provider === "rentcast") {
    return new RentCastMarketCompProvider({ apiKey: config.rentcastApiKey }, options);
  }
  return new ManualMarketCompProvider(config.basis);
}
