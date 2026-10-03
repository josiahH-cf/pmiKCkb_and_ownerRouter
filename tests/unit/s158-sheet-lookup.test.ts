import { describe, expect, it } from "vitest";

import type { SheetsValuesReader } from "@/lib/google-sheets/read-client";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import {
  OPERATOR_UNSELECTED_JOIN_PREFIX,
  applyOperatorRowBindings,
  sheetLookupBinding,
  sheetRowBindingsFromWorkingRecords,
  type OperatingSheetLookupBinding,
} from "@/lib/lease-renewal/sheet-lookup";
import { readOperatingSheetLookup } from "@/lib/lease-renewal/sheet-lookup-read";
import {
  describeOperatorSelectionLimit,
  resolveOperatorSheetTarget,
} from "@/lib/lease-renewal/sheet-writeback/lookup-target";
import {
  normalRowNote,
  proofRowNote,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import {
  SheetWorkspaceResolutionError,
  effectForSheetFieldIntent,
  type FreshOperatingSheetLeaseContext,
} from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
import {
  parseWorkingFieldValue,
  workingFieldKind,
  type RenewalWorkingRecord,
} from "@/lib/lease-renewal/working-record";

// S158: an operator can point the app at the actual tab and row, or at one cell for one existing
// field, inside the configured workbook. The selection is an app save plus a provider read. It is
// labelled as an operator selection, never as a match, and it never widens what may be written.
// Every value below is synthetic.

const HEADER = SAMPLE_RENEWAL_TABLES[0][0] as readonly string[];
const WIDTH = HEADER.length;
const column = (phrase: string) =>
  HEADER.findIndex((cell) => cell.toLowerCase().includes(phrase));
const TENANT = column("tenant name");
const RENT = column("current rent");
const MARKET = column("market value");
const letters = (index: number) => String.fromCharCode(65 + index);

function row(tenant: string, rent = "$1,250", market = ""): string[] {
  const cells = Array.from({ length: WIDTH }, () => "");
  cells[TENANT] = tenant;
  cells[RENT] = rent;
  cells[MARKET] = market;
  return cells;
}
const noNotes = (rows: number): (string | null)[][] =>
  Array.from({ length: rows }, () => Array.from({ length: WIDTH }, () => null));

const SELECTED_AT = "2026-10-02T15:00:00.000Z";
function workingRecord(
  fields: Record<string, unknown>,
  leaseId = "4821",
): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId,
    revision: Object.keys(fields).length,
    fields: Object.fromEntries(
      Object.entries(fields).map(([field, value], index) => [
        field,
        {
          value: value as never,
          revision: index + 1,
          eventId: `0f1c8f6e-6d1c-4bd3-9d7a-00000000000${index + 1}`,
          recordedAt: SELECTED_AT,
          recordedByUid: "editor-1",
          recordedByLabel: "editor1@pmikcmetro.com",
          origin: "staff_entry" as const,
        },
      ]),
    ),
  };
}

function binding(fields: Record<string, unknown>): OperatingSheetLookupBinding {
  return sheetLookupBinding(workingRecord(fields));
}

/** A read-only workbook double: it records every requested range and holds no write method. */
function workbook(tabs: Record<string, string[][]>, failing: string[] = []) {
  const requested: string[] = [];
  const reader: SheetsValuesReader = {
    async listTabTitles() {
      return Object.keys(tabs);
    },
    async batchGet(_spreadsheetId, ranges) {
      requested.push(...ranges);
      return {
        valueRanges: ranges.map((range) => {
          if (failing.some((fragment) => range.includes(fragment)))
            throw new Error("Sheets values read failed (HTTP 400).");
          const match = /^'((?:[^']|'')+)'!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(range);
          if (!match) throw new Error(`unsupported fake range ${range}`);
          const grid = tabs[match[1].replaceAll("''", "'")];
          if (!grid) throw new Error("Sheets values read failed (HTTP 400).");
          const index = (value: string) =>
            [...value].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
          const startColumn = index(match[2]);
          const startRow = Number(match[3]);
          const endColumn = match[4] ? index(match[4]) : startColumn;
          const endRow = match[5] ? Number(match[5]) : startRow;
          const values: string[][] = [];
          for (let r = startRow; r <= Math.min(endRow, grid.length); r += 1)
            values.push((grid[r - 1] ?? []).slice(startColumn, endColumn + 1));
          return { range, values };
        }),
      };
    },
  };
  return { reader, requested };
}

