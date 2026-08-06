// S58: the demand-driven refresh route. `force` bypasses the TTL via invalidation but is
// rate-limited per operator (AC-S58-6: repeated activation inside the window performs exactly one
// provider read); `revalidate` re-enters the cache's age contract, so fresh data makes no provider
// call (the focus path's server half, AC-S58-7).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  buildLiveRentVineConfig: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: mocks.requireCapabilityInSpace };
});

vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRentVineConfig: mocks.buildLiveRentVineConfig,
}));

import {
  POST,
  resetRefreshRateLimitForTests,
} from "@/app/api/lease-renewal/refresh/route";
import type { LeaseExportReadResult } from "@/lib/integrations/rentvine/client";
import {
  clearLiveLeaseCache,
  getLiveLeaseViews,
} from "@/lib/lease-renewal/live-lease-cache";

const user = {
  uid: "op-1",
  email: "op1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};

function fakeReader() {
  const listAllLeasesExport = vi.fn(
    async (): Promise<LeaseExportReadResult> => ({
      rows: [{ lease: { leaseID: 1 } }],
      pages: 1,
      complete: true,
    }),
  );
  return { client: { listAllLeasesExport }, listAllLeasesExport };
}

function req(mode: "force" | "revalidate") {
  return new Request("http://localhost/api/lease-renewal/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode }),
  });
}

beforeEach(() => {
  clearLiveLeaseCache();
  resetRefreshRateLimitForTests();
  mocks.requireCapabilityInSpace.mockResolvedValue(user);
});

afterEach(() => {
  clearLiveLeaseCache();
  resetRefreshRateLimitForTests();
  vi.clearAllMocks();
});

describe("lease-renewal refresh route", () => {
  it("force performs a provider read even when the cache is fresh", async () => {
    const { client, listAllLeasesExport } = fakeReader();
    await getLiveLeaseViews(client, Date.now());
    expect(listAllLeasesExport).toHaveBeenCalledTimes(1);
    mocks.buildLiveRentVineConfig.mockReturnValue({ ok: true, rentvineClient: client });

    const res = await POST(req("force"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { refreshed: boolean; throttled: boolean };
    expect(json).toMatchObject({ refreshed: true, throttled: false });
    expect(listAllLeasesExport).toHaveBeenCalledTimes(2);
  });

  // AC-S58-6 (server half): a second force inside the per-operator window reads nothing.
  it("throttles a repeated force inside the window to exactly one provider read", async () => {
    const { client, listAllLeasesExport } = fakeReader();
    mocks.buildLiveRentVineConfig.mockReturnValue({ ok: true, rentvineClient: client });

    const first = await POST(req("force"));
    expect(first.status).toBe(200);
    const second = await POST(req("force"));
    expect(second.status).toBe(200);
    const json = (await second.json()) as { refreshed: boolean; throttled: boolean };
    expect(json).toMatchObject({ refreshed: false, throttled: true });
    expect(listAllLeasesExport).toHaveBeenCalledTimes(1);
  });

  // AC-S58-7 (server half): revalidate with a fresh snapshot makes no provider call.
  it("revalidate performs no provider read when the snapshot is fresh", async () => {
    const { client, listAllLeasesExport } = fakeReader();
    await getLiveLeaseViews(client, Date.now());
    mocks.buildLiveRentVineConfig.mockReturnValue({ ok: true, rentvineClient: client });

    const res = await POST(req("revalidate"));
    expect(res.status).toBe(200);
    expect(listAllLeasesExport).toHaveBeenCalledTimes(1);
  });

  it("answers 503 when live RentVine is not configured", async () => {
    mocks.buildLiveRentVineConfig.mockReturnValue({
      ok: false,
      reason: "not_configured",
    });
    const res = await POST(req("force"));
    expect(res.status).toBe(503);
  });

  it("rejects an unknown mode with a 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/lease-renewal/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "hammer" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
