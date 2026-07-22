import { afterEach, describe, expect, it } from "vitest";

import type { SheetsValuesWriter } from "@/lib/google-sheets/write-client";
import {
  SHEET_WRITEBACK_FLAG,
  columnLetter,
  executeProposalWriteBack,
  isSheetWritebackEnabled,
  type SheetWritebackPlan,
} from "@/lib/lease-renewal/sheet-writeback-execution";

function parseA1(range: string): { row: number; col: number } {
  const cell = range.split("!")[1] ?? range;
  const match = /^([A-Z]+)(\d+)$/.exec(cell);
  if (!match) throw new Error(`bad A1: ${range}`);
  let col = 0;
  for (const ch of match[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(match[2]) - 1, col: col - 1 };
}

/** In-memory Sheets writer double. `persist:false` simulates a write that did not land (read-after-write). */
class FakeWriter implements SheetsValuesWriter {
  readonly updates: { range: string; values: string[][] }[] = [];
  constructor(
    public grid: string[][],
    private readonly persist = true,
  ) {}

  async getValues(_spreadsheetId: string, range: string): Promise<string[][]> {
    if (range.includes("!")) {
      const { row, col } = parseA1(range);
      return [[this.grid[row]?.[col] ?? ""]];
    }
    return this.grid.map((r) => [...r]);
  }

  async updateValues(
    _spreadsheetId: string,
    range: string,
    values: string[][],
  ): Promise<void> {
    this.updates.push({ range, values });
    if (!this.persist) return;
    const { row, col } = parseA1(range);
    while (this.grid.length <= row) this.grid.push([]);
    while (this.grid[row].length <= col) this.grid[row].push("");
    this.grid[row][col] = values[0][0];
  }
}

function grid(kbCell = ""): string[][] {
  return [
    ["Address", "Tenant", "KB Proposed — Rent"],
    ["4821 Maple", "Delgado", kbCell],
    ["1207 Walnut", "Carter", ""],
  ];
}

function planFor(overrides: Partial<SheetWritebackPlan> = {}): SheetWritebackPlan {
  return {
    spreadsheetId: "sheet",
    tabName: "Lease Renewal",
    proposedColumnHeader: "KB Proposed — Rent",
    signatureColumns: ["Address", "Tenant"],
    rowSignature: "4821 Maple|Delgado",
    proposedValue: "1300",
    ...overrides,
  };
}

function enable() {
  process.env[SHEET_WRITEBACK_FLAG] = "true";
}

afterEach(() => {
  delete process.env[SHEET_WRITEBACK_FLAG];
});

describe("isSheetWritebackEnabled", () => {
  it("is off by default and only on for the exact 'true' value", () => {
    expect(isSheetWritebackEnabled()).toBe(false);
    process.env[SHEET_WRITEBACK_FLAG] = "1";
    expect(isSheetWritebackEnabled()).toBe(false);
    process.env[SHEET_WRITEBACK_FLAG] = "true";
    expect(isSheetWritebackEnabled()).toBe(true);
  });
});

describe("executeProposalWriteBack", () => {
  it("writes nothing and returns disabled when the flag is off", async () => {
    const writer = new FakeWriter(grid());
    const outcome = await executeProposalWriteBack(writer, planFor());
    expect(outcome).toEqual({ status: "disabled" });
    expect(writer.updates).toHaveLength(0);
  });

  it("appends the value into the empty KB-Proposed cell and verifies it (read-after-write)", async () => {
    enable();
    const writer = new FakeWriter(grid());
    const outcome = await executeProposalWriteBack(writer, planFor());
    expect(outcome).toEqual({ status: "written", a1: "Lease Renewal!C2" });
    expect(writer.updates).toEqual([{ range: "Lease Renewal!C2", values: [["1300"]] }]);
    expect(writer.grid[1][2]).toBe("1300");
  });

  it("blocks (never overwrites) when the KB-Proposed cell already has a value", async () => {
    enable();
    const writer = new FakeWriter(grid("999"));
    const outcome = await executeProposalWriteBack(writer, planFor());
    expect(outcome.status).toBe("blocked");
    expect(writer.updates).toHaveLength(0);
    expect(writer.grid[1][2]).toBe("999");
  });

  it("blocks when the KB-Proposed column has not been created on the sheet", async () => {
    enable();
    const writer = new FakeWriter([
      ["Address", "Tenant"],
      ["4821 Maple", "Delgado"],
    ]);
    const outcome = await executeProposalWriteBack(writer, planFor());
    expect(outcome.status).toBe("blocked");
    expect(writer.updates).toHaveLength(0);
  });

  it("blocks when the row signature no longer matches any row", async () => {
    enable();
    const writer = new FakeWriter(grid());
    const outcome = await executeProposalWriteBack(
      writer,
      planFor({ rowSignature: "Nowhere|Nobody" }),
    );
    expect(outcome.status).toBe("blocked");
    expect(writer.updates).toHaveLength(0);
  });

  it("blocks when the row signature resolves to more than one row (ambiguous)", async () => {
    enable();
    const dupe = grid();
    dupe.push(["4821 Maple", "Delgado", ""]);
    const writer = new FakeWriter(dupe);
    const outcome = await executeProposalWriteBack(writer, planFor());
    expect(outcome.status).toBe("blocked");
    expect(writer.updates).toHaveLength(0);
  });

  it("blocks on a read-after-write mismatch (the write did not persist)", async () => {
    enable();
    const writer = new FakeWriter(grid(), false);
    const outcome = await executeProposalWriteBack(writer, planFor());
    expect(outcome.status).toBe("blocked");
    if (outcome.status === "blocked") {
      expect(outcome.reason).toContain("read-after-write");
    }
  });
});

describe("columnLetter", () => {
  it("maps 0-based indices to A1 column letters", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(2)).toBe("C");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(27)).toBe("AB");
    expect(columnLetter(51)).toBe("AZ");
    expect(columnLetter(52)).toBe("BA");
  });
});
