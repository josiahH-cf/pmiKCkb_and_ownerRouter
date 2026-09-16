import { describe, expect, it } from "vitest";

import { cellLinksFromGridData } from "@/lib/google-sheets/read-client";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import {
  classifyRowLinkRepresentation,
  mergeLinkLayers,
  readRenewalSheetGridsWithLinks,
  sheetResponsesToTablesWithJoinIds,
} from "@/lib/lease-renewal/sheet-links";

const LEASE = "https://pmikcmetro.rentvine.com/leases/4821";
const OTHER_LEASE = "https://pmikcmetro.rentvine.com/leases/9";
const MAP_LINK = "https://maps.example/place/1";

// A Sheet cell can carry its RentVine link three ways: a `=HYPERLINK()` formula (the only layer the
// value/FORMULA reads expose), a bare URL as the cell text, or a rich-text link attached to the cell
// or to a run of its text. The third representation is invisible to a FORMULA read, so a row linked
// that way looked unlinked to the app (S116, R116.2).
describe("S116 rich-text link layer (AC-S116-2)", () => {
  it("reads the cell hyperlink and every distinct run link per cell, and never a cell value", () => {
    const links = cellLinksFromGridData({
      sheets: [
        {
          properties: { title: "Lease Renewal" },
          data: [
            {
              rowData: [
                {
                  values: [
                    { hyperlink: LEASE },
                    {
                      textFormatRuns: [
                        { format: { link: { uri: LEASE } } },
                        { format: {} },
                        { format: { link: { uri: LEASE } } },
                        { format: { link: { uri: MAP_LINK } } },
                      ],
                    },
                    {},
                  ],
                },
                {},
              ],
            },
          ],
        },
        { properties: { title: "Other" }, data: [{ rowData: [] }] },
      ],
    });
    expect(links).toEqual({
      "Lease Renewal": [[[LEASE], [LEASE, MAP_LINK], []], []],
      Other: [],
    });
  });

  it("lets a formula link own its cell and uses the single rich link otherwise", () => {
    expect(
      mergeLinkLayers(
        [[OTHER_LEASE, null, null, null]],
        [[[LEASE], [LEASE], [], [MAP_LINK]]],
      ),
    ).toEqual([[OTHER_LEASE, LEASE, null, MAP_LINK]]);
    expect(mergeLinkLayers([[null, null]], undefined)).toEqual([[null, null]]);
    expect(mergeLinkLayers([[null]], [[]])).toEqual([[null]]);
  });

  it("fails closed when one cell carries two different RentVine destinations", () => {
    expect(() => mergeLinkLayers([[null]], [[[LEASE, OTHER_LEASE]]])).toThrow(
      /conflicting link destinations/i,
    );
    // The same lease reached twice is one destination; a non-RentVine link beside it is ignored.
    expect(
      mergeLinkLayers([[null]], [[[LEASE, `${LEASE}?tab=messages`, MAP_LINK]]]),
    ).toEqual([[LEASE]]);
  });

  it("classifies how each row carries its RentVine reference", () => {
    const formulaCell = `=HYPERLINK("${LEASE}","Jordan Maple")`;
    expect(
      classifyRowLinkRepresentation({
        cells: ["Jordan Maple", "$1,250"],
        formulaLinks: [LEASE, null],
        cellLinks: [[], []],
        formulas: [formulaCell, "$1,250"],
      }),
    ).toBe("formula");
    expect(
      classifyRowLinkRepresentation({
        cells: [LEASE, "$1,250"],
        formulaLinks: [null, null],
        cellLinks: [[], []],
        formulas: [LEASE, "$1,250"],
      }),
    ).toBe("bare_url");
    expect(
      classifyRowLinkRepresentation({
        cells: ["Jordan Maple", "$1,250"],
        formulaLinks: [null, null],
        cellLinks: [[LEASE], []],
        formulas: ["Jordan Maple", "$1,250"],
      }),
    ).toBe("rich_text");
    expect(
      classifyRowLinkRepresentation({
        cells: ["Jordan Maple", "$1,250"],
        formulaLinks: [null, null],
        cellLinks: [[MAP_LINK], []],
        formulas: ["Jordan Maple", "$1,250"],
      }),
    ).toBe("none");
  });

  it("joins a row whose only RentVine link is rich text once that layer is supplied", () => {
    const grid = SAMPLE_RENEWAL_TABLES[0].map((row) => [...row]);
    const evaluated = { valueRanges: [{ range: "Lease Renewal", values: grid }] };
    const formulas = { valueRanges: [{ range: "Lease Renewal", values: grid }] };
    const without = sheetResponsesToTablesWithJoinIds(evaluated, formulas);
    expect(without.tableJoinIds[0][1]).toBeNull();

    const rich = grid.map((row) => row.map(() => [] as string[]));
    rich[1][2] = [LEASE];
    const withLayer = sheetResponsesToTablesWithJoinIds(evaluated, formulas, [rich]);
    expect(withLayer.tableJoinIds[0][1]).toBe("lease:4821");
    expect(withLayer.tableRentvineSourceUrls[0][1]).toBe(LEASE);
    expect(withLayer.tables[0][1]).toEqual(grid[1]);
  });

  it("reads the rich link layer through a reader that offers it and still works without one", async () => {
    const grid = SAMPLE_RENEWAL_TABLES[0].map((row) => [...row]);
    const rich = grid.map((row) => row.map(() => [] as string[]));
    rich[1][2] = [LEASE];
    const base = {
      listTabTitles: async () => ["Lease Renewal"],
      batchGet: async () => ({ valueRanges: [{ range: "Lease Renewal", values: grid }] }),
      batchGetFormulas: async () => ({
        valueRanges: [{ range: "Lease Renewal", values: grid }],
      }),
    };
    const plain = await readRenewalSheetGridsWithLinks({
      reader: base,
      spreadsheetId: "sheet-1",
    });
    expect(plain.tableJoinIds[0][1]).toBeNull();

    let requestedTabs: string[] | null = null;
    const linked = await readRenewalSheetGridsWithLinks({
      reader: {
        ...base,
        batchGetRichLinks: async (_id: string, tabTitles: string[]) => {
          requestedTabs = tabTitles;
          return { "Lease Renewal": rich };
        },
      },
      spreadsheetId: "sheet-1",
    });
    expect(requestedTabs).toEqual(["Lease Renewal"]);
    expect(linked.tableJoinIds[0][1]).toBe("lease:4821");
  });
});
