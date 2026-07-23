import { describe, expect, it } from "vitest";

import {
  ManualMarketCompProvider,
  MANUAL_MARKET_COMP_SOURCE,
  createMarketCompProvider,
} from "@/lib/lease-renewal/market-comp-provider";
import { RentCastMarketCompProvider } from "@/lib/lease-renewal/providers/rentcast-market-comp-provider";

const QUERY = { addressLabel: "104 NE Lindsay Ave" };

describe("ManualMarketCompProvider (AC-S28-1)", () => {
  it("passes the operator's own entered numbers straight through, tagged Manual entry / Likely", async () => {
    const provider = new ManualMarketCompProvider({
      zillowLow: 1450,
      zillowHigh: 1600,
      pmiNumber: 1550,
    });
    expect(await provider.lookup(QUERY)).toEqual({
      rangeLow: 1450,
      rangeHigh: 1600,
      pointEstimate: 1550,
      source: MANUAL_MARKET_COMP_SOURCE,
      confidence: "Likely",
    });
  });

  it("carries only the fields the operator entered (never synthesizes the others)", async () => {
    const provider = new ManualMarketCompProvider({ zillowLow: 1450 });
    expect(await provider.lookup(QUERY)).toEqual({
      rangeLow: 1450,
      source: MANUAL_MARKET_COMP_SOURCE,
      confidence: "Likely",
    });
  });

  it("returns a numberless Needs Verification result when nothing was entered (no invented value)", async () => {
    const provider = new ManualMarketCompProvider({});
    const result = await provider.lookup(QUERY);
    expect(result).toEqual({
      source: MANUAL_MARKET_COMP_SOURCE,
      confidence: "Needs Verification",
    });
    expect(result.rangeLow).toBeUndefined();
    expect(result.rangeHigh).toBeUndefined();
    expect(result.pointEstimate).toBeUndefined();
  });

  it("makes no network call — the default provider has no transport dependency", async () => {
    // Constructed with no options at all; a lookup resolves purely from the basis.
    const provider = new ManualMarketCompProvider({ pmiNumber: 1500 });
    await expect(provider.lookup(QUERY)).resolves.toMatchObject({ pointEstimate: 1500 });
  });
});

describe("createMarketCompProvider factory", () => {
  it("builds the manual adapter by default (works with no owner step)", () => {
    expect(
      createMarketCompProvider({ provider: "manual", basis: { pmiNumber: 1 } }),
    ).toBeInstanceOf(ManualMarketCompProvider);
  });

  it("builds the RentCast adapter when selected (still inert until its gate flips)", () => {
    expect(
      createMarketCompProvider({ provider: "rentcast", rentcastApiKey: "k" }),
    ).toBeInstanceOf(RentCastMarketCompProvider);
  });
});
