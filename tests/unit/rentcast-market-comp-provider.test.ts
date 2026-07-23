import { describe, expect, it, vi } from "vitest";

import {
  MIN_COMP_COUNT,
  RENTCAST_LISTINGS_URL,
  RentCastMarketCompProvider,
  aggregateComps,
  median,
  usableRents,
  type MarketCompTransport,
} from "@/lib/lease-renewal/providers/rentcast-market-comp-provider";

const NOW = "2026-07-23T00:00:00.000Z";
const QUERY = { addressLabel: "104 NE Lindsay Ave", bedrooms: 3, bathrooms: 2 };

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

describe("median / usableRents / aggregateComps", () => {
  it("computes an odd- and even-length median", () => {
    expect(median([1500, 1400, 1600])).toBe(1500);
    expect(median([1400, 1600])).toBe(1500);
  });

  it("keeps only finite, strictly-positive price fields", () => {
    expect(
      usableRents([
        { price: 1500 },
        { price: 0 },
        { price: -1 },
        { price: "1700" },
        { notPrice: 1 },
        null,
        { price: 1600 },
      ]),
    ).toEqual([1500, 1600]);
    expect(usableRents("not-an-array")).toEqual([]);
  });

  it("aggregates >= MIN_COMP_COUNT comps into median + min/max + count (Likely)", () => {
    const rents = [1400, 1500, 1600, 1700];
    expect(aggregateComps(rents, { source: "RentCast", retrievedAt: NOW })).toEqual({
      rangeLow: 1400,
      rangeHigh: 1700,
      pointEstimate: 1550,
      compCount: 4,
      source: "RentCast",
      retrievedAt: NOW,
      confidence: "Likely",
    });
  });

  it("fails closed (Needs Verification, no numbers) below the minimum comp count", () => {
    const tooFew = Array.from({ length: MIN_COMP_COUNT - 1 }, (_, i) => 1500 + i);
    const result = aggregateComps(tooFew, { source: "RentCast", retrievedAt: NOW });
    expect(result).toEqual({
      source: "RentCast",
      retrievedAt: NOW,
      confidence: "Needs Verification",
    });
    expect(result.rangeLow).toBeUndefined();
    expect(result.pointEstimate).toBeUndefined();
  });
});

describe("RentCastMarketCompProvider.lookup (AC-S28-5, AC-S28-6)", () => {
  it("queries the documented listings endpoint with the key header and aggregates the comps", async () => {
    const { transport, get } = stubTransport({
      status: 200,
      body: [{ price: 1400 }, { price: 1500 }, { price: 1600 }],
    });
    const provider = new RentCastMarketCompProvider(
      { apiKey: "secret-key" },
      { transport, nowIso: () => NOW },
    );
    const result = await provider.lookup(QUERY);

    expect(result).toMatchObject({
      rangeLow: 1400,
      rangeHigh: 1600,
      pointEstimate: 1500,
      compCount: 3,
      source: "RentCast",
      confidence: "Likely",
    });
    const [url, headers] = get.mock.calls[0]!;
    expect(url.startsWith(RENTCAST_LISTINGS_URL)).toBe(true);
    // URLSearchParams form-encodes spaces as "+".
    expect(url).toContain("address=104+NE+Lindsay+Ave");
    expect(url).toContain("bedrooms=3");
    expect(headers["X-Api-Key"]).toBe("secret-key");
  });

  it("fails closed on an HTTP error (no fabricated numbers)", async () => {
    const { transport } = stubTransport({ status: 429, body: { error: "rate limited" } });
    const provider = new RentCastMarketCompProvider(
      { apiKey: "k" },
      { transport, nowIso: () => NOW },
    );
    expect(await provider.lookup(QUERY)).toEqual({
      source: "RentCast",
      retrievedAt: NOW,
      confidence: "Needs Verification",
    });
  });

  it("fails closed on an empty comp set", async () => {
    const { transport } = stubTransport({ status: 200, body: [] });
    const provider = new RentCastMarketCompProvider(
      { apiKey: "k" },
      { transport, nowIso: () => NOW },
    );
    expect(await provider.lookup(QUERY)).toMatchObject({
      confidence: "Needs Verification",
    });
  });

  it("fails closed WITHOUT any network call when the API key is absent", async () => {
    const { transport, get } = stubTransport({ status: 200, body: [{ price: 1500 }] });
    const provider = new RentCastMarketCompProvider({}, { transport, nowIso: () => NOW });
    expect(await provider.lookup(QUERY)).toMatchObject({
      confidence: "Needs Verification",
    });
    expect(get).not.toHaveBeenCalled();
  });
});
