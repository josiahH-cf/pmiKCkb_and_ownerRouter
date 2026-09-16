import { describe, expect, it, vi } from "vitest";

import {
  STARTING_RANGE_LABEL,
  computeStartingRange,
  matchesStartingRange,
  startingRangeInputValue,
  startingRangePercent,
} from "@/lib/lease-renewal/market-starting-range";
import { RentCastMarketCompProvider } from "@/lib/lease-renewal/providers/rentcast-market-comp-provider";

describe("S118 starting range from current rent (accepted Q1A)", () => {
  it("AC-S118-1: applies 20% through $750, tapers to 15% at $2,500 and clamps beyond, with half-up cents", () => {
    const cases: Array<[number, number, number, number]> = [
      [500, 400, 600, 0.2],
      [750, 600, 900, 0.2],
      [1625, 1340.63, 1909.38, 0.175],
      [2500, 2125, 2875, 0.15],
      [3000, 2550, 3450, 0.15],
      [1234.56, 1004.74, 1464.38, (7750 - 1234.56) / 35000],
    ];
    for (const [rent, low, high, percent] of cases) {
      const band = computeStartingRange(rent);
      expect(band, String(rent)).toMatchObject({ status: "available", low, high });
      expect(band.status === "available" ? band.percent : NaN).toBeCloseTo(percent, 9);
      expect(startingRangePercent(rent)).toBeCloseTo(percent, 9);
    }
    // Below $750 and above $2,500 the percentage never keeps moving.
    expect(startingRangePercent(100)).toBe(0.2);
    expect(startingRangePercent(10_000)).toBe(0.15);
    expect(STARTING_RANGE_LABEL).toBe(
      "Starting range from current rent, not market evidence",
    );
  });

  it("AC-S118-1: a verified source-backed base rent carries its source path and keeps the cents it was read with", () => {
    const band = computeStartingRange({
      status: "verified",
      value: 999.99,
      sourcePath: "lease detail baseRentAmount",
    });
    expect(band).toEqual({
      status: "available",
      currentRent: 999.99,
      percent: (7750 - 999.99) / 35000,
      low: 807.13,
      high: 1192.85,
      sourcePath: "lease detail baseRentAmount",
    });
    expect(startingRangeInputValue(600)).toBe("600");
    expect(startingRangeInputValue(1340.63)).toBe("1340.63");
  });

  it("AC-S118-1: a missing, omitted, zero or negative base rent creates no authoritative band", () => {
    expect(
      computeStartingRange({
        status: "omitted",
        reason: "Contractual base rent is unavailable: no positive baseRentAmount.",
      }),
    ).toEqual({
      status: "unavailable",
      reason: "Contractual base rent is unavailable: no positive baseRentAmount.",
    });
    for (const rent of [
      0,
      -1200,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      null,
      undefined,
    ]) {
      const band = computeStartingRange(rent);
      expect(band.status, String(rent)).toBe("unavailable");
      expect(JSON.stringify(band)).not.toMatch(/\d{3}/);
    }
  });

  it("AC-S118-1: matching is exact to the cent, and provider comparables outside the band are never filtered", async () => {
    expect(matchesStartingRange({ low: 600, high: 900 }, 750)).toBe(true);
    expect(matchesStartingRange({ low: 600.01, high: 900 }, 750)).toBe(false);
    expect(matchesStartingRange({ low: 600, high: 900 }, undefined)).toBe(false);
    expect(matchesStartingRange({ low: 600 }, 750)).toBe(false);

    const get = vi.fn(async (url: string, headers: Record<string, string>) => {
      void url;
      void headers;
      return {
        status: 200,
        json: async () => ({
          rent: 1000,
          rentRangeLow: 400,
          rentRangeHigh: 3200,
          comparables: [{ price: 450 }, { price: 1000 }, { price: 3100 }],
        }),
      };
    });
    const result = await new RentCastMarketCompProvider(
      { apiKey: "fixture-key" },
      { transport: { get }, nowIso: () => "2026-09-16T12:00:00.000Z" },
    ).lookup({ addressLabel: "104 NE Lindsay Ave, Kansas City, MO 64118" });
    expect(result).toMatchObject({ rangeLow: 400, rangeHigh: 3200, compCount: 3 });
    expect(result.comparables?.map((comp) => comp.rent)).toEqual([450, 1000, 3100]);
    const url = String(get.mock.calls[0]?.[0]);
    expect(url).not.toMatch(/minRent|maxRent|rentRange/);
  });
});
