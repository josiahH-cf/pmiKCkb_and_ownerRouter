import { describe, expect, it } from "vitest";

import { decodeLegacyManualMarketBasis } from "@/lib/lease-renewal/legacy-market-basis";

describe("bounded legacy market-basis decoder (AC-S28-7 / AC-S60-11)", () => {
  it("maps valid historical numeric aliases to neutral manual facts and drops the URL", () => {
    const decoded = decodeLegacyManualMarketBasis({
      zillowLow: 1450,
      zillowHigh: 1600,
      compsUrl: "https://www.zillow.com/homes/legacy-only/",
    });

    expect(decoded).toEqual({
      rangeLow: 1450,
      rangeHigh: 1600,
      invalid: false,
      ignoredUrlPresent: true,
    });
    expect(JSON.stringify(decoded)).not.toContain("legacy-only");
  });

  it("accepts the historical persisted snake-case aliases without exposing their names", () => {
    const decoded = decodeLegacyManualMarketBasis({
      zillow_low: 1400,
      zillow_high: 1500,
      comps_url: "https://www.zillow.com/homes/ignored/",
    });
    expect(decoded.rangeLow).toBe(1400);
    expect(decoded.rangeHigh).toBe(1500);
    expect(Object.keys(decoded)).not.toContain("comps_url");
  });

  it.each([
    { zillowLow: "1450" },
    { zillowHigh: Number.NaN },
    { zillowLow: -1 },
    { zillowLow: 1700, zillowHigh: 1500 },
  ])("refuses malformed historical values instead of coercing them", (record) => {
    expect(decodeLegacyManualMarketBasis(record)).toMatchObject({ invalid: true });
    expect(decodeLegacyManualMarketBasis(record).rangeLow).toBeUndefined();
    expect(decodeLegacyManualMarketBasis(record).rangeHigh).toBeUndefined();
  });
});
