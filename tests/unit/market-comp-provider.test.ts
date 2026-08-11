import { afterEach, describe, expect, it, vi } from "vitest";

const { createProviderSpy, runtimeSuspension } = vi.hoisted(() => ({
  createProviderSpy: vi.fn(),
  runtimeSuspension: {
    current: { status: "clear" } as { status: string },
  },
}));

vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: vi.fn(async () => runtimeSuspension.current),
}));

// The committed RentCast row is intentionally closed. Open only the seed term in this route-boundary
// test so the real runtime-suspension wrapper, not the seed refusal, owns the three refusal outcomes.
vi.mock("@/lib/integrations/action-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/action-gate")>();
  return {
    ...actual,
    assertActionExecutable: vi.fn(() => undefined),
    isActionExecutable: vi.fn(() => true),
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

vi.mock("@/lib/lease-renewal/market-comp-provider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/lease-renewal/market-comp-provider")>();
  return {
    ...actual,
    createMarketCompProvider: (
      ...args: Parameters<typeof actual.createMarketCompProvider>
    ) => {
      createProviderSpy(...args);
      return actual.createMarketCompProvider(...args);
    },
  };
});

import { POST } from "@/app/api/lease-renewal/market-comps/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  ManualMarketCompProvider,
  MANUAL_MARKET_COMP_SOURCE,
  createMarketCompProvider,
} from "@/lib/lease-renewal/market-comp-provider";
import {
  RENTCAST_LISTINGS_ACTION_KEY,
  RentCastMarketCompProvider,
} from "@/lib/lease-renewal/providers/rentcast-market-comp-provider";

const QUERY = { addressLabel: "104 NE Lindsay Ave" };

afterEach(() => {
  createProviderSpy.mockClear();
  runtimeSuspension.current = { status: "clear" };
  setAuthResolverForTest(null);
});

describe("ManualMarketCompProvider (AC-S28-1)", () => {
  it("passes the operator's own entered numbers straight through, tagged Manual entry / Likely", async () => {
    const provider = new ManualMarketCompProvider({
      rangeLow: 1450,
      rangeHigh: 1600,
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
    const provider = new ManualMarketCompProvider({ rangeLow: 1450 });
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

describe("RentCast market-comp route runtime boundary", () => {
  // S51_DYNAMIC_REFUSAL:market-comp-provider
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "does not construct the RentCast provider when runtime state is %s",
    async (status) => {
      setAuthResolverForTest(async () => ({
        uid: "editor-1",
        email: "editor@pmikcmetro.com",
        hd: "pmikcmetro.com",
        role: "Editor",
        scopes: ["renewals"],
      }));
      runtimeSuspension.current = { status };
      const json = vi.fn();
      const request = { headers: new Headers(), json } as unknown as Request;

      const response = await POST(request);

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        action_key: RENTCAST_LISTINGS_ACTION_KEY,
        error_type: "action_runtime_suspended",
      });
      expect(json).not.toHaveBeenCalled();
      expect(createProviderSpy).not.toHaveBeenCalled();
    },
  );
});
