// Market-comp PROVIDER seam (S28a). A pluggable abstraction for a comparable-rent range shown as
// REFERENCE ONLY next to the owner-decision form. It NEVER fills or moves the offered-rent number (that
// stays the operator's decision; the comp-derived SUGGESTED number is the separate Admin-approval-gated
// S29). Absent data yields `confidence:"Needs Verification"` with no numbers — never a fabricated value,
// preserving the no-invented-number invariant (F-NEGOTIATION-EXCLUDED until S29, then S29's gate).
//
// Two adapters implement the same interface: ManualMarketCompProvider reproduces exactly today's
// operator-typed behavior with no network call (the default, works day one with no owner step), and the
// RentCastMarketCompProvider (built behind this interface and governed by its exact read key) queries
// the licensed rental-listings search API. Selecting the adapter is prod-fenced by config exactly like
// createMaintenanceImageStore. External data is limited to the complete property address plus
// supported non-identifying property attributes (D07/D08 boundary); never tenant PII or rent.

import type { RenewalMarketBasis } from "@/lib/lease-renewal/renewal-progress";
import {
  RentCastMarketCompProvider,
  type MarketCompTransport,
} from "@/lib/lease-renewal/providers/rentcast-market-comp-provider";

/** In-boundary comp query: address plus supported property attributes; no tenant PII or rent. */
export interface MarketCompQuery {
  /** The property address label (in-boundary; never written to git). */
  addressLabel: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  propertyType?: string;
}

/**
 * S59: every refusal names why, so a timeout never renders as "no comps found" and each failure is
 * distinguishable in the UI. None of these ever comes with numbers.
 */
export type MarketCompFailureReason =
  | "missing_key"
  | "missing_address"
  | "timeout"
  | "network_error"
  | "http_error"
  | "parse_error"
  | "too_few_comps"
  | "out_of_allowance"
  | "provider_not_live";

/** One comparable, retained in PROVIDER order with its correlation intact (AC-S59-17). */
export interface MarketComparable {
  rent: number;
  /** RentCast's 0-to-1 similarity score; higher is more similar. */
  correlation?: number;
  distanceMiles?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  listedDate?: string;
  lastSeenDate?: string;
  daysOld?: number;
  daysOnMarket?: number;
}

/** Provider-returned subject attributes, kept separate from authoritative values sent by PMI KC. */
export interface MarketCompSubjectProperty {
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
}

/** A DISPLAY-only comparable-rent result. Any numeric field is optional; absent → Needs Verification. */
export interface MarketCompResult {
  rangeLow?: number;
  rangeHigh?: number;
  /** The point estimate (RentCast: the provider's own AVM `rent`; Manual: the operator's PMI number). */
  pointEstimate?: number;
  /** How many comparable listings backed the result (RentCast only). */
  compCount?: number;
  /** The comparables themselves, provider-ordered with correlation (RentCast only). */
  comparables?: MarketComparable[];
  /** RentCast's returned subject attributes; never relabeled as RentVine source truth. */
  subjectProperty?: MarketCompSubjectProperty;
  /** Attribution shown on the reference display and carried onto the owner-draft comp fact. */
  source: string;
  /** ISO timestamp the result was retrieved (RentCast receipt); omitted for the manual echo. */
  retrievedAt?: string;
  confidence: "Likely" | "Needs Verification";
  /** Present on a refusal: the legible, distinguishable cause (AC-S59-8). */
  reason?: MarketCompFailureReason;
  /** Present on an http_error refusal: the observed status code (a 400 is not a 401). */
  httpStatus?: number;
  /** True when a billable (2xx-with-body) RentCast call was made; the usage counter keys on this. */
  billed?: boolean;
}

export interface MarketCompProvider {
  lookup(query: MarketCompQuery): Promise<MarketCompResult>;
}

/** The attribution label the manual pass-through wears. */
export const MANUAL_MARKET_COMP_SOURCE = "Manual entry";

/**
 * The manual adapter: passes the operator's OWN entered comp numbers straight through as a result, with
 * NO network call and no synthesis. Given any operator-typed range or PMI number it returns
 * exactly those (source "Manual entry", confidence "Likely"); given nothing it returns a numberless
 * "Needs Verification" result. It never invents a value (D19 / F-NEGOTIATION-EXCLUDED).
 */
export class ManualMarketCompProvider implements MarketCompProvider {
  constructor(private readonly basis: RenewalMarketBasis = {}) {}

  async lookup(_query: MarketCompQuery): Promise<MarketCompResult> {
    void _query;
    const { rangeLow, rangeHigh, pmiNumber } = this.basis;
    const hasAny =
      rangeLow !== undefined || rangeHigh !== undefined || pmiNumber !== undefined;
    if (!hasAny) {
      return { source: MANUAL_MARKET_COMP_SOURCE, confidence: "Needs Verification" };
    }
    return {
      ...(rangeLow !== undefined ? { rangeLow } : {}),
      ...(rangeHigh !== undefined ? { rangeHigh } : {}),
      ...(pmiNumber !== undefined ? { pointEstimate: pmiNumber } : {}),
      source: MANUAL_MARKET_COMP_SOURCE,
      confidence: "Likely",
    };
  }
}

export type MarketCompProviderKind = "manual" | "rentcast";

export interface MarketCompProviderConfig {
  /** Which adapter to build. Prod-fenced upstream and still checked against the exact action key. */
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