describe("S158 lookup binding (ARCH-S158-1)", () => {
  it("BEH-S158-2: accepts a row for the lease and a cell only for an existing recognized field", () => {
    expect(workingFieldKind("sheet_row")).toBe("sheet_row");
    expect(workingFieldKind("sheet_cell.market_value")).toBe("sheet_cell");
    expect(workingFieldKind("sheet_cell.current_rent")).toBe("sheet_cell");
    // Identity, audience-email and invented fields are not selectable cell fields.
    for (const field of ["tenant_name", "owner_emails", "unit_notes", "anything_else"])
      expect(workingFieldKind(`sheet_cell.${field}`)).toBeNull();
    expect(
      parseWorkingFieldValue("sheet_row", { tabTitle: "Renewals 2026", rowNumber: 14 }),
    ).toEqual({ ok: true, value: { tabTitle: "Renewals 2026", rowNumber: 14 } });
    expect(
      parseWorkingFieldValue("sheet_cell.market_value", {
        tabTitle: "Renewals 2026",
        cell: "G42",
      }).ok,
    ).toBe(true);
    // A workbook id, a range, a formula or a URL is never part of a selection.
    for (const bad of [
      { tabTitle: "Renewals 2026", cell: "G42:H44" },
      { tabTitle: "Renewals 2026", cell: "=G42" },
      { tabTitle: "Renewals 2026", cell: "G42", spreadsheetId: "another-workbook" },
    ])
      expect(parseWorkingFieldValue("sheet_cell.market_value", bad).ok).toBe(false);
    expect(
      parseWorkingFieldValue("sheet_row", {
        tabTitle: "Renewals 2026",
        rowNumber: 14,
        spreadsheetId: "another-workbook",
      }).ok,
    ).toBe(false);
  });

  it("BEH-S158-4/5: projects the saved selection with who selected it and when, and nothing else", () => {
    const projected = binding({
      sheet_row: { tabTitle: "Renewals 2026", rowNumber: 14 },
      "sheet_cell.market_value": { tabTitle: "Rent Notes", cell: "C7" },
      current_rent: 1850,
    });
    expect(projected.row).toEqual({
      value: { tabTitle: "Renewals 2026", rowNumber: 14 },
      selectedBy: "editor1@pmikcmetro.com",
      selectedAtIso: SELECTED_AT,
      revision: 1,
    });
    expect(Object.keys(projected.cells)).toEqual(["market_value"]);
    expect(projected.cells.market_value?.value).toEqual({
      tabTitle: "Rent Notes",
      cell: "C7",
    });
    // A cleared selection returns to the automatic lookup.
    expect(binding({ sheet_row: null }).row).toBeNull();
    expect(sheetLookupBinding(null)).toEqual({ row: null, cells: {} });
  });
});

