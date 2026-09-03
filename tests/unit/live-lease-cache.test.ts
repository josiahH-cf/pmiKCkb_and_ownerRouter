import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeaseExportReadResult } from "@/lib/integrations/rentvine/client";
import {
  clearLiveLeaseCache,
  getLiveLeaseRead,
  getLiveLeaseSnapshot,
  getLiveLeaseSnapshotAtOrAfter,
  getLiveLeaseViews,
  invalidateLiveLeaseCache,
  LeaseDataExpiredError,
  LEASE_EXPORT_MAX_AGE_MS,
  LEASE_EXPORT_TTL_MS,
  LEASE_REFRESH_BACKOFF_BASE_MS,
  refreshLiveLeaseSnapshotFromProvider,
  requireCurrentLeaseViews,
} from "@/lib/lease-renewal/live-lease-cache";

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(clearLiveLeaseCache);

function reader(
  rows: Record<string, unknown>[] = [{ lease: { leaseID: 1 } }],
  complete = true,
) {
  const listAllLeasesExport = vi.fn(
    async (): Promise<LeaseExportReadResult> => ({ rows, pages: 1, complete }),
  );
  return { client: { listAllLeasesExport }, listAllLeasesExport };
}

describe("getLiveLeaseViews", () => {
  it("reads once and serves cached views within the TTL", async () => {
    const { client, listAllLeasesExport } = reader();
    const first = await getLiveLeaseViews(client, 1_000);
    const second = await getLiveLeaseViews(client, 1_000 + LEASE_EXPORT_TTL_MS - 1);
    expect(listAllLeasesExport).toHaveBeenCalledTimes(1);
    expect(second).toBe(first); // same cached array reference
    expect(first[0].leaseID).toBe(1);
  });

  it("re-reads once the TTL has expired", async () => {
    const { client, listAllLeasesExport } = reader();
    await getLiveLeaseViews(client, 1_000);
    await getLiveLeaseViews(client, 1_000 + LEASE_EXPORT_TTL_MS + 1);
    expect(listAllLeasesExport).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent misses into a single read", async () => {
    const { client, listAllLeasesExport } = reader();
    const [a, b] = await Promise.all([
      getLiveLeaseViews(client, 1_000),
      getLiveLeaseViews(client, 1_000),
    ]);
    expect(listAllLeasesExport).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("does not cache a failed read; the next call retries", async () => {
    let calls = 0;
    const client = {
      listAllLeasesExport: async (): Promise<LeaseExportReadResult> => {
        calls += 1;
        if (calls === 1) throw new Error("boom");
        return { rows: [{ lease: { leaseID: 2 } }], pages: 1, complete: true };
      },
    };
    await expect(getLiveLeaseViews(client, 1_000)).rejects.toThrow(/boom/);
    const views = await getLiveLeaseViews(client, 1_000);
    expect(calls).toBe(2);
    expect(views[0].leaseID).toBe(2);
  });

  it("clearLiveLeaseCache forces a fresh read", async () => {
    const { client, listAllLeasesExport } = reader();
    await getLiveLeaseViews(client, 1_000);
    clearLiveLeaseCache();
    await getLiveLeaseViews(client, 1_000);
    expect(listAllLeasesExport).toHaveBeenCalledTimes(2);
  });

  // AC-S57-2: the desk's loaded lease set comes from the COMPLETE read, so leases outside the
  // provider's 25-row default page are present without committing a Live proof cohort.
  it("loads fixture leases beyond the provider's default page", async () => {
    const rows = Array.from({ length: 305 }, (_, i) => ({
      lease: { leaseID: i + 1 },
    }));
    const { client } = reader(rows);
    const views = await getLiveLeaseViews(client, 1_000);
    expect(views).toHaveLength(305);
    const ids = new Set(views.map((view) => String(view.leaseID)));
    for (const beyondDefaultId of ["26", "100", "250", "305"]) {
      expect(ids.has(beyondDefaultId)).toBe(true);
    }
  });
});

describe("getLiveLeaseSnapshot (S58 age contract)", () => {
  // AC-S58-1: inside the soft TTL a second request performs no provider read.
  it("serves fresh data with no provider read inside the soft TTL", async () => {
    const { client, listAllLeasesExport } = reader();
    await getLiveLeaseSnapshot(client, 1_000);
    const second = await getLiveLeaseSnapshot(client, 1_000 + LEASE_EXPORT_TTL_MS - 1);
    expect(listAllLeasesExport).toHaveBeenCalledTimes(1);
    expect(second.currency.state).toBe("fresh");
    expect(second.currency.ageMs).toBe(LEASE_EXPORT_TTL_MS - 1);
  });

  // AC-S58-2: stale serves immediately and revalidates in the background.
  it("serves stale rows immediately and revalidates without delaying the response", async () => {
    let resolveRead: ((result: LeaseExportReadResult) => void) | null = null;
    let calls = 0;
    const client = {
      listAllLeasesExport: vi.fn(async (): Promise<LeaseExportReadResult> => {
        calls += 1;
        if (calls === 1) {
          return { rows: [{ lease: { leaseID: 1 } }], pages: 1, complete: true };
        }
        return new Promise((resolve) => {
          resolveRead = resolve;
        });
      }),
    };
    await getLiveLeaseSnapshot(client, 1_000);
    const staleAt = 1_000 + LEASE_EXPORT_TTL_MS + 1;
    const served = await getLiveLeaseSnapshot(client, staleAt);
    // Served from cache instantly even though the revalidation read has not resolved.
    expect(served.snapshot.views[0].leaseID).toBe(1);
    expect(served.currency.state).toBe("stale");
    expect(served.currency.refreshing).toBe(true);
    expect(calls).toBe(2);
    resolveRead!({ rows: [{ lease: { leaseID: 2 } }], pages: 1, complete: true });
    await flushAsync();
    const after = await getLiveLeaseSnapshot(client, staleAt + 1);
    expect(after.snapshot.views[0].leaseID).toBe(2);
    expect(calls).toBe(2);
  });

  it("re-reads blocking at expiry and returns the fresh snapshot", async () => {
    const { client, listAllLeasesExport } = reader();
    await getLiveLeaseSnapshot(client, 1_000);
    const result = await getLiveLeaseSnapshot(
      client,
      1_000 + LEASE_EXPORT_MAX_AGE_MS + 1,
    );
    expect(listAllLeasesExport).toHaveBeenCalledTimes(2);
    expect(result.currency.state).toBe("fresh");
  });

  // AC-S58-4 (cache half): a failed refresh keeps the last good rows, marked expired with a
  // visible age — never an empty portfolio, never a fresh claim.
  it("keeps serving the last good rows marked expired when the refresh fails", async () => {
    let calls = 0;
    const client = {
      listAllLeasesExport: vi.fn(async (): Promise<LeaseExportReadResult> => {
        calls += 1;
        if (calls === 1) {
          return { rows: [{ lease: { leaseID: 7 } }], pages: 1, complete: true };
        }
        throw new Error("provider down");
      }),
    };
    await getLiveLeaseSnapshot(client, 1_000);
    const expiredAt = 1_000 + LEASE_EXPORT_MAX_AGE_MS + 1;
    const served = await getLiveLeaseSnapshot(client, expiredAt);
    expect(served.snapshot.views[0].leaseID).toBe(7);
    expect(served.snapshot.views).toHaveLength(1);
    expect(served.currency.state).toBe("expired");
    expect(served.currency.lastError).toBe(true);
    expect(served.currency.ageMs).toBe(expiredAt - 1_000);
  });

  // AC-S58-5: repeated failures back off; not one provider read per request.
  it("backs off after a failed refresh instead of reading on every request", async () => {
    let calls = 0;
    const client = {
      listAllLeasesExport: vi.fn(async (): Promise<LeaseExportReadResult> => {
        calls += 1;
        if (calls === 1) {
          return { rows: [{ lease: { leaseID: 1 } }], pages: 1, complete: true };
        }
        throw new Error("provider down");
      }),
    };
    await getLiveLeaseSnapshot(client, 1_000);
    const expiredAt = 1_000 + LEASE_EXPORT_MAX_AGE_MS + 1;
    await getLiveLeaseSnapshot(client, expiredAt); // failed refresh no. 1
    expect(calls).toBe(2);
    // Inside the backoff window: served expired, no new provider read.
    const inWindow = await getLiveLeaseSnapshot(client, expiredAt + 1_000);
    expect(inWindow.currency.state).toBe("expired");
    expect(calls).toBe(2);
    // Past the base backoff: the retry happens (and fails, doubling the window).
    await getLiveLeaseSnapshot(client, expiredAt + LEASE_REFRESH_BACKOFF_BASE_MS + 1);
    expect(calls).toBe(3);
    // Inside the doubled window: still no read.
    await getLiveLeaseSnapshot(
      client,
      expiredAt + LEASE_REFRESH_BACKOFF_BASE_MS + 1 + LEASE_REFRESH_BACKOFF_BASE_MS,
    );
    expect(calls).toBe(3);
  });

  // AC-S58-8 (cache half): invalidation forces the next read to the provider.
  it("invalidateLiveLeaseCache makes the next read a provider read even inside the TTL", async () => {
    const { client, listAllLeasesExport } = reader();
    await getLiveLeaseSnapshot(client, 1_000);
    invalidateLiveLeaseCache();
    const result = await getLiveLeaseSnapshot(client, 1_001);
    expect(listAllLeasesExport).toHaveBeenCalledTimes(2);
    expect(result.currency.state).toBe("fresh");
  });

  it("a post-write refresh bypasses both cached data and a pre-write in-flight read", async () => {
    let releasePreWrite: (() => void) | undefined;
    let call = 0;
    const client = {
      listAllLeasesExport: vi.fn(async (): Promise<LeaseExportReadResult> => {
        call += 1;
        if (call === 2) {
          await new Promise<void>((resolve) => {
            releasePreWrite = resolve;
          });
        }
        return {
          rows: [{ lease: { leaseID: call } }],
          pages: 1,
          complete: true,
        };
      }),
    };
    await getLiveLeaseSnapshot(client, 1_000);
    const staleRevalidation = getLiveLeaseSnapshot(
      client,
      1_000 + LEASE_EXPORT_TTL_MS + 1,
    );
    await flushAsync();
    const postWrite = refreshLiveLeaseSnapshotFromProvider(client, 80_000, 80_001);
    releasePreWrite?.();
    await staleRevalidation;
    const refreshed = await postWrite;

    expect(client.listAllLeasesExport).toHaveBeenCalledTimes(3);
    expect(refreshed.snapshot.views[0].leaseID).toBe(3);
    expect(refreshed.snapshot.readAtMs).toBeGreaterThanOrEqual(80_000);
    expect(refreshed.currency.state).toBe("fresh");
  });

  it("forces an instance-local pre-write generation to meet a browser refresh barrier", async () => {
    let call = 0;
    const client = {
      listAllLeasesExport: vi.fn(async (): Promise<LeaseExportReadResult> => {
        call += 1;
        return {
          rows: [{ lease: { leaseID: call } }],
          pages: 1,
          complete: true,
        };
      }),
    };
    await getLiveLeaseSnapshot(client, 1_000);

    const refreshed = await getLiveLeaseSnapshotAtOrAfter(client, 2_001, 2_000);
    expect(client.listAllLeasesExport).toHaveBeenCalledTimes(2);
    expect(refreshed.snapshot.views[0].leaseID).toBe(2);
    expect(refreshed.snapshot.readAtMs).toBeGreaterThanOrEqual(2_000);

    const reused = await getLiveLeaseSnapshotAtOrAfter(client, 2_002, 2_000);
    expect(client.listAllLeasesExport).toHaveBeenCalledTimes(2);
    expect(reused.snapshot).toBe(refreshed.snapshot);
  });

  it("propagates a cold-miss failure (there is no last good data to serve)", async () => {
    const client = {
      listAllLeasesExport: vi.fn(async (): Promise<LeaseExportReadResult> => {
        throw new Error("cold boom");
      }),
    };
    await expect(getLiveLeaseSnapshot(client, 1_000)).rejects.toThrow(/cold boom/);
  });
});

describe("requireCurrentLeaseViews", () => {
  it("returns views while the snapshot is inside the hard max age", async () => {
    const { client } = reader();
    const views = await requireCurrentLeaseViews(client, 1_000);
    expect(views[0].leaseID).toBe(1);
  });

  // AC-S58-3 (cache half): expired-and-unrefreshable data refuses action paths.
  it("throws LeaseDataExpiredError when the served snapshot is expired", async () => {
    let calls = 0;
    const client = {
      listAllLeasesExport: vi.fn(async (): Promise<LeaseExportReadResult> => {
        calls += 1;
        if (calls === 1) {
          return { rows: [{ lease: { leaseID: 1 } }], pages: 1, complete: true };
        }
        throw new Error("provider down");
      }),
    };
    await getLiveLeaseSnapshot(client, 1_000);
    await expect(
      requireCurrentLeaseViews(client, 1_000 + LEASE_EXPORT_MAX_AGE_MS + 1),
    ).rejects.toBeInstanceOf(LeaseDataExpiredError);
  });
});

describe("getLiveLeaseRead", () => {
  it("propagates the export read's completeness alongside the views", async () => {
    const { client } = reader([{ lease: { leaseID: 9 } }], false);
    const read = await getLiveLeaseRead(client, 1_000);
    expect(read.complete).toBe(false);
    expect(read.views[0].leaseID).toBe(9);
  });

  it("shares one cache with getLiveLeaseViews", async () => {
    const { client, listAllLeasesExport } = reader();
    const read = await getLiveLeaseRead(client, 1_000);
    const views = await getLiveLeaseViews(client, 1_000 + LEASE_EXPORT_TTL_MS - 1);
    expect(listAllLeasesExport).toHaveBeenCalledTimes(1);
    expect(views).toBe(read.views);
  });
});

// S63 preservation: four securely supplied bindings traverse the same complete read; unit tests use
// synthetic identities only. Distinct end dates and a zero source rent are preserved as read.
describe("S63 four-binding shape through the live read", () => {
  const fixtureRows = [
    {
      lease: { leaseID: "fixture-lease-a", endDate: "2030-01-31" },
      unit: { rent: 1200 },
    },
    {
      lease: { leaseID: "fixture-lease-b", endDate: "2030-02-28" },
      unit: { rent: 1250 },
    },
    {
      lease: { leaseID: "fixture-lease-c", endDate: "2030-03-31" },
      unit: { rent: 1275 },
    },
    {
      lease: { leaseID: "fixture-lease-d", endDate: "2030-04-30" },
      unit: { rent: 0 },
    },
  ];

  it("carries all four fixture leases with distinct dates and the exact zero source rent", async () => {
    const { client } = reader(fixtureRows);
    const views = await getLiveLeaseViews(client, 1_000);
    expect(views).toHaveLength(4);
    const byId = new Map(views.map((view) => [String(view.leaseID), view]));
    expect(byId.get("fixture-lease-a")?.endDate).toBe("2030-01-31");
    expect(byId.get("fixture-lease-b")?.endDate).toBe("2030-02-28");
    expect(byId.get("fixture-lease-c")?.endDate).toBe("2030-03-31");
    expect(byId.get("fixture-lease-d")?.endDate).toBe("2030-04-30");
    // S102: the export unit rent is only the listed-rent reference; without a detail reader no
    // current rent exists and zero is never coerced into one.
    expect(byId.get("fixture-lease-d")?.unitListedRent).toBe(0);
    expect(byId.get("fixture-lease-d")?.currentRent).toBeUndefined();
  });
});
