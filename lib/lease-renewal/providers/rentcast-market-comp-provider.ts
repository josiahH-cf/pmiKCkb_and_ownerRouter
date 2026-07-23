// RentCast rental-listings SEARCH adapter (S28b, built inert in S28a). Implements MarketCompProvider
// against RentCast's /listings/rental/long-term endpoint over an injected transport (mirroring
// ImageHttpTransport), with the API key read only from env/Secret Manager. Owner-confirmed 2026-07-23:
// RentCast has no usable rent-estimate endpoint, so the app aggregates the returned comparable listings
// deterministically — pointEstimate = MEDIAN of the comp rents, rangeLow/rangeHigh = min/max, compCount =
// the number of usable comps.
//
// FAILS CLOSED: any HTTP error, empty/invalid body, or fewer than MIN_COMP_COUNT usable comps maps to
// `confidence:"Needs Verification"` with NO numbers — never a fabricated figure. It is a READ:
// target-labeled, one-attempt, cost-bounded; there is no mutation to roll back. Built and wired but INERT
// until its Action Registry gate (rentcast.rental_listings.search) is flipped; the route refuses the live
// path with the closed-action response until then.

import type {
  MarketCompProvider,
  MarketCompQuery,
  MarketCompResult,
} from "@/lib/lease-renewal/market-comp-provider";

/** The RentCast attribution label carried onto the reference display + the owner-draft comp fact. */
export const RENTCAST_MARKET_COMP_SOURCE = "RentCast";

/** The Action Registry gate key for the live RentCast read (gated OFF until the key + flip land). */
export const RENTCAST_LISTINGS_ACTION_KEY = "rentcast.rental_listings.search";

/** RentCast's long-term rental listings search endpoint (documented; owner-confirmed 2026-07-23). */
export const RENTCAST_LISTINGS_URL =
  "https://api.rentcast.io/v1/listings/rental/long-term";

/** Minimum usable comps for a defensible set; below this the adapter fails closed to Needs Verification. */
export const MIN_COMP_COUNT = 3;

/** Default radius (miles) and result cap for the comparable search. */
const DEFAULT_RADIUS_MILES = 2;
const DEFAULT_LIMIT = 25;

export interface MarketCompHttpResponse {
  status: number;
  json(): Promise<unknown>;
}

/** The minimal read-only transport this adapter needs (mirrors ImageHttpTransport, GET-only). */
export interface MarketCompTransport {
  get(url: string, headers: Record<string, string>): Promise<MarketCompHttpResponse>;
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
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** The median of a non-empty numeric list (average of the two middle values for an even count). */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Extract the finite, strictly-positive rent figures from a RentCast listings payload. */
export function usableRents(payload: unknown): number[] {
  if (!Array.isArray(payload)) return [];
  const rents: number[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue;
    const price = (entry as Record<string, unknown>).price;
    if (typeof price === "number" && Number.isFinite(price) && price > 0) {
      rents.push(price);
    }
  }
  return rents;
}

/**
 * Aggregate RentCast comp rents into a display result. Fails closed (Needs Verification, no numbers) when
 * fewer than MIN_COMP_COUNT usable comps are present. Pure and deterministic — never invents a value.
 */
export function aggregateComps(
  rents: readonly number[],
  meta: { source: string; retrievedAt?: string },
): MarketCompResult {
  if (rents.length < MIN_COMP_COUNT) {
    return {
      source: meta.source,
      ...(meta.retrievedAt ? { retrievedAt: meta.retrievedAt } : {}),
      confidence: "Needs Verification",
    };
  }
  return {
    rangeLow: Math.min(...rents),
    rangeHigh: Math.max(...rents),
    pointEstimate: median(rents),
    compCount: rents.length,
    source: meta.source,
    ...(meta.retrievedAt ? { retrievedAt: meta.retrievedAt } : {}),
    confidence: "Likely",
  };
}

export interface RentCastProviderConfig {
  /** The RentCast API key, read only from env/Secret Manager. Absent → the adapter fails closed. */
  apiKey?: string;
  radiusMiles?: number;
  limit?: number;
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
    const failClosed: MarketCompResult = {
      source: RENTCAST_MARKET_COMP_SOURCE,
      retrievedAt,
      confidence: "Needs Verification",
    };
    const apiKey = this.config.apiKey?.trim();
    const address = query.addressLabel.trim();
    // Fail closed on a missing key or a blank address rather than making a doomed or unbounded call.
    if (!apiKey || address === "") return failClosed;

    try {
      const response = await this.transport.get(this.buildUrl(query, address), {
        "X-Api-Key": apiKey,
        accept: "application/json",
      });
      if (response.status < 200 || response.status >= 300) return failClosed;
      const payload = await response.json();
      return aggregateComps(usableRents(payload), {
        source: RENTCAST_MARKET_COMP_SOURCE,
        retrievedAt,
      });
    } catch {
      // Network/timeout/parse error → honest Needs Verification, never a fabricated range.
      return failClosed;
    }
  }

  private buildUrl(query: MarketCompQuery, address: string): string {
    const params = new URLSearchParams({
      address,
      radius: String(this.config.radiusMiles ?? DEFAULT_RADIUS_MILES),
      status: "Active",
      limit: String(this.config.limit ?? DEFAULT_LIMIT),
    });
    if (query.bedrooms !== undefined) params.set("bedrooms", String(query.bedrooms));
    if (query.bathrooms !== undefined) params.set("bathrooms", String(query.bathrooms));
    if (query.propertyType) params.set("propertyType", query.propertyType);
    return `${RENTCAST_LISTINGS_URL}?${params.toString()}`;
  }
}
