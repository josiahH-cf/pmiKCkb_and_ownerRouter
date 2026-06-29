import { describe, expect, it } from "vitest";
import {
  runFullyLiveRenewalReview,
  runLiveRenewalReview,
} from "@/lib/lease-renewal/live-run";
import type { SheetsValuesReader } from "@/lib/google-sheets/read-client";

const READ_TS = "2026-06-20T00:00:00.000Z";

// Fake export rows shaped like the live /leases/export response (keys confirmed live; values
// synthetic). Jordan agrees with the sample sheet; Casey conflicts on timing + rent.
const EXPORT_ROWS = [
  {
    lease: { leaseID: 1, endDate: "2026-08-31", tenants: [{ name: "Jordan Maple" }] },
    unit: { rent: "1250.00" },
  },
  {
    lease: { leaseID: 2, endDate: "2026-09-01", tenants: [{ name: "Casey Rivers" }] },
    unit: { rent: "1400.00" },
  },
];

function fakeClient(rows: Record<string, unknown>[]) {
  return {
    async listLeasesExport(): Promise<Record<string, unknown>[]> {
      return rows;
    },
  };
}

describe("runLiveRenewalReview", () => {
  it("maps the live read and keeps the run non-executable", async () => {
    const { run, liveRentvineCandidates, skippedLeases } = await runLiveRenewalReview({
      rentvineClient: fakeClient(EXPORT_ROWS),
      runId: "live-1",
      readTimestamp: READ_TS,
    });

    expect(liveRentvineCandidates).toBe(2);
    expect(skippedLeases).toBe(0);
    expect(run.production_allowed).toBe(false);
    // Manifest passes through counts-only (no client values).
    expect(typeof run.manifest).toBe("object");
  });

  it("replaces the synthetic Rentvine candidates while the other synthetic sources survive", async () => {
    const { run } = await runLiveRenewalReview({
      rentvineClient: fakeClient(EXPORT_ROWS),
      runId: "live-2",
      readTimestamp: READ_TS,
    });

    // Live Casey conflict -> High on current_rent (the live Rentvine read). The lease-end date no longer
    // conflicts with the sheet's "Renewal Date" worklog column (F-RENEWAL-DATE-SEMANTICS: RentVine's
    // lease-end is mapped to lease_end_date, which has no reconciliation spec).
    const highKeys = run.bySeverity.High.map((outcome) => outcome.fieldKey);
    expect(highKeys).toContain("current_rent");
    expect(highKeys).not.toContain("renewal_date");

    // The synthetic building-level (lawn_care High) and Google-Form (tenant_responded Blocked)
    // candidates survive — proving only the source:"rentvine" entries were swapped.
    expect(highKeys).toContain("lawn_care");
    expect(run.bySeverity.Blocked.map((outcome) => outcome.fieldKey)).toContain(
      "tenant_responded",
    );
  });

  it("does not leak a tenant name or rent into the counts-only manifest", async () => {
    const { run } = await runLiveRenewalReview({
      rentvineClient: fakeClient(EXPORT_ROWS),
      runId: "live-3",
      readTimestamp: READ_TS,
    });
    const manifestText = JSON.stringify(run.manifest);
    expect(manifestText).not.toContain("Jordan");
    expect(manifestText).not.toContain("Casey");
    expect(manifestText).not.toContain("1400");
  });
});

describe("runFullyLiveRenewalReview", () => {
  const sheetsReader: SheetsValuesReader = {
    async listTabTitles() {
      return ["Renewals", "Property Attributes"];
    },
    async batchGet(_spreadsheetId, ranges) {
      return {
        valueRanges: ranges.map((range) => ({
          range,
          values: [["Header"], ["row"]],
        })),
      };
    },
  };

  it("composes both live reads: sheet tables + Rentvine candidates, no writes", async () => {
    const result = await runFullyLiveRenewalReview({
      rentvineClient: fakeClient(EXPORT_ROWS),
      sheetsReader,
      spreadsheetId: "sheet-id",
      tabTitles: ["Renewals", "Property Attributes"],
      runId: "full-live-1",
      readTimestamp: READ_TS,
    });

    expect(result.sheetTabsRead).toBe(2);
    expect(result.liveRentvineCandidates).toBe(2);
    expect(result.run.production_allowed).toBe(false);
  });
});
