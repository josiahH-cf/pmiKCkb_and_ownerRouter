import { beforeEach, describe, expect, it } from "vitest";
import { clearLiveLeaseCache } from "../../lib/lease-renewal/live-lease-cache";
import { loadLiveRenewalDesk } from "../../lib/lease-renewal/live-desk";
import { SAMPLE_RENEWAL_TABLES } from "../../lib/lease-renewal/sample-sheet";
import { withFakeLeaseDetail } from "../helpers/rentvine-detail-fake";

beforeEach(clearLiveLeaseCache);
async function desk(sheetRent: string) {
  const values = SAMPLE_RENEWAL_TABLES[0].slice(0, 2).map((row) => [...row]);
  values[1][4] = sheetRent;
  const response = { valueRanges: [{ range: "Lease Renewal", values }] };
  const config = {
    ok: true as const,
    rentvineHost: "pmikcmetro.rentvine.com",
    spreadsheetId: "isolated-sheet",
    rentvineClient: withFakeLeaseDetail({
      listAllLeasesExport: async () => ({
        complete: true,
        pages: 1,
        rows: [
          {
            lease: {
              leaseID: "71",
              endDate: "2027-01-31",
              tenants: [{ name: "Jordan Maple" }],
            },
            unit: { rent: 1250 },
          },
        ],
      }),
    }),
    sheetsReader: {
      listTabTitles: async () => ["Lease Renewal"],
      batchGet: async () => response,
      batchGetFormulas: async () => response,
    },
  };
  const result = await loadLiveRenewalDesk(
    [{ startIso: "2026-09-01", endIso: "2026-11-30" }],
    "2026-09-10T18:00:00.000Z",
    config as unknown as Parameters<typeof loadLiveRenewalDesk>[2],
  );
  if (result.status !== "ok") throw new Error("isolated_desk_unavailable");
  return result.view.items[0];
}
describe("S113 typed Sheet rent source", () => {
  it.each(["No", "Yes, completed", "unknown", "$0", "-1"])(
    "keeps %s as missing rent evidence rather than a pricing conflict",
    async (value) => {
      const agree = await desk("$1,250");
      clearLiveLeaseCache();
      const row = await desk(value);
      // S157 (8a3f929d): a missing or unreadable Sheet rent is advisory evidence beside the
      // RentVine amount. It neither coerces the rent nor changes the lease's overall status.
      expect(row.guidance.rentVerification.state).toBe("needs_verification");
      expect(row.guidance.currentBaseRent).toBe(1250);
      expect(row.guidance.overallStatus).toBe(agree.guidance.overallStatus);
      expect(row.guidance.overallStatus).not.toBe("blocked");
    },
  );
  it("retains a valid comparison and an actual numeric disagreement as advisory evidence", async () => {
    const agree = await desk("$1,250");
    expect(agree.guidance.rentVerification.state).toBe("verified");
    clearLiveLeaseCache();
    const conflict = await desk("$1,400");
    expect(conflict.guidance.rentVerification.state).toBe("needs_verification");
    expect(conflict.guidance.currentBaseRent).toBe(1250);
    // S157: the numeric difference is shown, never used to withhold work.
    expect(conflict.guidance.overallStatus).toBe(agree.guidance.overallStatus);
    expect(conflict.guidance.isBlocked).toBe(false);
  });
});
