// S59 route behavior: cache (AC-S59-3), billed-only metering (AC-S59-4), the hard quota stop
// (AC-S59-5), local missing-address refusal, legible pass-through failures (AC-S59-8), the
// seed-closed refusal before body parse (AC-S59-9, AC-S59-13), and the separately metered trend
// lookup (AC-S59-18).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  runtimeSuspension: { current: { status: "clear" } as { status: string } },
  gateOpen: { current: true },
  usage: { current: 0 },
  incrementCalls: [] as number[],
  lookupMock: vi.fn(),
  lookupTrendMock: vi.fn(),
}));

vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: vi.fn(async () => harness.runtimeSuspension.current),
}));

// The committed seed now opens rentcast.rental_listings.search. gateOpen=false injects the
// closed-action exception to preserve the route's fail-closed regression proof.
vi.mock("@/lib/integrations/action-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/action-gate")>();
  return {
    ...actual,
    assertActionExecutable: vi.fn((key: string) => {
      if (!harness.gateOpen.current) throw new actual.ActionNotExecutableError(key);
      return actual.assertActionExecutable(key);
    }),
    isActionExecutable: vi.fn(() => harness.gateOpen.current),
  };
});

vi.mock("@/lib/config/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/server")>();
  return {
    ...actual,
    readServerConfig: vi.fn(() => ({
      allowedHostedDomain: "pmikcmetro.com",
      marketCompProvider: "rentcast",
      rentcastApiKey: "synthetic-rentcast-key",
    })),
  };
});

vi.mock("@/lib/firestore/rentcast-usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firestore/rentcast-usage")>();
  return {
    ...actual,
    createRentcastUsageStore: () => ({
      readMonth: async (monthKey: string) => ({
        monthKey,
        billedCalls: harness.usage.current,
      }),
      incrementMonth: async (monthKey: string, by: number) => {
        harness.incrementCalls.push(by);
        harness.usage.current += by;
        return { monthKey, billedCalls: harness.usage.current };
      },
    }),
  };
});

vi.mock(
  "@/lib/lease-renewal/providers/rentcast-market-comp-provider",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/lib/lease-renewal/providers/rentcast-market-comp-provider")
      >();
    class FakeRentCastProvider {
      lookup = harness.lookupMock;
      lookupTrend = harness.lookupTrendMock;
    }
    return { ...actual, RentCastMarketCompProvider: FakeRentCastProvider };
  },
);

import {
  POST,
  resetMarketCompsCacheForTests,
} from "@/app/api/lease-renewal/market-comps/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { RENTCAST_MONTHLY_ALLOWANCE_DEFAULT } from "@/lib/lease-renewal/rentcast-quota";

const LIKELY_RESULT = {
  rangeLow: 1450,
  rangeHigh: 1650,
  pointEstimate: 1550,
  compCount: 3,
  comparables: [{ rent: 1600, correlation: 0.97 }],
  source: "RentCast",
  retrievedAt: "2026-08-06T00:00:00.000Z",
  confidence: "Likely" as const,
  billed: true,
};

function req(body: unknown) {
  return new Request("http://localhost/api/lease-renewal/market-comps", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetMarketCompsCacheForTests();
  harness.runtimeSuspension.current = { status: "clear" };
  harness.gateOpen.current = true;
  harness.usage.current = 0;
  harness.incrementCalls.length = 0;
  harness.lookupMock.mockReset().mockResolvedValue(LIKELY_RESULT);
  harness.lookupTrendMock.mockReset().mockResolvedValue({
    source: "RentCast",
    zipCode: "64118",
    history: { "2026-07": { averageRent: 1500 } },
    confidence: "Likely",
    billed: true,
  });
  setAuthResolverForTest(async () => ({
    uid: "editor-1",
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    scopes: ["renewals"],
  }));
});

afterEach(() => {
  resetMarketCompsCacheForTests();
  setAuthResolverForTest(null);
  vi.clearAllMocks();
});

