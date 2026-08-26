import { describe, expect, it, vi } from "vitest";

import {
  RentVineWriteClient,
  type RentVineWriteHttpRequest,
  type RentVineWriteHttpTransport,
} from "@/lib/integrations/rentvine/write-client";
import {
  buildRentVineRenewalDryRunPreview,
  RentVineRenewalDryRunProvider,
} from "@/lib/lease-renewal/rentvine-write-preview";
import {
  classifyDiscrepancy,
  DISCREPANCY_CATEGORIES,
} from "@/lib/lease-renewal/discrepancy";
import {
  proveRehearsalSheetRoundTrip,
  resolveRenewalSheetBindings,
} from "@/lib/lease-renewal/rehearsal-sheet";
import { parseCurrencyInput } from "@/lib/currency-input";

const BASE_URL = "https://pmikcmetro.rentvine.com/api/manager";

describe("2026-08-26 meeting-readiness behavior outcome", () => {
  it("constructs only the two documented RentVine POST routes and never executes a dry run", async () => {
    const requests: RentVineWriteHttpRequest[] = [];
    const transport: RentVineWriteHttpTransport = {
      send: vi.fn(async (request) => {
        requests.push(request);
        return {
          status: 200,
          headers: {},
          text: async () => "{}",
          json: async () => ({}),
        };
      }),
    };
    const client = new RentVineWriteClient(
      { baseUrl: BASE_URL, apiKey: "fixture", apiSecret: "fixture" },
      transport,
    );

    await client.updateLease("42", {
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    await client.updateExistingRecurringCharge("42", "7", {
      amount: "1234.00",
      startDate: "01/01/2027",
    });

    expect(requests.map(({ method, url }) => [method, new URL(url).pathname])).toEqual([
      ["POST", "/api/manager/leases/42"],
      ["POST", "/api/manager/leases/42/recurring-charges/7"],
    ]);

    const preview = buildRentVineRenewalDryRunPreview({
      leaseId: "42",
      current: { startDate: "2026-01-01", endDate: "2026-12-31" },
      proposed: { endDate: "2027-12-31" },
      recurringCharge: {
        chargeId: "7",
        currentAmount: "1200.00",
        proposedAmount: "1234.00",
        effectiveDate: "2027-01-01",
      },
    });
    expect(preview.executionAllowed).toBe(false);
    expect(preview.steps).toHaveLength(2);
    expect(new RentVineRenewalDryRunProvider().preview(preview)).toEqual(preview);
    expect(() => new RentVineRenewalDryRunProvider().execute()).toThrow(
      /dry-run provider/i,
    );
  });

  it("classifies every dual-source discrepancy without exposing record values", () => {
    expect(DISCREPANCY_CATEGORIES).toEqual([
      "agree",
      "conflict",
      "rentvine_only",
      "sheet_only",
      "missing",
      "intentional_semantic_difference",
      "stale_snapshot",
      "identity_ambiguous",
    ]);
    expect(
      classifyDiscrepancy({
        rentvinePresent: true,
        sheetPresent: true,
        valuesEqual: true,
      }),
    ).toBe("agree");
    expect(
      classifyDiscrepancy({
        rentvinePresent: true,
        sheetPresent: true,
        valuesEqual: false,
      }),
    ).toBe("conflict");
    expect(classifyDiscrepancy({ rentvinePresent: false, sheetPresent: false })).toBe(
      "missing",
    );
    expect(
      classifyDiscrepancy({
        rentvinePresent: true,
        sheetPresent: true,
        valuesEqual: false,
        identityAmbiguous: true,
      }),
    ).toBe("identity_ambiguous");
  });

  it("refuses an operating-Sheet alias and round-trips only an empty rehearsal-copy cell", async () => {
    expect(
      resolveRenewalSheetBindings({
        RENEWAL_SHEET_ID: "operating-sheet",
        RENEWAL_REHEARSAL_SHEET_ID: "operating-sheet",
      }).rehearsal.status,
    ).toBe("same_as_operating");

    let cell = "";
    const writer = {
      getValues: vi.fn(async () => (cell ? [[cell]] : [])),
      writeValuesIfEmpty: vi.fn(async (_id: string, _range: string, value: string) => {
        if (cell) return false;
        cell = value;
        return true;
      }),
      clearValuesIfExactMatch: vi.fn(
        async (_id: string, _range: string, expected: string) => {
          if (cell !== expected) return false;
          cell = "";
          return true;
        },
      ),
    };
    await expect(
      proveRehearsalSheetRoundTrip(writer, {
        operatingSpreadsheetId: "operating-sheet",
        rehearsalSpreadsheetId: "rehearsal-copy",
        range: "Lease Renewal!ZZ1",
        marker: "PMI_REHEARSAL_PROBE_SYNTHETIC",
      }),
    ).resolves.toMatchObject({ status: "proved", restored: true });
    expect(cell).toBe("");
  });

  it("accepts human currency formatting and rejects ambiguous or negative input", () => {
    expect(parseCurrencyInput("$1,500.25")).toEqual({ ok: true, value: 1500.25 });
    expect(parseCurrencyInput(" 1500 ")).toEqual({ ok: true, value: 1500 });
    expect(parseCurrencyInput("1,50").ok).toBe(false);
    expect(parseCurrencyInput("-10").ok).toBe(false);
    expect(parseCurrencyInput("ten dollars").ok).toBe(false);
  });
});
