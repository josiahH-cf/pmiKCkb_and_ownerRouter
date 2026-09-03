import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeaseExportReadResult } from "@/lib/integrations/rentvine/client";
import {
  applyLeaseDetailToView,
  leaseCurrentRent,
  leaseDetailOf,
  leaseTotalRentAmount,
  leaseUnitListedRent,
  leaseViewsFromExport,
  markLeaseDetailUnavailable,
} from "@/lib/integrations/rentvine/lease-mapper";
import {
  clearLiveLeaseCache,
  getLiveLeaseSnapshot,
  LEASE_DETAIL_READ_CONCURRENCY,
} from "@/lib/lease-renewal/live-lease-cache";

// S102: the tenant's current rent comes from the documented lease detail (`baseRentAmount`), never
// from the export's `unit.rent` (a unit attribute that tracks the unit's listed rent). Fixture values
// are synthetic; key names mirror the 2026-09-03 bodyless discovery.

beforeEach(clearLiveLeaseCache);

const EXPORT_ROW = {
  lease: {
    leaseID: 41,
    endDate: "2026-11-30",
    tenants: [{ name: "Synthetic Tenant" }],
  },
  unit: { rent: "1000.00" },
};

const DETAIL = {
  leaseID: "41",
  startDate: "2025-12-01",
  endDate: "2026-11-30",
  baseRentAmount: 1050,
  rentAmount: 1075,
  isMonthToMonth: "0",
  monthToMonthStartDate: null,
  hasPendingMonthToMonthConversion: false,
};

describe("S102 lease view rent contract (pure)", () => {
  it("keeps unit.rent only as the unit reference and leaves current rent unset", () => {
    const [view] = leaseViewsFromExport([EXPORT_ROW]);
    expect(leaseUnitListedRent(view)).toBe(1000);
    expect(view.currentRent).toBeUndefined();
    expect(leaseCurrentRent(view)).toBeUndefined();
  });

  it("applies the lease detail so base rent becomes the current rent and total rent stays separate", () => {
    const [view] = leaseViewsFromExport([EXPORT_ROW]);
    applyLeaseDetailToView(view, DETAIL);
    expect(leaseCurrentRent(view)).toBe(1050);
    expect(leaseTotalRentAmount(view)).toBe(1075);
    expect(leaseUnitListedRent(view)).toBe(1000);
    expect(leaseDetailOf(view)).toMatchObject({
      status: "available",
      isMonthToMonth: false,
      monthToMonthStartDate: null,
      hasPendingMonthToMonthConversion: false,
    });
  });

  it("never lets unit.rent, rentAmount, or a lease-level lookalike stand in for base rent", () => {
    const [view] = leaseViewsFromExport([
      {
        lease: { ...EXPORT_ROW.lease, rent: "999.00", currentRent: "998.00" },
        unit: { rent: "1000.00" },
      },
    ]);
    applyLeaseDetailToView(view, { ...DETAIL, baseRentAmount: null, rentAmount: 1075 });
    expect(leaseCurrentRent(view)).toBeUndefined();
    expect(leaseTotalRentAmount(view)).toBe(1075);
  });

  it("rejects zero, negative, and non-finite base rent as unavailable", () => {
    for (const baseRentAmount of [0, -5, Number.NaN, "abc"]) {
      const [view] = leaseViewsFromExport([EXPORT_ROW]);
      applyLeaseDetailToView(view, { ...DETAIL, baseRentAmount });
      expect(leaseCurrentRent(view)).toBeUndefined();
    }
  });

  it("marks a failed detail read unavailable without inventing a rent", () => {
    const [view] = leaseViewsFromExport([EXPORT_ROW]);
    markLeaseDetailUnavailable(view);
    expect(leaseDetailOf(view)).toEqual({ status: "unavailable" });
    expect(leaseCurrentRent(view)).toBeUndefined();
    expect(leaseUnitListedRent(view)).toBe(1000);
  });
});

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    lease: {
      leaseID: index + 1,
      endDate: "2026-11-30",
      tenants: [{ name: `T${index}` }],
    },
    unit: { rent: "1000.00" },
  }));
}

describe("S102 live lease generation enrichment", () => {
  it("reads every lease detail inside the generation with bounded concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const getLease = vi.fn(async (id: string | number) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return { ...DETAIL, leaseID: String(id), baseRentAmount: 1000 + Number(id) };
    });
    const reader = {
      listAllLeasesExport: async (): Promise<LeaseExportReadResult> => ({
        rows: rows(20),
        pages: 1,
        complete: true,
      }),
      getLease,
    };
    const { snapshot } = await getLiveLeaseSnapshot(reader, 1_000);
    expect(getLease).toHaveBeenCalledTimes(20);
    expect(peak).toBeLessThanOrEqual(LEASE_DETAIL_READ_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
    expect(snapshot.complete).toBe(true);
    expect(snapshot.detailComplete).toBe(true);
    expect(leaseCurrentRent(snapshot.views[4])).toBe(1005);
    expect(leaseUnitListedRent(snapshot.views[4])).toBe(1000);
  });

  it("isolates one failed detail read to that lease and keeps portfolio completeness", async () => {
    const getLease = vi.fn(async (id: string | number) => {
      if (String(id) === "3") throw new Error("boom");
      return { ...DETAIL, leaseID: String(id) };
    });
    const reader = {
      listAllLeasesExport: async (): Promise<LeaseExportReadResult> => ({
        rows: rows(5),
        pages: 1,
        complete: true,
      }),
      getLease,
    };
    const { snapshot } = await getLiveLeaseSnapshot(reader, 1_000);
    expect(snapshot.complete).toBe(true);
    expect(snapshot.detailComplete).toBe(false);
    expect(snapshot.detailUnavailableCount).toBe(1);
    expect(leaseDetailOf(snapshot.views[2])).toEqual({ status: "unavailable" });
    expect(leaseCurrentRent(snapshot.views[2])).toBeUndefined();
    expect(leaseCurrentRent(snapshot.views[3])).toBe(1050);
  });

  it("marks every lease unavailable when the reader has no detail read", async () => {
    const reader = {
      listAllLeasesExport: async (): Promise<LeaseExportReadResult> => ({
        rows: rows(2),
        pages: 1,
        complete: true,
      }),
    };
    const { snapshot } = await getLiveLeaseSnapshot(reader, 1_000);
    expect(snapshot.detailComplete).toBe(false);
    expect(snapshot.detailUnavailableCount).toBe(2);
    expect(leaseCurrentRent(snapshot.views[0])).toBeUndefined();
  });
});
