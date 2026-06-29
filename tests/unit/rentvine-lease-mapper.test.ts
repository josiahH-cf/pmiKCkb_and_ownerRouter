import { describe, expect, it } from "vitest";
import {
  DEFAULT_RENTVINE_LEASE_FIELD_MAP,
  RENTVINE_SOURCE,
  RENTVINE_SOURCE_SYSTEM,
  mapLeasesToNonSheetCandidates,
} from "@/lib/integrations/rentvine/lease-mapper";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import { runRenewalPipeline } from "@/lib/lease-renewal/pipeline";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";

const READ_TS = "2026-06-20T00:00:00.000Z";

describe("mapLeasesToNonSheetCandidates", () => {
  it("maps a lease with the default keys to the synthetic-identical candidate shape", () => {
    const leases: RawLease[] = [
      { leaseID: 7, tenantName: "Jordan Maple", endDate: "2026-08-31", rent: 1250 },
    ];
    const result = mapLeasesToNonSheetCandidates(leases, { readTimestamp: READ_TS });

    expect(result.total).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.resolvedKeys).toEqual({
      tenantName: "tenantName",
      renewalDate: "endDate",
      currentRent: "rent",
    });
    expect(result.candidates[0]).toEqual({
      source: RENTVINE_SOURCE,
      source_system: RENTVINE_SOURCE_SYSTEM,
      joinKind: "name",
      joinValue: "Jordan Maple",
      // Exact RentVine-id join key (from leaseID) — matches a sheet row's hyperlink id.
      joinId: "lease:7",
      read_timestamp: READ_TS,
      fields: {
        lease_end_date: { value: "2026-08-31", raw: "2026-08-31", confidence: "Verified" },
        current_rent: { value: 1250, raw: "1250", confidence: "Verified" },
      },
    });
  });

  it("absorbs alternate key names and US date / $ rent formats", () => {
    const leases: RawLease[] = [
      {
        expirationDate: "08/31/2026",
        rentAmount: "$1,300.00",
        primaryTenantName: "Casey Rivers",
      },
    ];
    const result = mapLeasesToNonSheetCandidates(leases, { readTimestamp: READ_TS });

    expect(result.candidates[0].joinValue).toBe("Casey Rivers");
    expect(result.candidates[0].fields.lease_end_date.value).toBe("2026-08-31");
    expect(result.candidates[0].fields.current_rent.value).toBe(1300);
    expect(result.resolvedKeys).toEqual({
      tenantName: "primaryTenantName",
      renewalDate: "expirationDate",
      currentRent: "rentAmount",
    });
  });

  it("resolves a tenant name from a nested tenants[] array (export shape)", () => {
    const leases: RawLease[] = [
      {
        endDate: "2026-08-31",
        rent: 1250,
        tenants: [{ firstName: "Jordan", lastName: "Maple" }],
      },
    ];
    const result = mapLeasesToNonSheetCandidates(leases, { readTimestamp: READ_TS });
    expect(result.candidates[0].joinValue).toBe("Jordan Maple");
    expect(result.resolvedKeys.tenantName).toBe("tenants[0].firstName+lastName");
  });

  it("skips and counts a lease missing a tenant name, or missing both fields", () => {
    const leases: RawLease[] = [
      { endDate: "2026-08-31", rent: 1250 }, // no tenant
      { tenantName: "No Fields" }, // no reconcilable field
    ];
    const result = mapLeasesToNonSheetCandidates(leases, { readTimestamp: READ_TS });
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toBe(2);
  });

  it("is deterministic for the same input and timestamp", () => {
    const leases: RawLease[] = [
      { tenantName: "Jordan Maple", endDate: "2026-08-31", rent: 1250 },
    ];
    const a = mapLeasesToNonSheetCandidates(leases, { readTimestamp: READ_TS });
    const b = mapLeasesToNonSheetCandidates(leases, { readTimestamp: READ_TS });
    expect(a).toEqual(b);
  });

  it("uses the configurable field map without code changes", () => {
    const leases: RawLease[] = [
      { who: "Jordan Maple", through: "2026-08-31", price: 1250 },
    ];
    const result = mapLeasesToNonSheetCandidates(leases, {
      readTimestamp: READ_TS,
      fieldMap: { tenantName: ["who"], renewalDate: ["through"], currentRent: ["price"] },
    });
    expect(result.candidates[0].joinValue).toBe("Jordan Maple");
    expect(result.candidates[0].fields.lease_end_date.value).toBe("2026-08-31");
    expect(result.candidates[0].fields.current_rent.value).toBe(1250);
  });
});

describe("live mapper feeds runRenewalPipeline unchanged", () => {
  it("reproduces the synthetic outcome: Casey conflicts High, Jordan agrees, no writes", () => {
    // Same values the synthetic Rentvine candidates carry, but produced by the live mapper.
    const leases: RawLease[] = [
      { tenantName: "Jordan Maple", endDate: "2026-08-31", rent: 1250 }, // agrees with the sheet
      { tenantName: "Casey Rivers", endDate: "2026-09-01", rent: 1400 }, // conflicts (timing + financial)
    ];
    const { candidates } = mapLeasesToNonSheetCandidates(leases, {
      readTimestamp: READ_TS,
      fieldMap: DEFAULT_RENTVINE_LEASE_FIELD_MAP,
    });

    const result = runRenewalPipeline({
      runId: "live-test",
      tables: SAMPLE_RENEWAL_TABLES,
      nonSheetCandidates: candidates,
    });

    expect(result.production_allowed).toBe(false);

    // Casey's RENT conflict is High; the lease-end date no longer conflicts with the sheet's "Renewal
    // Date" worklog column (F-RENEWAL-DATE-SEMANTICS — RentVine's lease-end maps to lease_end_date, which
    // has no reconciliation spec, so it never flags the sheet's renewal worklog). Jordan agrees → no flag.
    const highFieldKeys = result.bySeverity.High.map(
      (outcome) => outcome.fieldKey,
    ).sort();
    expect(highFieldKeys).toEqual(["current_rent"]);
  });
});