describe("S158 selected-location read (ARCH-S158-1/2)", () => {
  const tabs = {
    "Renewals 2026": [
      [...HEADER],
      row("Jordan Maple", "$1,250", "$1,400"),
      row("Rivers Casey", "$1,900", "$2,050"),
    ],
    "Rent Notes": [
      ["Unit", "Note", "Reviewed market value"],
      ["Unit 4", "Synthetic note", "$1,475"],
    ],
    "Door Codes": [
      ["WiFi Name", "WiFi Password", "Garage Spot"],
      ["synthetic-network", "synthetic-secret", "12"],
    ],
  };

  it("BEH-S158-4/6, AC-S158-1: reads the actual selected row and cell ranges on differently named tabs", async () => {
    const { reader, requested } = workbook(tabs);
    const view = await readOperatingSheetLookup({
      reader,
      spreadsheetId: "configured-workbook",
      binding: binding({
        sheet_row: { tabTitle: "Renewals 2026", rowNumber: 3 },
        "sheet_cell.market_value": { tabTitle: "Rent Notes", cell: "C2" },
      }),
      nowIso: "2026-10-02T16:00:00.000Z",
    });
    expect(requested).toContain("'Renewals 2026'!A3:AZ3");
    expect(requested).toContain("'Rent Notes'!C2");
    // No tab name is hardcoded: the picker offers the workbook's actual tabs.
    expect(view.tabs).toEqual({
      state: "available",
      titles: ["Renewals 2026", "Rent Notes"],
    });
    expect(view.row).toMatchObject({
      tabTitle: "Renewals 2026",
      rowNumber: 3,
      state: "read",
      selectedBy: "editor1@pmikcmetro.com",
      selectedAtIso: SELECTED_AT,
      readAtIso: "2026-10-02T16:00:00.000Z",
    });
    const rent = view.row?.cells?.find((cell) => cell.field === "current_rent");
    expect(rent).toMatchObject({ cell: `${letters(RENT)}3`, value: "$1,900" });
    expect(view.cells).toEqual([
      expect.objectContaining({
        field: "market_value",
        tabTitle: "Rent Notes",
        cell: "C2",
        state: "read",
        value: "$1,475",
      }),
    ]);
  });

  it("BEH-S158-3: a cell selection changes only its own field; the row still supplies every other field", async () => {
    const { reader } = workbook(tabs);
    const rowOnly = await readOperatingSheetLookup({
      reader,
      spreadsheetId: "configured-workbook",
      binding: binding({ sheet_row: { tabTitle: "Renewals 2026", rowNumber: 2 } }),
    });
    const withCell = await readOperatingSheetLookup({
      reader,
      spreadsheetId: "configured-workbook",
      binding: binding({
        sheet_row: { tabTitle: "Renewals 2026", rowNumber: 2 },
        "sheet_cell.market_value": { tabTitle: "Rent Notes", cell: "C2" },
      }),
    });
    expect(withCell.row?.cells).toEqual(rowOnly.row?.cells);
    expect(rowOnly.cells).toEqual([]);
    expect(withCell.cells.map((cell) => cell.field)).toEqual(["market_value"]);
  });

  it("BEH-S158-5: labels the read as an operator selection and claims no match or verification", async () => {
    const { reader } = workbook(tabs);
    const view = await readOperatingSheetLookup({
      reader,
      spreadsheetId: "configured-workbook",
      binding: binding({ sheet_row: { tabTitle: "Renewals 2026", rowNumber: 3 } }),
    });
    expect(view.row?.provenance).toBe("operator_selected");
    // Apart from the Sheet's own cell text, nothing in the read claims a match or a verification.
    const evidence = { ...view.row!, cells: undefined, tabs: view.tabs };
    expect(JSON.stringify(evidence)).not.toMatch(/match|verif|confirm/i);
  });

  it("BEH-S158-6: credential tabs are left out of the picker and are never read as a selection", async () => {
    const { reader, requested } = workbook(tabs);
    const view = await readOperatingSheetLookup({
      reader,
      spreadsheetId: "configured-workbook",
      binding: binding({ sheet_row: { tabTitle: "Door Codes", rowNumber: 2 } }),
    });
    expect(view.tabs).toMatchObject({ titles: ["Renewals 2026", "Rent Notes"] });
    expect(view.row).toMatchObject({ state: "problem", tabTitle: "Door Codes" });
    expect(view.row?.problem).toMatch(/not one the app reads/i);
    expect(requested).not.toContain("'Door Codes'!A2:AZ2");
    expect(JSON.stringify(view)).not.toContain("synthetic-secret");
  });

  it("BEH-S158-7, AC-S158-2: an unreadable, missing or invalid selection reports its exact problem and keeps the saved selection", async () => {
    const { reader } = workbook(tabs, ["A40:AZ40"]);
    const view = await readOperatingSheetLookup({
      reader,
      spreadsheetId: "configured-workbook",
      binding: binding({
        sheet_row: { tabTitle: "Renewals 2026", rowNumber: 40 },
        "sheet_cell.market_value": { tabTitle: "Removed Tab", cell: "C2" },
        "sheet_cell.current_rent": { tabTitle: "Rent Notes", cell: "C2" },
      }),
    });
    // The saved selection is still there to correct; nothing was replaced by a guess.
    expect(view.row).toMatchObject({
      tabTitle: "Renewals 2026",
      rowNumber: 40,
      state: "problem",
    });
    expect(view.row?.problem).toMatch(/row 40/i);
    const missing = view.cells.find((cell) => cell.field === "market_value");
    expect(missing).toMatchObject({ state: "problem", tabTitle: "Removed Tab" });
    expect(missing?.problem).toMatch(/Removed Tab/);
    // One failed selection never takes the others with it.
    expect(view.cells.find((cell) => cell.field === "current_rent")).toMatchObject({
      state: "read",
      value: "$1,475",
    });
  });

  it("BEH-S158-7: an unavailable workbook is reported for the lookup only", async () => {
    const reader: SheetsValuesReader = {
      async listTabTitles() {
        throw new Error("Sheets metadata read failed (HTTP 403).");
      },
      async batchGet() {
        throw new Error("Sheets values read failed (HTTP 403).");
      },
    };
    const view = await readOperatingSheetLookup({
      reader,
      spreadsheetId: "configured-workbook",
      binding: binding({ sheet_row: { tabTitle: "Renewals 2026", rowNumber: 3 } }),
    });
    expect(view.tabs.state).toBe("unavailable");
    expect(view.row).toMatchObject({
      state: "problem",
      tabTitle: "Renewals 2026",
      rowNumber: 3,
    });
    expect(view.row?.problem).toMatch(/permission/i);
  });
});