describe("market-comps route (S59 RentCast path)", () => {
  it("meters a billed live call and returns the range with the quota view", async () => {
    const res = await POST(req({ address: "104 NE Lindsay Ave", bedrooms: 3 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      rangeLow: 1450,
      pointEstimate: 1550,
      quota: {
        used: 1,
        allowance: RENTCAST_MONTHLY_ALLOWANCE_DEFAULT,
        remaining: RENTCAST_MONTHLY_ALLOWANCE_DEFAULT - 1,
      },
    });
    expect(harness.lookupMock).toHaveBeenCalledTimes(1);
    expect(harness.lookupMock).toHaveBeenCalledWith(
      expect.objectContaining({ addressLabel: "104 NE Lindsay Ave", bedrooms: 3 }),
    );
    expect(harness.incrementCalls).toEqual([1]);
  });

  // AC-S59-3: a repeat inside the TTL performs zero additional live calls, identical range.
  it("serves a repeat lookup from the cache with zero live calls", async () => {
    const first = await (await POST(req({ address: "104 NE Lindsay Ave" }))).json();
    const second = await (await POST(req({ address: "104 NE Lindsay Ave" }))).json();
    expect(harness.lookupMock).toHaveBeenCalledTimes(1);
    expect(harness.incrementCalls).toEqual([1]);
    expect(second).toMatchObject({
      rangeLow: first.rangeLow,
      rangeHigh: first.rangeHigh,
      cached: true,
    });
  });

  // AC-S59-4: no increment on a refusal that was never billed.
  it("does not increment the counter on an unbilled refusal, and passes the reason through", async () => {
    harness.lookupMock.mockResolvedValue({
      source: "RentCast",
      confidence: "Needs Verification",
      reason: "timeout",
    });
    const json = await (await POST(req({ address: "104 NE Lindsay Ave" }))).json();
    expect(json).toMatchObject({ reason: "timeout", confidence: "Needs Verification" });
    expect(harness.incrementCalls).toEqual([]);
  });

  it("increments on a BILLED refusal (a 2xx too-thin payload is still a billable request)", async () => {
    harness.lookupMock.mockResolvedValue({
      source: "RentCast",
      confidence: "Needs Verification",
      reason: "too_few_comps",
      billed: true,
    });
    const json = await (await POST(req({ address: "104 NE Lindsay Ave" }))).json();
    expect(json).toMatchObject({ reason: "too_few_comps" });
    expect(harness.incrementCalls).toEqual([1]);
  });

  // AC-S59-5: at the stop the route refuses with the explicit reason and makes no call.
  it("refuses at the hard quota stop with no live call", async () => {
    harness.usage.current = RENTCAST_MONTHLY_ALLOWANCE_DEFAULT;
    const res = await POST(req({ address: "104 NE Lindsay Ave" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      reason: "out_of_allowance",
      confidence: "Needs Verification",
      quota: { exhausted: true, remaining: 0 },
    });
    expect(json.rangeLow).toBeUndefined();
    expect(harness.lookupMock).not.toHaveBeenCalled();
  });

  it("still serves a cached range after the allowance is exhausted (a hit costs nothing)", async () => {
    await POST(req({ address: "104 NE Lindsay Ave" }));
    harness.usage.current = RENTCAST_MONTHLY_ALLOWANCE_DEFAULT;
    const json = await (await POST(req({ address: "104 NE Lindsay Ave" }))).json();
    expect(json).toMatchObject({ cached: true, rangeLow: 1450 });
    expect(harness.lookupMock).toHaveBeenCalledTimes(1);
  });

  // AC-S59-6 route half: a missing address refuses locally; nothing is looked up.
  it("refuses a comps request with no address before any provider work", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error_type: "missing_address" });
    expect(harness.lookupMock).not.toHaveBeenCalled();
    expect(harness.incrementCalls).toEqual([]);
  });

  // AC-S59-18: a trend lookup is a separate billable request metered separately.
  it("meters a trend lookup separately and returns the month-keyed history intact", async () => {
    await POST(req({ address: "104 NE Lindsay Ave" }));
    const res = await POST(req({ operation: "trend", zipCode: "64118" }));
    const json = await res.json();
    expect(json).toMatchObject({
      zipCode: "64118",
      history: { "2026-07": { averageRent: 1500 } },
      quota: { used: 2 },
    });
    expect(harness.lookupTrendMock).toHaveBeenCalledTimes(1);
    expect(harness.lookupTrendMock).toHaveBeenCalledWith("64118");
    expect(harness.incrementCalls).toEqual([1, 1]);
  });

  it("refuses a trend request with no zip before any provider work", async () => {
    const res = await POST(req({ operation: "trend" }));
    expect(res.status).toBe(400);
    expect(harness.lookupTrendMock).not.toHaveBeenCalled();
  });

  // AC-S59-9 + AC-S59-13: with the committed seed still closed, the route refuses BEFORE parsing
  // the body, names the action key, and the comps path reports itself as not live.
  it("refuses with the real closed-seed response before body parse while the flip is unpushed", async () => {
    harness.gateOpen.current = false;
    const json = vi.fn();
    const request = { headers: new Headers(), json } as unknown as Request;
    const res = await POST(request);
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      action_key: "rentcast.rental_listings.search",
      error_type: "action_not_production_allowed",
    });
    expect(json).not.toHaveBeenCalled();
    expect(harness.lookupMock).not.toHaveBeenCalled();
  });
});
