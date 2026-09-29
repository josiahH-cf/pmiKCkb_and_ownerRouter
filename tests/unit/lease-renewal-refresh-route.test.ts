// S58: the demand-driven refresh route. `force` bypasses the TTL via invalidation but is
// rate-limited per operator (AC-S58-6: repeated activation inside the window performs exactly one
// provider read); `revalidate` re-enters the cache's age contract, so fresh data makes no provider
// call (the focus path's server half, AC-S58-7).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeTransactionalFirestore } from "../helpers/fake-transactional-firestore";

const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  buildLiveRentVineConfig: vi.fn(),
  getAdminFirestore: vi.fn(),
}));

// Exercise the real admission transaction without allowing unit tests to discover ADC/project
// configuration or contact a real Firestore service.
vi.mock("@/lib/firestore/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
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
import { renewalWorkspaceDocId } from "@/lib/firestore/renewal-workspace";
import {
  NoticeSafetyMarkerSchema,
  noticeScopeHash,
  pendingNoticeHash,
} from "@/lib/lease-renewal/notice-safety";

let store: FakeTransactionalFirestore;
const markerPath = `lease_renewal_workspaces/${renewalWorkspaceDocId("1")}/approval_safety/notice`;
const initialMarker = {
  version: 3,
  scopeHash: noticeScopeHash("1", null, null),
  semanticHash: "a".repeat(64),
  sourceReadAt: { lease: 0, status: 0 },
  observedAt: "2026-09-29T00:00:00.000Z",
};

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
  store = new FakeTransactionalFirestore();
  store.seed(markerPath, initialMarker);
  mocks.getAdminFirestore.mockReturnValue(store);
  clearLiveLeaseCache();
  resetRefreshRateLimitForTests();
  mocks.requireCapabilityInSpace.mockResolvedValue(user);
});

afterEach(() => {
  clearLiveLeaseCache();
  resetRefreshRateLimitForTests();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("lease-renewal refresh route", () => {
  it("force performs a provider read even when the cache is fresh", async () => {
    const { client, listAllLeasesExport } = fakeReader();
    await getLiveLeaseViews(client, Date.now());
    expect(listAllLeasesExport).toHaveBeenCalledTimes(1);
    mocks.buildLiveRentVineConfig.mockReturnValue({ ok: true, rentvineClient: client });
    const providerRead = listAllLeasesExport.getMockImplementation()!;
    let markerAtProviderDispatch: unknown;
    listAllLeasesExport.mockImplementationOnce(async () => {
      markerAtProviderDispatch = store.read(markerPath);
      return providerRead();
    });

    const res = await POST(req("force"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { refreshed: boolean; throttled: boolean };
    expect(json).toMatchObject({
      refreshed: true,
      throttled: false,
      state: "fresh",
      lastError: false,
    });
    expect(listAllLeasesExport).toHaveBeenCalledTimes(2);
    expect(mocks.getAdminFirestore).toHaveBeenCalledTimes(1);
    // Assert outside the provider callback: the cache deliberately catches read failures, so an
    // assertion thrown inside that callback could otherwise be mistaken for an expired fallback.
    const admitted = NoticeSafetyMarkerSchema.parse(markerAtProviderDispatch);
    expect(admitted.version).toBe(initialMarker.version + 1);
    expect(admitted.sourceReadAt.lease).toBeGreaterThan(0);
    expect(admitted.sourceReadAt.status).toBe(0);
    expect(admitted.semanticHash).toBe(
      pendingNoticeHash(initialMarker.scopeHash, admitted.sourceReadAt),
    );
  });

  // AC-S58-6 (server half): a second force inside the per-operator window reads nothing.
  it("throttles a repeated force inside the window to exactly one provider read", async () => {
    const { client, listAllLeasesExport } = fakeReader();
    mocks.buildLiveRentVineConfig.mockReturnValue({ ok: true, rentvineClient: client });

    const first = await POST(req("force"));
    expect(first.status).toBe(200);
    const admitted = store.read(markerPath);
    const second = await POST(req("force"));
    expect(second.status).toBe(200);
    const json = (await second.json()) as { refreshed: boolean; throttled: boolean };
    expect(json).toMatchObject({ refreshed: false, throttled: true });
    expect(listAllLeasesExport).toHaveBeenCalledTimes(1);
    expect(store.read(markerPath)).toEqual(admitted);
    expect(mocks.getAdminFirestore).toHaveBeenCalledTimes(1);
  });

  // AC-S58-7 (server half): revalidate with a fresh snapshot makes no provider call.
  it("revalidate performs no provider read when the snapshot is fresh", async () => {
    const { client, listAllLeasesExport } = fakeReader();
    await getLiveLeaseViews(client, Date.now());
    mocks.buildLiveRentVineConfig.mockReturnValue({ ok: true, rentvineClient: client });

    const res = await POST(req("revalidate"));
    expect(res.status).toBe(200);
    expect(listAllLeasesExport).toHaveBeenCalledTimes(1);
    expect(store.read(markerPath)).toEqual(initialMarker);
  });

  it.each(["cold", "warm"] as const)(
    "dispatches no provider read when admission persistence fails with a %s cache",
    async (cache) => {
      const { client, listAllLeasesExport } = fakeReader();
      if (cache === "warm") {
        await getLiveLeaseViews(client, Date.now());
        listAllLeasesExport.mockClear();
      }
      const failure = new Error("Synthetic admission persistence failed.");
      const persist = vi.spyOn(store, "runTransaction").mockRejectedValue(failure);
      mocks.buildLiveRentVineConfig.mockReturnValue({ ok: true, rentvineClient: client });

      if (cache === "cold") {
        await expect(POST(req("force"))).rejects.toBe(failure);
      } else {
        const response = await POST(req("force"));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          state: "expired",
          lastError: true,
        });
      }
      expect(persist).toHaveBeenCalledTimes(1);
      expect(listAllLeasesExport).not.toHaveBeenCalled();
      expect(store.read(markerPath)).toEqual(initialMarker);
    },
  );

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
