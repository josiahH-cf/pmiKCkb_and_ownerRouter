import { describe, expect, it } from "vitest";
import {
  batchGetToTables,
  valuesToGrid,
  type SheetsBatchGetResponse,
} from "@/lib/google-sheets/sheet-to-grids";
import {
  readRenewalSheetGrids,
  type SheetsValuesReader,
} from "@/lib/google-sheets/read-client";
import { createGoogleSheetsHealthCheckTransport } from "@/lib/google-sheets/health-probe";
import { getHealthCheckContract, runHealthCheck } from "@/lib/integrations/health-checks";

function fakeReader(
  overrides: Partial<SheetsValuesReader> & { titleCalls?: { n: number } } = {},
): SheetsValuesReader {
  return {
    async listTabTitles() {
      if (overrides.titleCalls) overrides.titleCalls.n += 1;
      return ["Renewals", "Inspection Tracker"];
    },
    async batchGet(_spreadsheetId, ranges) {
      return {
        valueRanges: ranges.map((range) => ({
          range: `${range}!A1:B2`,
          values: [["a", "b"], ["c"]],
        })),
      };
    },
    ...overrides,
  };
}

describe("sheet-to-grids adapter", () => {
  it("coerces every cell to a string and preserves jagged rows", () => {
    expect(valuesToGrid([["a", 1, true, null]])).toEqual([["a", "1", "TRUE", ""]]);
    expect(valuesToGrid([["x"], ["y", "z"]])).toEqual([["x"], ["y", "z"]]);
    expect(valuesToGrid(undefined)).toEqual([]);
  });

  it("turns a batchGet response into one grid per value range", () => {
    const response: SheetsBatchGetResponse = {
      valueRanges: [{ values: [["1"]] }, { values: [["2"], ["3"]] }],
    };
    expect(batchGetToTables(response)).toEqual([[["1"]], [["2"], ["3"]]]);
  });
});

describe("readRenewalSheetGrids", () => {
  it("reads the provided in-scope tabs into RawGrid[]", async () => {
    const result = await readRenewalSheetGrids({
      reader: fakeReader(),
      spreadsheetId: "sheet-id",
      tabTitles: ["Renewals", "Inspection Tracker", "Property Attributes"],
    });
    expect(result.titles).toHaveLength(3);
    expect(result.tables).toHaveLength(3);
    expect(result.tables[0]).toEqual([["a", "b"], ["c"]]);
  });

  it("lists tab titles when none are provided", async () => {
    const titleCalls = { n: 0 };
    const result = await readRenewalSheetGrids({
      reader: fakeReader({ titleCalls }),
      spreadsheetId: "sheet-id",
    });
    expect(titleCalls.n).toBe(1);
    expect(result.titles).toEqual(["Renewals", "Inspection Tracker"]);
    expect(result.tables).toHaveLength(2);
  });
});

describe("createGoogleSheetsHealthCheckTransport", () => {
  const contract = getHealthCheckContract("health.google_sheets.api");
  if (!contract) {
    throw new Error("Expected the health.google_sheets.api contract to exist.");
  }

  it("passes config/auth/probe on a readable sheet", async () => {
    const result = await runHealthCheck(
      contract,
      createGoogleSheetsHealthCheckTransport(fakeReader(), "sheet-id"),
    );
    expect(result.ok).toBe(true);
    expect(result.steps.every((step) => step.ok)).toBe(true);
  });

  it("fails config when no spreadsheet id is configured", async () => {
    const result = await runHealthCheck(
      contract,
      createGoogleSheetsHealthCheckTransport(fakeReader(), ""),
    );
    expect(result.ok).toBe(false);
    expect(result.steps[0]).toMatchObject({ step_id: "google_sheets.config", ok: false });
  });

  it("fails auth when the read throws, and marks the probe not attempted", async () => {
    const throwingReader: SheetsValuesReader = {
      async listTabTitles() {
        throw new Error("permission denied");
      },
      async batchGet() {
        return {};
      },
    };
    const result = await runHealthCheck(
      contract,
      createGoogleSheetsHealthCheckTransport(throwingReader, "sheet-id"),
    );
    expect(result.ok).toBe(false);
    expect(result.steps[1]).toMatchObject({ step_id: "google_sheets.auth", ok: false });
    expect(result.steps[2]).toMatchObject({
      step_id: "google_sheets.probe",
      ok: false,
      detail: "not attempted",
    });
  });
});
