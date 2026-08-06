// S59: the AVM-based adapter. The comp basis is the provider's OWN rent + range (AC-S59-15), every
// request carries the known unit attributes plus explicit maxRadius and compCount (AC-S59-16),
// comparables keep provider order with correlation intact (AC-S59-17), and every failure is
// distinguishable and numberless (AC-S59-8).

import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_COMP_COUNT,
  DEFAULT_MAX_RADIUS_MILES,
  MarketCompTimeoutError,
  MIN_COMP_COUNT,
  parseComparables,
  RENTCAST_AVM_URL,
  RENTCAST_MARKETS_URL,
  RentCastMarketCompProvider,
  type MarketCompTransport,
} from "@/lib/lease-renewal/providers/rentcast-market-comp-provider";

const NOW = "2026-08-06T00:00:00.000Z";
const QUERY = {
  addressLabel: "104 NE Lindsay Ave",
  bedrooms: 3,
  bathrooms: 2,
  squareFootage: 1450,
};

const AVM_BODY = {
  rent: 1550,
  rentRangeLow: 1450,
  rentRangeHigh: 1650,
  comparables: [
    { price: 1600, correlation: 0.97, distance: 0.4, bedrooms: 3, bathrooms: 2 },
    { price: 1500, correlation: 0.93, distance: 0.9 },
    { price: 1525, correlation: 0.88, daysOnMarket: 12 },
  ],
};

function stubTransport(response: { status: number; body: unknown }): {
  transport: MarketCompTransport;
  get: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn(async (_url: string, _headers: Record<string, string>) => ({
    status: response.status,
    json: async () => response.body,
  }));
  return { transport: { get }, get };
}

function provider(
  transport: MarketCompTransport,
  config: { apiKey?: string } = { apiKey: "secret-key" },
) {
  return new RentCastMarketCompProvider(config, { transport, nowIso: () => NOW });
}

describe("parseComparables", () => {
  it("keeps provider order and correlation, dropping entries without a usable price", () => {
    const comps = parseComparables({
      comparables: [
        { price: 1600, correlation: 0.97 },
        { price: 0 },
        { notPrice: 1 },
        { price: 1500, correlation: 0.9 },
      ],
    });
    expect(comps).toEqual([
      { rent: 1600, correlation: 0.97 },
      { rent: 1500, correlation: 0.9 },
    ]);
  });

  it("returns empty for a payload without a comparables array", () => {
    expect(parseComparables({})).toEqual([]);
    expect(parseComparables(null)).toEqual([]);
  });
});