describe("S158 the selection wins in the desk join (coordinator helper)", () => {
  it("BEH-S158-4: binds the selected physical row to the lease and retires the lease's earlier automatic row", () => {
    const records = new Map([
      [
        "4821",
        workingRecord({ sheet_row: { tabTitle: "Lease Renewal", rowNumber: 4 } }, "4821"),
      ],
      ["9000", workingRecord({ current_rent: 1500 }, "9000")],
    ]);
    const bindings = sheetRowBindingsFromWorkingRecords(records);
    expect([...bindings]).toEqual([
      ["4821", { tabTitle: "Lease Renewal", rowNumber: 4 }],
    ]);
    const result = applyOperatorRowBindings({
      titles: ["Lease Renewal"],
      tableJoinIds: [[null, "lease:4821", "lease:77", null]],
      bindings,
    });
    expect(result.tableJoinIds[0][3]).toBe("lease:4821");
    // The earlier row no longer joins this lease by id or by name.
    expect(result.tableJoinIds[0][1]).toBe(
      `${OPERATOR_UNSELECTED_JOIN_PREFIX}lease:4821`,
    );
    expect(result.tableJoinIds[0][2]).toBe("lease:77");
    expect(result.applied.get("4821")).toEqual({ tableIndex: 0, rowIndex: 3 });
  });

  it("BEH-S158-5: never takes a row that carries another lease's link, and never changes a tab that was not read", () => {
    const result = applyOperatorRowBindings({
      titles: ["Lease Renewal"],
      tableJoinIds: [[null, "lease:4821", "lease:77"]],
      bindings: new Map([
        ["4821", { tabTitle: "Lease Renewal", rowNumber: 3 }],
        ["5000", { tabTitle: "Another Tab", rowNumber: 2 }],
      ]),
    });
    expect(result.tableJoinIds).toEqual([[null, "lease:4821", "lease:77"]]);
    expect(result.skipped.get("4821")).toBe("row_links_another_lease");
    expect(result.skipped.get("5000")).toBe("tab_not_read");
  });
});

