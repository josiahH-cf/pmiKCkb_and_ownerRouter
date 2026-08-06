import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeaseExportReadResult } from "@/lib/integrations/rentvine/client";
import {
  clearLiveLeaseCache,
  getLiveLeaseRead,
  getLiveLeaseViews,
  LEASE_EXPORT_TTL_MS,
} from "@/lib/lease-renewal/live-lease-cache";

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
  // provider's 25-row default page — including every test-cohort lease — are present.
  it("loads leases beyond the provider's default page, including the test cohort ids", async () => {
    const rows = Array.from({ length: 305 }, (_, i) => ({
      lease: { leaseID: i + 1 },
    }));
    const { client } = reader(rows);
    const views = await getLiveLeaseViews(client, 1_000);
    expect(views).toHaveLength(305);
    const ids = new Set(views.map((view) => String(view.leaseID)));
    for (const cohortId of ["278", "279", "280", "297"]) {
      expect(ids.has(cohortId)).toBe(true);
    }
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