describe("RentCastMarketCompProvider.lookup (AVM comp basis)", () => {
  it("uses the provider's own rent + range and keeps ordered comparables (AC-S59-15/17)", async () => {
    const { transport, get } = stubTransport({ status: 200, body: AVM_BODY });
    const result = await provider(transport).lookup(QUERY);

    expect(result).toMatchObject({
      rangeLow: 1450,
      rangeHigh: 1650,
      pointEstimate: 1550,
      compCount: 3,
      source: "RentCast",
      confidence: "Likely",
      billed: true,
    });
    expect(result.comparables?.map((c) => c.correlation)).toEqual([0.97, 0.93, 0.88]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("sends the unit attributes plus explicit maxRadius and compCount (AC-S59-16)", async () => {
    const { transport, get } = stubTransport({ status: 200, body: AVM_BODY });
    await provider(transport).lookup(QUERY);
    const [url, headers] = get.mock.calls[0]!;
    expect(url.startsWith(RENTCAST_AVM_URL)).toBe(true);
    expect(url).toContain("address=104+NE+Lindsay+Ave");
    expect(url).toContain("bedrooms=3");
    expect(url).toContain("bathrooms=2");
    expect(url).toContain("squareFootage=1450");
    expect(url).toContain(`maxRadius=${DEFAULT_MAX_RADIUS_MILES}`);
    expect(url).toContain(`compCount=${DEFAULT_COMP_COUNT}`);
    expect(headers["X-Api-Key"]).toBe("secret-key");
  });

  it("fails closed missing_key with no network call", async () => {
    const { transport, get } = stubTransport({ status: 200, body: AVM_BODY });
    const result = await provider(transport, {}).lookup(QUERY);
    expect(result).toMatchObject({
      confidence: "Needs Verification",
      reason: "missing_key",
    });
    expect(result.rangeLow).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it("fails closed missing_address with no network call", async () => {
    const { transport, get } = stubTransport({ status: 200, body: AVM_BODY });
    const result = await provider(transport).lookup({ addressLabel: "   " });
    expect(result).toMatchObject({ reason: "missing_address" });
    expect(get).not.toHaveBeenCalled();
  });

  it("classifies a timeout as a timeout, not as no-comps (AC-S59-8)", async () => {
    const get = vi.fn(async () => {
      throw new MarketCompTimeoutError();
    });
    const result = await provider({ get }).lookup(QUERY);
    expect(result).toMatchObject({
      confidence: "Needs Verification",
      reason: "timeout",
    });
    expect(result.billed).toBeUndefined();
  });

  it("classifies a network failure distinctly from a timeout", async () => {
    const get = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    const result = await provider({ get }).lookup(QUERY);
    expect(result).toMatchObject({ reason: "network_error" });
  });

  it("fails closed http_error on a non-2xx, unbilled", async () => {
    const { transport } = stubTransport({ status: 429, body: { error: "rate limited" } });
    const result = await provider(transport).lookup(QUERY);
    expect(result).toMatchObject({ reason: "http_error" });
    expect(result.billed).toBeUndefined();
    expect(result.rangeLow).toBeUndefined();
  });

  it("fails closed parse_error on an unreadable body, BILLED (a 2xx was received)", async () => {
    const get = vi.fn(async () => ({
      status: 200,
      json: async () => {
        throw new Error("bad json");
      },
    }));
    const result = await provider({ get }).lookup(QUERY);
    expect(result).toMatchObject({ reason: "parse_error", billed: true });
  });

  it("fails closed too_few_comps below the floor, BILLED, never a range", async () => {
    const { transport } = stubTransport({
      status: 200,
      body: {
        ...AVM_BODY,
        comparables: AVM_BODY.comparables.slice(0, MIN_COMP_COUNT - 1),
      },
    });
    const result = await provider(transport).lookup(QUERY);
    expect(result).toMatchObject({ reason: "too_few_comps", billed: true });
    expect(result.rangeLow).toBeUndefined();
    expect(result.pointEstimate).toBeUndefined();
  });
});

describe("RentCastMarketCompProvider.lookupTrend (AC-S59-18)", () => {
  const HISTORY = { "2026-07": { averageRent: 1500 }, "2026-06": { averageRent: 1480 } };

  it("calls /markets once with dataType=Rental and historyRange, history intact", async () => {
    const { transport, get } = stubTransport({
      status: 200,
      body: { history: HISTORY },
    });
    const result = await provider(transport).lookupTrend("64118");
    expect(result).toMatchObject({
      zipCode: "64118",
      confidence: "Likely",
      billed: true,
    });
    expect(result.history).toEqual(HISTORY);
    expect(get).toHaveBeenCalledTimes(1);
    const [url] = get.mock.calls[0]!;
    expect(url.startsWith(RENTCAST_MARKETS_URL)).toBe(true);
    expect(url).toContain("zipCode=64118");
    expect(url).toContain("dataType=Rental");
    expect(url).toContain("historyRange=");
  });

  it("accepts the rentalData-nested history variant", async () => {
    const { transport } = stubTransport({
      status: 200,
      body: { rentalData: { history: HISTORY } },
    });
    const result = await provider(transport).lookupTrend("64118");
    expect(result.history).toEqual(HISTORY);
  });

  it("refuses a non-5-digit zip locally with no call", async () => {
    const { transport, get } = stubTransport({ status: 200, body: {} });
    const result = await provider(transport).lookupTrend("ABC12");
    expect(result).toMatchObject({ reason: "missing_address" });
    expect(get).not.toHaveBeenCalled();
  });

  it("fails closed parse_error when no history is present, BILLED", async () => {
    const { transport } = stubTransport({ status: 200, body: { unrelated: true } });
    const result = await provider(transport).lookupTrend("64118");
    expect(result).toMatchObject({ reason: "parse_error", billed: true });
  });
});