describe("S158 later updates resolve an eligible target separately (ARCH-S158-3)", () => {
  const table = [
    [...HEADER],
    row("Jordan Maple"),
    row("Rivers Casey"),
    row("Jordan Maple", "$1,300"),
    row("Proof Tenant"),
    row("Other Lease Tenant"),
  ];
  const base = {
    operatingTabTitle: "Lease Renewal",
    rawTable: table,
    rawJoins: [null, "lease:4821", null, null, null, "lease:9000"] as (string | null)[],
    rawNotes: noNotes(table.length).map((notes, index) =>
      index === 4
        ? notes.map((_note, cell) =>
            cell === TENANT
              ? proofRowNote({
                  operationId: "op-proof-0001",
                  leaseId: "4821",
                  propertyId: "84",
                })
              : null,
          )
        : notes,
    ),
    headerRowIndex: 0,
    columns: new Map([
      ["tenant_name", TENANT],
      ["current_rent", RENT],
      ["market_value", MARKET],
    ]),
    tenantColumnIndex: TENANT,
    leaseId: "4821",
    propertyId: "84",
  };

  it("BEH-S158-9: a selected row is the target row for the recognized fields", () => {
    expect(
      resolveOperatorSheetTarget({
        ...base,
        binding: binding({ sheet_row: { tabTitle: "Lease Renewal", rowNumber: 4 } }),
        inspectField: "market_value",
      }),
    ).toEqual({
      kind: "selected",
      via: "row",
      tabTitle: "Lease Renewal",
      rowNumber: 4,
      limit: null,
    });
    // No selection keeps the automatic association.
    expect(
      resolveOperatorSheetTarget({ ...base, binding: sheetLookupBinding(null) }),
    ).toEqual({ kind: "automatic" });
  });

  it("BEH-S158-9: a selected cell is a target only as that same field's mapped column in a data row", () => {
    const eligible = resolveOperatorSheetTarget({
      ...base,
      binding: binding({
        sheet_row: { tabTitle: "Lease Renewal", rowNumber: 2 },
        "sheet_cell.market_value": {
          tabTitle: "Lease Renewal",
          cell: `${letters(MARKET)}4`,
        },
      }),
      inspectField: "market_value",
    });
    expect(eligible).toEqual({
      kind: "selected",
      via: "cell",
      tabTitle: "Lease Renewal",
      rowNumber: 4,
      cell: `${letters(MARKET)}4`,
      limit: null,
    });
    // The cell affects only its own field: another field still follows the selected row.
    expect(
      resolveOperatorSheetTarget({
        ...base,
        binding: binding({
          sheet_row: { tabTitle: "Lease Renewal", rowNumber: 2 },
          "sheet_cell.market_value": {
            tabTitle: "Lease Renewal",
            cell: `${letters(MARKET)}4`,
          },
        }),
        inspectField: "current_rent",
      }),
    ).toMatchObject({ via: "row", rowNumber: 2, limit: null });
  });

  it.each([
    ["an identity column", `${letters(TENANT)}4`, "Lease Renewal", "other_column"],
    ["another field's column", `${letters(RENT)}4`, "Lease Renewal", "other_column"],
    ["an unrecognized column", "AX4", "Lease Renewal", "other_column"],
    ["the header row", `${letters(MARKET)}1`, "Lease Renewal", "header_row"],
    ["a proof row", `${letters(MARKET)}5`, "Lease Renewal", "proof_row"],
    ["another lease's row", `${letters(MARKET)}6`, "Lease Renewal", "other_lease"],
    ["another tab", `${letters(MARKET)}4`, "Rent Notes", "other_tab"],
  ])(
    "BEH-S158-10, AC-S158-3: %s stays readable but is not a write target",
    (_label, cell, tabTitle, limit) => {
      const target = resolveOperatorSheetTarget({
        ...base,
        binding: binding({ "sheet_cell.market_value": { tabTitle, cell } }),
        inspectField: "market_value",
      });
      expect(target).toMatchObject({ kind: "selected", via: "cell", limit });
      expect(describeOperatorSelectionLimit(target)).toMatch(/readable/i);
      expect(describeOperatorSelectionLimit(target)).not.toMatch(/—/);
    },
  );

  it("AC-S158-3: a selected proof row, another lease's row or another tab's row is refused as a row target", () => {
    for (const [rowNumber, tabTitle, limit] of [
      [5, "Lease Renewal", "proof_row"],
      [6, "Lease Renewal", "other_lease"],
      [90, "Lease Renewal", "outside_rows"],
      [3, "Rent Notes", "other_tab"],
    ] as const)
      expect(
        resolveOperatorSheetTarget({
          ...base,
          binding: binding({ sheet_row: { tabTitle, rowNumber } }),
        }),
      ).toMatchObject({ kind: "selected", via: "row", limit });
    // A header that sits below a title row is still a header, not a lease row.
    expect(
      resolveOperatorSheetTarget({
        ...base,
        headerRowIndex: 1,
        binding: binding({ sheet_row: { tabTitle: "Lease Renewal", rowNumber: 2 } }),
      }),
    ).toMatchObject({ kind: "selected", via: "row", limit: "header_row" });
    // A row carrying the app's own note for this lease stays an eligible target.
    const noted = {
      ...base,
      rawNotes: base.rawNotes.map((notes, index) =>
        index === 2
          ? notes.map((_note, cell) =>
              cell === TENANT
                ? normalRowNote({
                    operationId: "op-normal-0001",
                    leaseId: "4821",
                    propertyId: "84",
                  })
                : null,
            )
          : notes,
      ),
    };
    expect(
      resolveOperatorSheetTarget({
        ...noted,
        binding: binding({ sheet_row: { tabTitle: "Lease Renewal", rowNumber: 3 } }),
      }),
    ).toMatchObject({ via: "row", rowNumber: 3, limit: null });
  });

  function context(
    overrides: Partial<FreshOperatingSheetLeaseContext> = {},
  ): FreshOperatingSheetLeaseContext {
    return {
      leaseId: "4821",
      propertyId: "84",
      tenantName: "Jordan Maple",
      sourceReadAtIso: "2026-10-02T16:00:00.000Z",
      header: [...HEADER],
      columns: base.columns,
      tenantColumnIndex: TENANT,
      association: {
        kind: "operator_selected",
        via: "row",
        tabTitle: "Lease Renewal",
        rowNumber: 4,
        limit: null,
      },
      row: {
        rowNumber: 4,
        rowKey: null,
        anchorTenantName: "Jordan Maple",
        currentRentValue: "$1,300",
        fieldValues: { market_value: "", current_rent: "$1,300" },
        formulaFields: [],
        currentRentSourceTriggerKey: null,
        currentRentCandidateFingerprint: null,
      },
      ...overrides,
    };
  }

  it("BEH-S158-9: update preparation targets the freshly resolved selected row through the recognized field contract", () => {
    const effect = effectForSheetFieldIntent(context(), {
      field: "market_value",
      value: 1475,
      source: "Staff entry",
    });
    expect(effect).toMatchObject({
      kind: "field_update",
      field: "market_value",
      rowNumber: 4,
      anchorTenantName: "Jordan Maple",
      expectedValue: "",
      afterValue: "1475",
    });
  });

  it("BEH-S158-10, AC-S158-3: a readable but ineligible selection refuses only that exact update, in plain words", () => {
    const limited = context({
      association: {
        kind: "operator_selected",
        via: "cell",
        tabTitle: "Lease Renewal",
        rowNumber: 4,
        cell: "AX4",
        limit: "other_column",
      },
      targetRefusal: {
        code: "selected_cell_not_writable",
        message:
          "The selected cell stays readable. It is not this field's column in a lease row, so the app does not update it.",
      },
    });
    let refusal: unknown;
    try {
      effectForSheetFieldIntent(limited, {
        field: "market_value",
        value: 1475,
        source: "Staff entry",
      });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(SheetWorkspaceResolutionError);
    expect((refusal as SheetWorkspaceResolutionError).code).toBe(
      "selected_cell_not_writable",
    );
    expect((refusal as SheetWorkspaceResolutionError).plainMessage).toMatch(/readable/i);
    // A formula cell is never replaced, selected or not.
    expect(() =>
      effectForSheetFieldIntent(
        context({
          row: { ...context().row!, formulaFields: ["market_value"] },
        }),
        { field: "market_value", value: 1475, source: "Staff entry" },
      ),
    ).toThrowError(SheetWorkspaceResolutionError);
  });
});
