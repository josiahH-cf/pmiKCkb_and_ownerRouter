// RentCast AVM rent-estimate adapter (S28 seam, S59 activation). Implements MarketCompProvider
// against RentCast's /avm/rent/long-term endpoint over an injected transport, with the API key read
// only from env/Secret Manager.
//
// S59 switched the comp basis from raw /listings/rental/long-term aggregation to the AVM endpoint
// (researched 2026-08-06, `F-RENTCAST-API-CONTRACT`): the provider returns its OWN `rent`,
// `rentRangeLow`, and `rentRangeHigh`, plus `comparables[]` sorted by a 0-to-1 `correlation` score
// descending. Computing our own median over raw listings was reimplementing RentCast's model, badly.
// Comparables are retained in provider order with correlation intact so an operator can see how
// similar each comp actually is.
//
// FAILS CLOSED and LEGIBLY: every failure maps to `confidence:"Needs Verification"` with NO numbers
// and a DISTINGUISHABLE `reason` — missing_key, missing_address, timeout, network_error,
// http_error, parse_error, too_few_comps. A timeout is reported as a timeout, never as "no comps
// found", and no failure ever renders as a range. It is a READ: one-attempt, cost-bounded, no
// mutation. INERT until its Action Registry gate (rentcast.rental_listings.search) is flipped by
// the reviewed D12 patch; the route refuses the live path with the closed-action response until
// then.

import type {
  MarketCompProvider,
  MarketCompQuery,
  MarketCompResult,
  MarketComparable,
} from "@/lib/lease-renewal/market-comp-provider";

/** The RentCast attribution label carried onto the reference display + the owner-draft comp fact. */
export const RENTCAST_MARKET_COMP_SOURCE = "RentCast";

/** The Action Registry gate key for the live RentCast read (gated OFF until the reviewed flip). */
export const RENTCAST_LISTINGS_ACTION_KEY = "rentcast.rental_listings.search";

/** RentCast's AVM long-term rent estimate endpoint — the comp basis since S59 (AC-S59-15). */
export const RENTCAST_AVM_URL = "https://api.rentcast.io/v1/avm/rent/long-term";

/** RentCast's aggregate market-statistics endpoint — the historical trend source (AC-S59-18). */
export const RENTCAST_MARKETS_URL = "https://api.rentcast.io/v1/markets";

/** Minimum usable comps for a defensible set; below this the adapter fails closed (retained floor). */
export const MIN_COMP_COUNT = 3;

/** Explicit query defaults (AC-S59-16): never rely on the provider's implicit search shape. */
export const DEFAULT_MAX_RADIUS_MILES = 2;
export const DEFAULT_COMP_COUNT = 15;
/** Months of rental history requested from /markets (available from April 2020). */
export const DEFAULT_TREND_HISTORY_MONTHS = 24;

export interface MarketCompHttpResponse {
  status: number;
  json(): Promise<unknown>;
}

/** The minimal read-only transport this adapter needs (GET-only). */
export interface MarketCompTransport {
  get(url: string, headers: Record<string, string>): Promise<MarketCompHttpResponse>;
}

/** Thrown by the fetch transport on an aborted request so timeouts classify as timeouts. */
export class MarketCompTimeoutError extends Error {
  constructor() {
    super("The RentCast request timed out.");
    this.name = "MarketCompTimeoutError";
  }
}

