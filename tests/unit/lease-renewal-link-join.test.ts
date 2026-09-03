import { describe, expect, it } from "vitest";
import { ingestTables } from "@/lib/lease-renewal/ingest";
import { runRenewalPipeline, type NonSheetCandidate } from "@/lib/lease-renewal/pipeline";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import {
  formulaResponseToTablesWithJoinIds,
  readRenewalSheetGridsWithLinks,
  sheetResponsesToTablesWithJoinIds,
} from "@/lib/lease-renewal/sheet-links";
import { runFullyLiveRenewalReview } from "@/lib/lease-renewal/live-run";
import { PROOF_NOTE_PREFIX } from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
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

  it("never fuzzy-joins a different explicit lease id even when tenant names match", () => {
    const sameNameWrongLease: NonSheetCandidate = {
      ...candidate,
      joinValue: "Sheet Spelling",
      joinId: "lease:888",
    };
    const run = runRenewalPipeline({
      runId: "tji-3",
      tables,
      nonSheetCandidates: [sameNameWrongLease],
      tableJoinIds: [[null, "lease:777"]],
    });

    expect(run.flags.map((flag) => flag.fieldKey)).not.toContain("current_rent");
    expect(
      run.outcomes
        .find((outcome) => outcome.fieldKey === "current_rent")
        ?.reconciliation.candidates.map((entry) => entry.source),
    ).toEqual(["sheet_tab3"]);
  });

  it("fails a no-id row closed when two leases share its fallback name", () => {
    const sameName = "Shared Household";
    const ambiguousTables = [
      [HEADER, renewalsRow({ [TENANT]: sameName, [CURRENT_RENT]: "$1,300" })],
    ];
    const run = runRenewalPipeline({
      runId: "tji-fuzzy-one-to-many",
      tables: ambiguousTables,
      nonSheetCandidates: [
        { ...candidate, joinId: "lease:1", joinValue: sameName },
        { ...candidate, joinId: "lease:2", joinValue: sameName },
      ],
    });

    const rent = run.outcomes.find((outcome) => outcome.fieldKey === "current_rent");
    expect(rent?.reconciliation.candidates.map((entry) => entry.source)).toEqual([
      "sheet_tab3",
    ]);
    expect(rent?.matchedCandidateJoinIds).toBeUndefined();
  });

  it("counts a same-name lease as ambiguous even when only the other lease carries rent", () => {
    const sameName = "Asymmetric Household";
    const ambiguousTables = [
      [HEADER, renewalsRow({ [TENANT]: sameName, [CURRENT_RENT]: "$1,300" })],
    ];
    const run = runRenewalPipeline({
      runId: "tji-fuzzy-asymmetric-field",
      tables: ambiguousTables,
      nonSheetCandidates: [
        { ...candidate, joinId: "lease:1", joinValue: sameName },
        {
          ...candidate,
          joinId: "lease:2",
          joinValue: sameName,
          fields: { renewal_date: { value: "2026-08-31", confidence: "Verified" } },
        },
      ],
    });

    const rent = run.outcomes.find((outcome) => outcome.fieldKey === "current_rent");
    expect(rent?.reconciliation.candidates.map((entry) => entry.source)).toEqual([
      "sheet_tab3",
    ]);
    expect(rent?.matchedCandidateJoinIds).toBeUndefined();
    expect(run.flags.map((flag) => flag.fieldKey)).not.toContain("current_rent");
  });

  it("fails a no-id lease closed when two Sheet rows share its fallback name", () => {
    const sameName = "Repeated Household";
    const ambiguousTables = [
      [
        HEADER,
        renewalsRow({ [TENANT]: sameName, [CURRENT_RENT]: "$1,300" }),
        renewalsRow({ [TENANT]: sameName, [CURRENT_RENT]: "$1,350" }),
      ],
    ];
    const run = runRenewalPipeline({
      runId: "tji-fuzzy-many-to-one",
      tables: ambiguousTables,
      nonSheetCandidates: [{ ...candidate, joinId: "lease:1", joinValue: sameName }],
    });

    expect(
      run.outcomes
        .filter((outcome) => outcome.fieldKey === "current_rent")
        .every(
          (outcome) =>
            outcome.reconciliation.candidates.length === 1 &&
            outcome.reconciliation.candidates[0].source === "sheet_tab3",
        ),
    ).toBe(true);
  });

  it("fails duplicate exact Sheet ids closed instead of selecting the first row", () => {
    const duplicateIdTables = [
      [
        HEADER,
        renewalsRow({ [TENANT]: "First", [CURRENT_RENT]: "$1,300" }),
        renewalsRow({ [TENANT]: "Second", [CURRENT_RENT]: "$1,350" }),
      ],
    ];
    const run = runRenewalPipeline({
      runId: "tji-duplicate-id",
      tables: duplicateIdTables,
      nonSheetCandidates: [candidate],
      tableJoinIds: [[null, "lease:777", "lease:777"]],
    });

    expect(
      run.outcomes
        .filter((outcome) => outcome.fieldKey === "current_rent")
        .every((outcome) => outcome.matchedCandidateJoinIds === undefined),
    ).toBe(true);
  });

  it("binds the candidate fingerprint to the exact lease identity", () => {
    const sameName = "Stable Household";
    const identityTables = [
      [HEADER, renewalsRow({ [TENANT]: sameName, [CURRENT_RENT]: "$1,300" })],
    ];
    const fingerprintFor = (joinId: string) =>
      runRenewalPipeline({
        runId: "tji-fingerprint",
        tables: identityTables,
        nonSheetCandidates: [
          {
            ...candidate,
            joinId,
            joinValue: sameName,
            fields: { current_rent: { value: 1400, confidence: "Verified" } },
          },
        ],
      }).outcomes.find((outcome) => outcome.fieldKey === "current_rent")!;

    const first = fingerprintFor("lease:1");
    const second = fingerprintFor("lease:2");
    expect(first.matchedCandidateJoinIds).toEqual(["lease:1"]);
    expect(second.matchedCandidateJoinIds).toEqual(["lease:2"]);
    expect(first.candidateFingerprint).not.toBe(second.candidateFingerprint);
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
    const { tables, tableJoinIds, tableRentvineSourceUrls } =
      formulaResponseToTablesWithJoinIds(response);
    expect(tables[0][1][0]).toBe("Guy"); // display text, not the formula
    expect(tableJoinIds[0]).toEqual([null, "lease:5", null]);
    expect(tableRentvineSourceUrls[0]).toEqual([
      null,
      "https://pmikcmetro.rentvine.com/leases/5",
      null,
    ]);
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

const EVALUATED_RESPONSE: SheetsBatchGetResponse = {
  valueRanges: [
    {
      range: "Lease Renewal",
      values: [
        HEADER.map((h) => h),
        renewalsRow({ [TENANT]: "Guy", [CURRENT_RENT]: "$1,100" }),
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
      return EVALUATED_RESPONSE;
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
    expect(read.tableRentvineSourceUrls[0]).toContain(
      "https://pmikcmetro.rentvine.com/leases/5",
    );
  });

  it("keeps an ordinary formula's evaluated value while extracting hyperlinks", () => {
    const evaluated: SheetsBatchGetResponse = {
      valueRanges: [
        {
          range: "Lease Renewal",
          values: [
            ["Tenant", "Rent"],
            ["Guy", "$1,225"],
          ],
        },
      ],
    };
    const formulas: SheetsBatchGetResponse = {
      valueRanges: [
        {
          range: "Lease Renewal",
          values: [
            ["Tenant", "Rent"],
            [
              '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/5","Guy")',
              "=SUM(1200,25)",
            ],
          ],
        },
      ],
    };
    const read = sheetResponsesToTablesWithJoinIds(evaluated, formulas);
    expect(read.tables[0][1]).toEqual(["Guy", "$1,225"]);
    expect(read.tableJoinIds[0][1]).toBe("lease:5");
  });

  it("fails the Sheet read closed when one row links to two different leases", () => {
    const evaluated: SheetsBatchGetResponse = {
      valueRanges: [
        {
          range: "Lease Renewal",
          values: [
            ["Tenant", "RentVine"],
            ["Guy", "Open"],
          ],
        },
      ],
    };
    const formulas: SheetsBatchGetResponse = {
      valueRanges: [
        {
          range: "Lease Renewal",
          values: [
            ["Tenant", "RentVine"],
            [
              '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/5","Guy")',
              '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/6","Open")',
            ],
          ],
        },
      ],
    };

    expect(() => sheetResponsesToTablesWithJoinIds(evaluated, formulas)).toThrow(
      /multiple RentVine lease destinations/,
    );
  });

  it("drops proof-marked rows (and their join ids) when the note layer is present", async () => {
    const reader: SheetsValuesReader = {
      async listTabTitles() {
        return ["Lease Renewal"];
      },
      async batchGet() {
        return {
          valueRanges: [
            {
              range: "Lease Renewal",
              values: [
                HEADER.map((h) => h),
                renewalsRow({ [TENANT]: "Guy" }),
                renewalsRow({ [TENANT]: "Proof Only" }),
              ],
            },
          ],
        };
      },
      async batchGetFormulas() {
        return {
          valueRanges: [
            {
              range: "Lease Renewal",
              values: [
                HEADER.map((h) => h),
                renewalsRow({
                  [TENANT]:
                    '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/5","Guy")',
                }),
                renewalsRow({
                  [TENANT]:
                    '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/115","Proof Only")',
                }),
              ],
            },
          ],
        };
      },
      async batchGetNotes() {
        return {
          "Lease Renewal": [
            [],
            ["PMI KC writeback — operation op-1 — lease 5 — property 9"],
            [
              `${PROOF_NOTE_PREFIX}PMI KC writeback — operation op-2 — lease 115 — property 84`,
            ],
          ],
        };
      },
    };
    const read = await readRenewalSheetGridsWithLinks({
      reader,
      spreadsheetId: "sheet-id",
      tabTitles: ["Lease Renewal"],
    });
    expect(read.tables[0]).toHaveLength(2); // header + the one normal row
    expect(read.tableJoinIds[0]).toEqual([null, "lease:5"]);
    expect(read.tableRentvineSourceUrls[0]).toEqual([
      null,
      "https://pmikcmetro.rentvine.com/leases/5",
    ]);
    expect(JSON.stringify(read.tables)).not.toContain("Proof Only");
  });

  it("changes nothing for a reader without the note layer", async () => {
    const read = await readRenewalSheetGridsWithLinks({
      reader: readerWithFormulas(),
      spreadsheetId: "sheet-id",
      tabTitles: ["Lease Renewal"],
    });
    expect(read.tables[0]).toHaveLength(2);
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
    async listAllLeasesExport() {
      return {
        rows: [
          {
            lease: { leaseID: 5, endDate: "2026-08-31", tenants: [{ name: "Guy" }] },
            unit: { rent: "1100" },
          },
          {
            lease: { leaseID: 9, endDate: "2026-12-31", tenants: [{ name: "Out" }] },
            unit: { rent: "1000" },
          },
        ],
        pages: 1,
        complete: true,
      };
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
