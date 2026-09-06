import { beforeEach, describe, expect, it, vi } from "vitest";

import { leaseTermSourceFingerprint } from "@/lib/lease-renewal/lease-term";

// S103: the term-review route binds a review to the lease view the server itself reads. This module
// is the only place that read happens, so its refusal shapes are pinned here against a fake live
// snapshot; the route test mocks this module and proves the HTTP mapping on top of it.

const mocks = vi.hoisted(() => ({
  buildLiveRenewalConfig: vi.fn(),
  getLiveLeaseSnapshot: vi.fn(),
}));

vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRenewalConfig: mocks.buildLiveRenewalConfig,
}));

vi.mock("@/lib/lease-renewal/live-lease-cache", () => ({
  getLiveLeaseSnapshot: mocks.getLiveLeaseSnapshot,
}));

import { readLeaseTermSource } from "@/lib/lease-renewal/lease-term-source";

const VIEW_115 = {
  leaseID: 115,
  startDate: "2025-10-01",
  endDate: "2026-09-30",
  unit: { rent: 1200 },
};
const VIEW_116 = {
  leaseID: 116,
  startDate: "2025-11-01",
  endDate: "2026-10-31",
  unit: { rent: 1300 },
};

describe("readLeaseTermSource (S103 server-side term binding)", () => {
  beforeEach(() => {
    mocks.buildLiveRenewalConfig.mockReset();
    mocks.getLiveLeaseSnapshot.mockReset();
    mocks.buildLiveRenewalConfig.mockReturnValue({ ok: true, rentvineClient: {} });
    mocks.getLiveLeaseSnapshot.mockResolvedValue({
      snapshot: { views: [VIEW_115, VIEW_116], complete: true, readAtMs: 0 },
    });
  });

  it("fingerprints exactly the lease the id names, from the live snapshot", async () => {
    const read = await readLeaseTermSource("116", 1_000);
    expect(read).toEqual({
      status: "ok",
      sourceFingerprint: leaseTermSourceFingerprint(VIEW_116),
    });
    expect(read.status === "ok" && read.sourceFingerprint).not.toBe(
      leaseTermSourceFingerprint(VIEW_115),
    );
    expect(mocks.getLiveLeaseSnapshot).toHaveBeenCalledWith({}, 1_000);
  });

  it("reports a lease the live snapshot does not contain, never a fingerprint for it", async () => {
    await expect(readLeaseTermSource("999")).resolves.toEqual({
      status: "lease_not_found",
    });
    await expect(readLeaseTermSource("abc")).resolves.toEqual({
      status: "lease_not_found",
    });
  });

  it("treats an incomplete portfolio read as unavailable rather than proof of absence", async () => {
    mocks.getLiveLeaseSnapshot.mockResolvedValueOnce({
      snapshot: { views: [VIEW_115], complete: false, readAtMs: 0 },
    });
    await expect(readLeaseTermSource("999")).resolves.toEqual({ status: "unavailable" });
  });

  it("reports the source unavailable when the live read throws or is not configured", async () => {
    mocks.getLiveLeaseSnapshot.mockRejectedValueOnce(new Error("RentVine 503"));
    await expect(readLeaseTermSource("115")).resolves.toEqual({ status: "unavailable" });

    mocks.buildLiveRenewalConfig.mockReturnValueOnce({
      ok: false,
      reason: "missing_env",
    });
    await expect(readLeaseTermSource("115")).resolves.toEqual({ status: "unavailable" });
    expect(mocks.getLiveLeaseSnapshot).toHaveBeenCalledTimes(1);
  });
});
