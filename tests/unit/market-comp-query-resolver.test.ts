import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  config: { current: { ok: true, rentvineClient: {} } as unknown },
  result: {
    current: {
      snapshot: { views: [], complete: true, readAtMs: 1_000 },
      currency: {
        state: "fresh",
        ageMs: 0,
        readAtMs: 1_000,
        refreshing: false,
        lastError: false,
      },
    } as unknown,
  },
}));

vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRentVineConfig: vi.fn(() => harness.config.current),
}));

vi.mock("@/lib/lease-renewal/live-lease-cache", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/lease-renewal/live-lease-cache")>();
  return {
    ...actual,
    getLiveLeaseSnapshot: vi.fn(async () => harness.result.current),
  };
});

import type { RawLease } from "@/lib/integrations/rentvine/client";
import { MarketCompQueryResolutionError } from "@/lib/lease-renewal/market-comp-query-basis";
import { resolveCurrentMarketCompQueryBasis } from "@/lib/lease-renewal/market-comp-query-resolver";

const VIEW: RawLease = {
  leaseID: "L1",
  currentRent: 1250,
  unit: {
    rent: 1250,
    size: "1400",
    beds: 3,
    fullBaths: 2,
    halfBaths: 1,
    postalCode: "64118",
  },
  property: {
    streetNumber: "104",
    streetName: "NE Lindsay Ave",
    city: "Kansas City",
    stateID: "MO",
    postalCode: "64118",
  },
};

function snapshot(
  views: RawLease[],
  options: { complete?: boolean; state?: "fresh" | "stale" | "expired" } = {},
) {
  return {
    snapshot: {
      views,
      complete: options.complete ?? true,
      readAtMs: 1_000,
    },
    currency: {
      state: options.state ?? "fresh",
      ageMs: options.state === "expired" ? 16 * 60_000 : 0,
      readAtMs: 1_000,
      refreshing: false,
      lastError: false,
    },
  };
}

beforeEach(() => {
  harness.config.current = { ok: true, rentvineClient: {} };
  harness.result.current = snapshot([VIEW]);
});

describe("resolveCurrentMarketCompQueryBasis", () => {
  it("resolves exactly one current server-side lease into the authoritative query basis", async () => {
    await expect(
      resolveCurrentMarketCompQueryBasis(" L1 ", 2_000),
    ).resolves.toMatchObject({
      leaseId: "L1",
      addressLabel: "104 NE Lindsay Ave, Kansas City, MO 64118",
      query: { bedrooms: 3, bathrooms: 2.5, squareFootage: 1400 },
      baseRent: { status: "verified", value: 1250, sourcePath: "unit.rent" },
      trendPostalCode: "64118",
    });
  });

  it.each([
    ["not_configured", "rentvine_not_configured"],
    ["account_mismatch", "rentvine_account_mismatch"],
  ] as const)("fails closed when RentVine is %s", async (reason, code) => {
    harness.config.current = { ok: false, reason };
    await expect(resolveCurrentMarketCompQueryBasis("L1")).rejects.toMatchObject({
      code,
      status: 409,
    } satisfies Partial<MarketCompQueryResolutionError>);
  });

  it("refuses an expired read even when it contains the lease", async () => {
    harness.result.current = snapshot([VIEW], { state: "expired" });
    await expect(resolveCurrentMarketCompQueryBasis("L1")).rejects.toMatchObject({
      code: "lease_data_expired",
      status: 409,
    } satisfies Partial<MarketCompQueryResolutionError>);
  });

  it("turns a RentVine read failure into a typed, non-leaking refusal", async () => {
    harness.result.current = Promise.reject(new Error("secret provider detail"));
    await expect(resolveCurrentMarketCompQueryBasis("L1")).rejects.toMatchObject({
      code: "rentvine_read_failed",
      status: 503,
      message: "The current RentVine lease read failed, so no RentCast lookup ran.",
    } satisfies Partial<MarketCompQueryResolutionError>);
  });

  it("distinguishes incomplete absence from verified not-found", async () => {
    harness.result.current = snapshot([], { complete: false });
    await expect(resolveCurrentMarketCompQueryBasis("L1")).rejects.toMatchObject({
      code: "lease_read_incomplete",
      status: 409,
    } satisfies Partial<MarketCompQueryResolutionError>);

    harness.result.current = snapshot([], { complete: true });
    await expect(resolveCurrentMarketCompQueryBasis("L1")).rejects.toMatchObject({
      code: "lease_not_found",
      status: 404,
    } satisfies Partial<MarketCompQueryResolutionError>);
  });

  it("refuses duplicate lease identities instead of choosing one", async () => {
    harness.result.current = snapshot([VIEW, { ...VIEW }]);
    await expect(resolveCurrentMarketCompQueryBasis("L1")).rejects.toMatchObject({
      code: "lease_ambiguous",
      status: 409,
    } satisfies Partial<MarketCompQueryResolutionError>);
  });
});
