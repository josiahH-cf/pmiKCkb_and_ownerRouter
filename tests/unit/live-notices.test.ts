import { beforeEach, describe, expect, it } from "vitest";

import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";
import type { DateWindow } from "@/lib/lease-renewal/cohort";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import {
  buildLiveRenewalNoticeRows,
  loadLiveRenewalNotices,
} from "@/lib/lease-renewal/live-notices";

// The loader uses a shared module-level export cache; reset it so cases don't leak reads into each other.
beforeEach(clearLiveLeaseCache);

const READ_TS = "2026-07-19T00:00:00.000Z";
// Windows spanning Aug + Sep 2026 month-ends.
const WINDOWS: DateWindow[] = [{ startIso: "2026-08-01", endIso: "2026-09-30" }];

// Export rows: an actionable month-end tenant lease, an actionable owner-bearing lease, a
// month-to-month (skip), and an off-cycle date (review) — only the two actionable ones become rows.
const rows = [
  {
    lease: {
      leaseID: 4821,
      endDate: "2026-08-31",
      tenants: [{ name: "Ada Rowan", email: "tenant4821@northend-apts.com" }],
    },
    unit: { rent: "1250.00" },
  },
  {
    lease: { leaseID: 5000, endDate: "2026-09-30", tenants: [{ name: "Ben Cole" }] },
    property: { owner: { email: "owner5000@cedar-holdings.com" } },
    unit: { rent: "1400.00" },
  },
  {
    lease: {
      leaseID: 6000,
      endDate: "2026-08-31",
      leaseType: "Month to Month",
      tenants: [{ name: "M2M" }],
    },
  },
  {
    lease: { leaseID: 7000, endDate: "2026-08-15", tenants: [{ name: "Off Cycle" }] },
  },
];

describe("buildLiveRenewalNoticeRows", () => {
  it("keeps only actionable leases and projects recipient readiness", () => {
    const views = leaseViewsFromExport(rows);
    const result = buildLiveRenewalNoticeRows(views, WINDOWS);

    expect(result.map((r) => r.leaseId).sort()).toEqual(["4821", "5000"]);

    const tenant = result.find((r) => r.leaseId === "4821")!;
    expect(tenant.tenantName).toBe("Ada Rowan");
    expect(tenant.leaseEndIso).toBe("2026-08-31");
    expect(tenant.tenantRecipientVerified).toBe(true);
    expect(tenant.ownerRecipientVerified).toBe(false);

    const owner = result.find((r) => r.leaseId === "5000")!;
    expect(owner.ownerRecipientVerified).toBe(true);
    expect(owner.tenantRecipientVerified).toBe(false); // Ben Cole has no email
  });
});

describe("loadLiveRenewalNotices", () => {
  it("degrades to the config status without throwing when not connected", async () => {
    const result = await loadLiveRenewalNotices(WINDOWS, READ_TS, {
      ok: false,
      reason: "not_configured",
    });
    expect(result).toEqual({ status: "not_configured" });
  });

  it("reads the export and returns actionable rows when connected", async () => {
    const fakeConfig = {
      ok: true as const,
      rentvineClient: {
        listLeasesExport: async () => rows as Record<string, unknown>[],
      },
    };
    const result = await loadLiveRenewalNotices(
      WINDOWS,
      READ_TS,
      // Only listLeasesExport is used by the loader.
      fakeConfig as unknown as Parameters<typeof loadLiveRenewalNotices>[2],
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.scanned).toBe(4);
    expect(result.rows.map((r) => r.leaseId).sort()).toEqual(["4821", "5000"]);
  });

  it("returns read_error when the export throws", async () => {
    const fakeConfig = {
      ok: true as const,
      rentvineClient: {
        listLeasesExport: async () => {
          throw new Error("boom");
        },
      },
    };
    const result = await loadLiveRenewalNotices(
      WINDOWS,
      READ_TS,
      fakeConfig as unknown as Parameters<typeof loadLiveRenewalNotices>[2],
    );
    expect(result).toEqual({ status: "read_error" });
  });
});
