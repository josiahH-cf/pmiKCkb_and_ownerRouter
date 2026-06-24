import { describe, expect, it } from "vitest";
import { ingestTables } from "@/lib/lease-renewal/ingest";
import { runRenewalPipeline, type NonSheetCandidate } from "@/lib/lease-renewal/pipeline";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import {
  formulaResponseToTablesWithJoinIds,
  readRenewalSheetGridsWithLinks,
} from "@/lib/lease-renewal/sheet-links";
import { runFullyLiveRenewalReview } from "@/lib/lease-renewal/live-run";
import type { SheetsValuesReader } from "@/lib/google-sheets/read-client";
import type { SheetsBatchGetResponse } from "@/lib/google-sheets/sheet-to-grids";

const HEADER = SAMPLE_RENEWAL_TABLES[0][0] as readonly string[];
const WIDTH = HEADER.length;
const col = (needle: string): number =>
  HEADER.findIndex((h) => h.toLowerCase().includes(needle));
const TENANT = col("tenant name");
const CURRENT_RENT = col("current rent");

function renewalsRow(overrides: Record<number, string>): string[] {
  const row = Array.from({ length: WIDTH }, () => "");
  for (const [index, value] of Object.entries(overrides)) row[Number(index)] = value;
  return row;
}

describe("ingest threads per-row RentVine join ids onto records", () => {
  it("attaches joinId from tableJoinIds (aligned by original row)", () => {
    const grid = [
      HEADER,
      renewalsRow({ [TENANT]: "Row One" }),
      renewalsRow({ [TENANT]: "Row Two" }),
    ];
    const { records } = ingestTables([grid], [[null, "lease:1", "lease:2"]]);
    expect(records.map((r) => r.joinId)).toEqual(["lease:1", "lease:2"]);
  });

  it("carries the link with the row across a re-stitched fragment", () => {
    const headerPlusOne = [HEADER, renewalsRow({ [TENANT]: "Row One" })];
    const continuation = [renewalsRow({ [TENANT]: "Row Two" })];
    const { records } = ingestTables(
      [headerPlusOne, continuation],
      [[null, "lease:1"], ["lease:2"]],
    );
    expect(records).toHaveLength(2);
    expect(records[1].joinId).toBe("lease:2");
  });

  it("leaves joinId undefined when no link layer is supplied (prior behavior)", () => {
    const grid = [HEADER, renewalsRow({ [TENANT]: "Row One" })];
    const { records } = ingestTables([grid]);
    expect(records[0].joinId).toBeUndefined();
  });
});

describe("pipeline id-join via tableJoinIds (record.joinId)", () => {
  const tables = [
    [HEADER, renewalsRow({ [TENANT]: "Sheet Spelling", [CURRENT_RENT]: "$1,300" })],
  ];
  const candidate: NonSheetCandidate = {
    source: "rentvine",
    source_system: "Rentvine (read-authoritative)",
    joinKind: "name",
    joinValue: "Completely Different Name",
    joinId: "lease:777",
    fields: { current_rent: { value: 1400, confidence: "Verified" } },
  };

  it("joins by the row's threaded id and surfaces the conflict the name join would miss", () => {
    const run = runRenewalPipeline({
      runId: "tji-1",
      tables,
      nonSheetCandidates: [candidate],
      tableJoinIds: [[null, "lease:777"]],
    });
    expect(run.flags.map((f) => f.fieldKey)).toContain("current_rent");
  });

  it("misses without the link (fuzzy name join only)", () => {
    const run = runRenewalPipeline({
      runId: "tji-2",
      tables,
      nonSheetCandidates: [candidate],
    });
    expect(run.flags.map((f) => f.fieldKey)).not.toContain("current_rent");
  });
});

describe("formulaResponseToTablesWithJoinIds", () => {
  it("splits a FORMULA response into display grids + per-row RentVine ids", () => {
    const response: SheetsBatchGetResponse = {
      valueRanges: [
        {
          range: "Renewals",
          values: [
            ["Tenant", "Rent"],
            ['=HYPERLINK("https://pmikcmetro.rentvine.com/leases/5","Guy")', "$1,100"],
            ["No link here", "$900"],
          ],
        },
      ],
    };
    const { tables, tableJoinIds } = formulaResponseToTablesWithJoinIds(response);
    expect(tables[0][1][0]).toBe("Guy"); // display text, not the formula
    expect(tableJoinIds[0]).toEqual([null, "lease:5", null]);
  });
});

const FORMULA_RESPONSE: SheetsBatchGetResponse = {
  valueRanges: [
    {
      range: "Lease Renewal",
      values: [
        HEADER.map((h) => h),
        renewalsRow({
          [TENANT]: '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/5","Guy")',
          [CURRENT_RENT]: "$1,100",
        }),
      ],
    },
  ],
};

function readerWithFormulas(): SheetsValuesReader {
  return {
    async listTabTitles() {
      return ["Lease Renewal"];
    },
    async batchGet() {
      return { valueRanges: [] };
    },
    async batchGetFormulas() {
      return FORMULA_RESPONSE;
    },
  };
}

describe("readRenewalSheetGridsWithLinks", () => {
  it("reads the hyperlink layer into tables + join ids", async () => {
    const read = await readRenewalSheetGridsWithLinks({
      reader: readerWithFormulas(),
      spreadsheetId: "sheet-id",
      tabTitles: ["Lease Renewal"],
    });
    expect(read.titles).toEqual(["Lease Renewal"]);
    expect(read.tableJoinIds[0]).toContain("lease:5");
  });

  it("throws on a reader without a FORMULA read", async () => {
    const reader: SheetsValuesReader = {
      async listTabTitles() {
        return [];
      },
      async batchGet() {
        return { valueRanges: [] };
      },
    };
    await expect(
      readRenewalSheetGridsWithLinks({ reader, spreadsheetId: "x", tabTitles: ["t"] }),
    ).rejects.toThrow(/FORMULA read/);
  });
});

describe("runFullyLiveRenewalReview with linkJoin + cohort forwarding", () => {
  const rentvineClient = {
    async listLeasesExport() {
      return [
        {
          lease: { leaseID: 5, endDate: "2026-08-31", tenants: [{ name: "Guy" }] },
          unit: { rent: "1100" },
        },
        {
          lease: { leaseID: 9, endDate: "2026-12-31", tenants: [{ name: "Out" }] },
          unit: { rent: "1000" },
        },
      ];
    },
  };

  it("reads the link layer, forwards the cohort filter, and stays non-executable", async () => {
    const result = await runFullyLiveRenewalReview({
      rentvineClient,
      sheetsReader: readerWithFormulas(),
      spreadsheetId: "sheet-id",
      tabTitles: ["Lease Renewal"],
      runId: "full-link-1",
      readTimestamp: "2026-06-24T00:00:00.000Z",
      linkJoin: true,
      cohortWindows: [{ startIso: "2026-08-01", endIso: "2026-09-30" }],
    });

    expect(result.sheetTabsRead).toBe(1);
    expect(result.run.production_allowed).toBe(false);
    // The cohort filter ran: only the Aug month-end lease is actionable (the Dec lease is out of window).
    expect(result.cohort?.summary.actionable).toBe(1);
    expect(result.cohort?.summary.outOfWindow).toBe(1);
    // Only the actionable lease was mapped to a candidate.
    expect(result.liveRentvineCandidates).toBe(1);
  });
});