function createFetchTransport(timeoutMs = 15_000): MarketCompTransport {
  return {
    async get(url, headers) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
        const text = await response.text();
        return {
          status: response.status,
          json: async () => JSON.parse(text) as unknown,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new MarketCompTimeoutError();
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function finitePositive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function finiteInRange(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : undefined;
}

/** Parse the AVM payload's comparables, keeping PROVIDER ORDER and correlation (AC-S59-17). */
export function parseComparables(payload: unknown): MarketComparable[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as Record<string, unknown>).comparables;
  if (!Array.isArray(raw)) return [];
  const comparables: MarketComparable[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const rent = finitePositive(record.price);
    if (rent === undefined) continue;
    const correlation = finiteInRange(record.correlation, 0, 1);
    comparables.push({
      rent,
      ...(correlation !== undefined ? { correlation } : {}),
      ...(finitePositive(record.distance) !== undefined
        ? { distanceMiles: finitePositive(record.distance) }
        : {}),
      ...(finitePositive(record.bedrooms) !== undefined
        ? { bedrooms: finitePositive(record.bedrooms) }
        : {}),
      ...(finitePositive(record.bathrooms) !== undefined
        ? { bathrooms: finitePositive(record.bathrooms) }
        : {}),
      ...(finitePositive(record.daysOnMarket) !== undefined
        ? { daysOnMarket: finitePositive(record.daysOnMarket) }
        : {}),
    });
  }
  return comparables;
}

export interface RentCastProviderConfig {
  /** The RentCast API key, read only from env/Secret Manager. Absent → the adapter fails closed. */
  apiKey?: string;
  maxRadiusMiles?: number;
  compCount?: number;
}

/** Month-keyed rental history from /markets (AC-S59-18). Values pass through unmodified. */
export interface MarketTrendResult {
  source: string;
  retrievedAt?: string;
  zipCode?: string;
  /** Keyed YYYY-MM; each month carries RentCast's own aggregate fields, untouched. */
  history?: Record<string, unknown>;
  confidence: "Likely" | "Needs Verification";
  reason?: MarketCompResult["reason"];
  /** Present on an http_error refusal: the observed status code. */
  httpStatus?: number;
  /** True when a billable (2xx) RentCast response was received for this lookup. */
  billed?: boolean;
}

export class RentCastMarketCompProvider implements MarketCompProvider {
  private readonly transport: MarketCompTransport;
  private readonly nowIso: () => string;

  constructor(
    private readonly config: RentCastProviderConfig,
    options: { transport?: MarketCompTransport; nowIso?: () => string } = {},
  ) {
    this.transport = options.transport ?? createFetchTransport();
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
  }

  async lookup(query: MarketCompQuery): Promise<MarketCompResult> {
    const retrievedAt = this.nowIso();
    const failClosed = (
      reason: NonNullable<MarketCompResult["reason"]>,
      billed = false,
    ): MarketCompResult => ({
      source: RENTCAST_MARKET_COMP_SOURCE,
      retrievedAt,
      confidence: "Needs Verification",
      reason,
      ...(billed ? { billed } : {}),
    });

    const apiKey = this.config.apiKey?.trim();
    if (!apiKey) return failClosed("missing_key");
    const address = query.addressLabel.trim();
    if (address === "") return failClosed("missing_address");

    let response: MarketCompHttpResponse;
    try {
      response = await this.transport.get(this.buildAvmUrl(query, address), {
        "X-Api-Key": apiKey,
        accept: "application/json",
      });
    } catch (error) {
      return failClosed(
        error instanceof MarketCompTimeoutError ? "timeout" : "network_error",
      );
    }
    if (response.status < 200 || response.status >= 300) {
      return { ...failClosed("http_error"), httpStatus: response.status };
    }
    // From here the call is BILLED (one 2xx response with a body is one billable request), even
    // when the payload fails closed — the counter must reflect what RentCast charges.
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return failClosed("parse_error", true);
    }
    if (!payload || typeof payload !== "object") {
      return failClosed("parse_error", true);
    }
    const body = payload as Record<string, unknown>;
    const rent = finitePositive(body.rent);
    const rangeLow = finitePositive(body.rentRangeLow);
    const rangeHigh = finitePositive(body.rentRangeHigh);
    const comparables = parseComparables(payload);
    if (
      rent === undefined ||
      rangeLow === undefined ||
      rangeHigh === undefined ||
      comparables.length < MIN_COMP_COUNT
    ) {
      return failClosed("too_few_comps", true);
    }
    // AC-S59-15: the persisted range is the provider's own; the point estimate is its `rent`.
    return {
      rangeLow,
      rangeHigh,
      pointEstimate: rent,
      compCount: comparables.length,
      comparables,
      source: RENTCAST_MARKET_COMP_SOURCE,
      retrievedAt,
      confidence: "Likely",
      billed: true,
    };
  }

  /**
   * One /markets trend lookup for a zip (AC-S59-18). A SEPARATE billable request; the caller
   * meters it separately. History is returned month-keyed and untouched.
   */
  async lookupTrend(
    zipCode: string,
    historyMonths: number = DEFAULT_TREND_HISTORY_MONTHS,
  ): Promise<MarketTrendResult> {
    const retrievedAt = this.nowIso();
    const failClosed = (
      reason: NonNullable<MarketCompResult["reason"]>,
      billed = false,
    ): MarketTrendResult => ({
      source: RENTCAST_MARKET_COMP_SOURCE,
      retrievedAt,
      confidence: "Needs Verification",
      reason,
      ...(billed ? { billed } : {}),
    });

    const apiKey = this.config.apiKey?.trim();
    if (!apiKey) return failClosed("missing_key");
    const zip = zipCode.trim();
    if (!/^\d{5}$/.test(zip)) return failClosed("missing_address");

    const params = new URLSearchParams({
      zipCode: zip,
      dataType: "Rental",
      historyRange: String(historyMonths),
    });
    let response: MarketCompHttpResponse;
    try {
      response = await this.transport.get(
        `${RENTCAST_MARKETS_URL}?${params.toString()}`,
        {
          "X-Api-Key": apiKey,
          accept: "application/json",
        },
      );
    } catch (error) {
      return failClosed(
        error instanceof MarketCompTimeoutError ? "timeout" : "network_error",
      );
    }
    if (response.status < 200 || response.status >= 300) {
      return { ...failClosed("http_error"), httpStatus: response.status };
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return failClosed("parse_error", true);
    }
    if (!payload || typeof payload !== "object") {
      return failClosed("parse_error", true);
    }
    // The month-keyed history sits either at the top level or under `rentalData` depending on the
    // response variant; accept both and fail closed otherwise. The controlled live smoke confirms
    // the real shape before any gate flip.
    const body = payload as Record<string, unknown>;
    const rentalData =
      body.rentalData && typeof body.rentalData === "object"
        ? (body.rentalData as Record<string, unknown>)
        : undefined;
    const history =
      body.history && typeof body.history === "object"
        ? body.history
        : rentalData?.history && typeof rentalData.history === "object"
          ? rentalData.history
          : undefined;
    if (!history) {
      return failClosed("parse_error", true);
    }
    return {
      source: RENTCAST_MARKET_COMP_SOURCE,
      retrievedAt,
      zipCode: zip,
      history: history as Record<string, unknown>,
      confidence: "Likely",
      billed: true,
    };
  }

  /** AC-S59-16: every request carries the known unit attributes plus explicit radius + compCount. */
  private buildAvmUrl(query: MarketCompQuery, address: string): string {
    const params = new URLSearchParams({
      address,
      maxRadius: String(this.config.maxRadiusMiles ?? DEFAULT_MAX_RADIUS_MILES),
      compCount: String(this.config.compCount ?? DEFAULT_COMP_COUNT),
    });
    if (query.bedrooms !== undefined) params.set("bedrooms", String(query.bedrooms));
    if (query.bathrooms !== undefined) params.set("bathrooms", String(query.bathrooms));
    if (query.squareFootage !== undefined) {
      params.set("squareFootage", String(query.squareFootage));
    }
    if (query.propertyType) params.set("propertyType", query.propertyType);
    return `${RENTCAST_AVM_URL}?${params.toString()}`;
  }
}
