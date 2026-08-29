// S59 quota policy + cache primitives (pure halves of AC-S59-3/4/5/14).

import { beforeEach, describe, expect, it } from "vitest";

import { rentcastMonthKey } from "@/lib/firestore/rentcast-usage";
import {
  clearCompCacheForTests,
  compCacheKey,
  evaluateRentcastQuota,
  readCompCache,
  RENTCAST_COMP_CACHE_TTL_MS,
  RENTCAST_MONTHLY_ALLOWANCE_DEFAULT,
  resolveRentcastAllowance,
  writeCompCache,
} from "@/lib/lease-renewal/rentcast-quota";

beforeEach(clearCompCacheForTests);

describe("rentcastMonthKey", () => {
  it("keys by UTC month", () => {
    expect(rentcastMonthKey(Date.UTC(2026, 7, 6))).toBe("2026-08");
    expect(rentcastMonthKey(Date.UTC(2026, 11, 31, 23, 59))).toBe("2026-12");
    expect(rentcastMonthKey(Date.UTC(2027, 0, 1, 0, 0))).toBe("2027-01");
  });
});

describe("resolveRentcastAllowance", () => {
  it("defaults to the documented free-plan figure", () => {
    expect(resolveRentcastAllowance({})).toBe(RENTCAST_MONTHLY_ALLOWANCE_DEFAULT);
  });

  // AC-S59-14 companion: the account-confirmed figure is a config change, not a redesign.
  it("honors a positive integer env override and rejects garbage", () => {
    expect(resolveRentcastAllowance({ RENTCAST_MONTHLY_ALLOWANCE: "120" })).toBe(120);
    expect(resolveRentcastAllowance({ RENTCAST_MONTHLY_ALLOWANCE: "0" })).toBe(
      RENTCAST_MONTHLY_ALLOWANCE_DEFAULT,
    );
    expect(resolveRentcastAllowance({ RENTCAST_MONTHLY_ALLOWANCE: "-5" })).toBe(
      RENTCAST_MONTHLY_ALLOWANCE_DEFAULT,
    );
    expect(resolveRentcastAllowance({ RENTCAST_MONTHLY_ALLOWANCE: "lots" })).toBe(
      RENTCAST_MONTHLY_ALLOWANCE_DEFAULT,
    );
  });
});

describe("evaluateRentcastQuota", () => {
  it("reports used, remaining, and neither flag under the soft threshold", () => {
    expect(evaluateRentcastQuota(10, 50)).toEqual({
      used: 10,
      allowance: 50,
      remaining: 40,
      warn: false,
      exhausted: false,
    });
  });

  it("warns at the soft threshold and refuses at the allowance", () => {
    expect(evaluateRentcastQuota(40, 50).warn).toBe(true);
    expect(evaluateRentcastQuota(40, 50).exhausted).toBe(false);
    expect(evaluateRentcastQuota(50, 50).exhausted).toBe(true);
    expect(evaluateRentcastQuota(51, 50)).toMatchObject({
      remaining: 0,
      exhausted: true,
    });
  });
});

describe("comp cache", () => {
  it("keys on normalized address plus the attributes that shape the query", () => {
    expect(compCacheKey({ address: "  104 NE  Lindsay Ave ", bedrooms: 3 })).toBe(
      compCacheKey({ address: "104 ne lindsay ave", bedrooms: 3 }),
    );
    expect(compCacheKey({ address: "104 NE Lindsay Ave", bedrooms: 3 })).not.toBe(
      compCacheKey({ address: "104 NE Lindsay Ave", bedrooms: 2 }),
    );
  });

  it("cannot collide when any S59 provider-shaping field changes", () => {
    const base = {
      address: "104 NE Lindsay Ave",
      bedrooms: 3,
      bathrooms: 2,
      squareFootage: 1450,
      propertyType: "Single Family",
      maxRadiusMiles: 2,
      requestedCompCount: 15,
      lookupSubjectAttributes: true,
      providerVersion: "rentcast-avm-long-term-v1",
    };
    const variants = [
      { ...base, address: "105 NE Lindsay Ave" },
      { ...base, bedrooms: 2 },
      { ...base, bathrooms: 1.5 },
      { ...base, squareFootage: 1600 },
      { ...base, propertyType: "Condo" },
      { ...base, maxRadiusMiles: 1.5 },
      { ...base, requestedCompCount: 10 },
      { ...base, lookupSubjectAttributes: false },
      { ...base, providerVersion: "rentcast-avm-long-term-v2" },
    ];

    for (const variant of variants) {
      expect(compCacheKey(base)).not.toBe(compCacheKey(variant));
    }
  });

  it("serves inside the TTL and expires after it", () => {
    const key = compCacheKey({ address: "104 NE Lindsay Ave" });
    writeCompCache(key, { marker: 1 }, 1_000);
    expect(readCompCache(key, 1_000 + RENTCAST_COMP_CACHE_TTL_MS - 1)).toEqual({
      marker: 1,
    });
    expect(readCompCache(key, 1_000 + RENTCAST_COMP_CACHE_TTL_MS)).toBeUndefined();
  });
});
