import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearLiveLeaseCache,
  getLiveLeaseViews,
  LEASE_EXPORT_TTL_MS,
} from "@/lib/lease-renewal/live-lease-cache";

beforeEach(clearLiveLeaseCache);

function reader(rows: Record<string, unknown>[] = [{ lease: { leaseID: 1 } }]) {
  const listLeasesExport = vi.fn(async () => rows);
  return { client: { listLeasesExport }, listLeasesExport };
}

describe("getLiveLeaseViews", () => {
  it("reads once and serves cached views within the TTL", async () => {
    const { client, listLeasesExport } = reader();
    const first = await getLiveLeaseViews(client, 1_000);
    const second = await getLiveLeaseViews(client, 1_000 + LEASE_EXPORT_TTL_MS - 1);
    expect(listLeasesExport).toHaveBeenCalledTimes(1);
    expect(second).toBe(first); // same cached array reference
    expect(first[0].leaseID).toBe(1);
  });

  it("re-reads once the TTL has expired", async () => {
    const { client, listLeasesExport } = reader();
    await getLiveLeaseViews(client, 1_000);
    await getLiveLeaseViews(client, 1_000 + LEASE_EXPORT_TTL_MS + 1);
    expect(listLeasesExport).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent misses into a single read", async () => {
    const { client, listLeasesExport } = reader();
    const [a, b] = await Promise.all([
      getLiveLeaseViews(client, 1_000),
      getLiveLeaseViews(client, 1_000),
    ]);
    expect(listLeasesExport).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("does not cache a failed read; the next call retries", async () => {
    let calls = 0;
    const client = {
      listLeasesExport: async () => {
        calls += 1;
        if (calls === 1) throw new Error("boom");
        return [{ lease: { leaseID: 2 } }];
      },
    };
    await expect(getLiveLeaseViews(client, 1_000)).rejects.toThrow(/boom/);
    const views = await getLiveLeaseViews(client, 1_000);
    expect(calls).toBe(2);
    expect(views[0].leaseID).toBe(2);
  });

  it("clearLiveLeaseCache forces a fresh read", async () => {
    const { client, listLeasesExport } = reader();
    await getLiveLeaseViews(client, 1_000);
    clearLiveLeaseCache();
    await getLiveLeaseViews(client, 1_000);
    expect(listLeasesExport).toHaveBeenCalledTimes(2);
  });
});
