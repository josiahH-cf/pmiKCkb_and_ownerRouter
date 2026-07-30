import { afterEach, describe, expect, it } from "vitest";

import type {
  SheetsAnchoredCellReference,
  SheetsAnchoredMutationResult,
  SheetsValuesWriter,
} from "@/lib/google-sheets/write-client";
import {
  columnLetter,
  commitWritebackAtRow,
  correctWritebackAtExactCell,
  executeProposalWriteBack,
  hashSheetRowAnchor,
  inspectAnchoredWritebackTarget,
  resolveWritebackTarget,
  type ExactCellWritebackCorrectionPlan,
  type RowWritebackPlan,
  type SheetWritebackPlan,
} from "@/lib/lease-renewal/sheet-writeback-execution";
import {
  SHEET_WRITEBACK_FLAG,
  hashSheetCellValue,
  isSheetWritebackEnabled,
} from "@/lib/lease-renewal/sheet-writeback-policy";

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
  readonly clears: string[] = [];
  getCalls = 0;
  valueBeforeConditionalWrite: string | null = null;
  valueBeforeConditionalClear: string | null = null;
  constructor(
    public grid: string[][],
    private readonly persist = true,
  ) {}

  async getValues(_spreadsheetId: string, range: string): Promise<string[][]> {
    this.getCalls += 1;
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

  async writeValuesIfEmpty(
    _spreadsheetId: string,
    range: string,
    value: string,
  ): Promise<boolean> {
    this.updates.push({ range, values: [[value]] });
    const { row, col } = parseA1(range);
    if (this.valueBeforeConditionalWrite !== null) {
      this.grid[row][col] = this.valueBeforeConditionalWrite;
    }
    if ((this.grid[row]?.[col] ?? "") !== "") return false;
    if (!this.persist) return true;
    while (this.grid.length <= row) this.grid.push([]);
    while (this.grid[row].length <= col) this.grid[row].push("");
    this.grid[row][col] = value;
    return true;
  }

  async clearValuesIfExactMatch(
    _spreadsheetId: string,
    range: string,
    expectedValue: string,
  ): Promise<boolean> {
    this.clears.push(range);
    const { row, col } = parseA1(range);
    if (this.valueBeforeConditionalClear !== null) {
      this.grid[row][col] = this.valueBeforeConditionalClear;
    }
    if (this.grid[row]?.[col] !== expectedValue) return false;
    if (!this.persist) return true;
    while (this.grid.length <= row) this.grid.push([]);
    while (this.grid[row].length <= col) this.grid[row].push("");
    this.grid[row][col] = "";
    return true;
  }

  async mutateAnchoredCellIfMatch(input: {
    idempotencyKey: string;
    payloadHash: string;
    target: SheetsAnchoredCellReference;
    expectedValue: string;
    replacementValue: string;
    expectedEffectId?: string;
  }): Promise<SheetsAnchoredMutationResult> {
    const clearing = input.replacementValue === "";
    if (clearing) {
      this.clears.push(input.target.a1);
      const { row, col } = parseA1(input.target.a1);
      if (this.valueBeforeConditionalClear !== null) {
        this.grid[row][col] = this.valueBeforeConditionalClear;
      }
    } else {
      this.updates.push({
        range: input.target.a1,
        values: [[input.replacementValue]],
      });
      const { row, col } = parseA1(input.target.a1);
      if (this.valueBeforeConditionalWrite !== null) {
        this.grid[row][col] = this.valueBeforeConditionalWrite;
      }
    }
    const anchored = await inspectAnchoredWritebackTarget(
      this,
      input.target.spreadsheetId,
      input.target,
    );
    if (anchored.status !== "resolved") {
      return { status: "mismatch", reason: "the logical row or exact A1 moved" };
    }
    if (anchored.currentValue !== input.expectedValue) {
      return { status: "mismatch", reason: "the exact cell value changed" };
    }
    const { row, col } = parseA1(input.target.a1);
    if (this.persist) this.grid[row][col] = input.replacementValue;
    return {
      status: "applied",
      a1: input.target.a1,
      effectId: `effect:${input.idempotencyKey}`,
      appliedAt: "2026-07-30T00:00:01.000Z",
      resultHash: "a".repeat(64),
    };
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
    idempotencyKey: `sheet_write_${"a".repeat(48)}`,
    payloadHash: "b".repeat(64),
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

describe("resolveWritebackTarget / commitWritebackAtRow (row-anchored)", () => {
  function rowPlan(overrides: Partial<RowWritebackPlan> = {}): RowWritebackPlan {
    return {
      spreadsheetId: "sheet",
      tabName: "Lease Renewal",
      propertyKey: "4821-maple",
      fieldKey: "rent",
      proposedColumnHeader: "KB Proposed — Rent",
      rowIndex: 1,
      proposedValue: "1300",
      idempotencyKey: `sheet_write_${"a".repeat(48)}`,
      payloadHash: "b".repeat(64),
      ...overrides,
    };
  }

  it("is disabled (no read, no write) when the flag is off", async () => {
    const writer = new FakeWriter(grid());
    expect(await resolveWritebackTarget(writer, rowPlan())).toEqual({
      status: "disabled",
    });
    expect(await commitWritebackAtRow(writer, rowPlan())).toEqual({ status: "disabled" });
    expect(writer.updates).toHaveLength(0);
  });

  it("resolves the exact target with the row's current values, without writing", async () => {
    enable();
    const writer = new FakeWriter(grid());
    const out = await resolveWritebackTarget(writer, rowPlan());
    expect(out.status).toBe("resolved");
    if (out.status === "resolved") {
      expect(out.target.a1).toBe("Lease Renewal!C2");
      expect(out.target.proposedValue).toBe("1300");
      expect(out.target.rowValues).toEqual(["4821 Maple", "Delgado", ""]);
    }
    expect(writer.updates).toHaveLength(0);
  });

  it("refuses preview when the bodyless row identity is duplicated", async () => {
    enable();
    const duplicate = grid();
    duplicate.push(["4821 Maple", "Delgado", ""]);
    const writer = new FakeWriter(duplicate);

    expect(await resolveWritebackTarget(writer, rowPlan())).toEqual({
      status: "blocked",
      reason: "the target row identity does not resolve uniquely",
    });
    expect(writer.updates).toHaveLength(0);
  });

  it("keeps the bodyless row identity stable across movement and newly named columns", () => {
    const original = hashSheetRowAnchor(
      ["Address", "Tenant"],
      ["Address", "Tenant", "KB Proposed — Rent"],
      ["4821 Maple", "Delgado", ""],
    );
    const moved = hashSheetRowAnchor(
      ["Address", "Tenant"],
      ["New audit field", "KB Proposed — Rent", "Tenant", "Address"],
      ["new value", "", "Delgado", "4821 Maple"],
    );

    expect(moved).toBe(original);
  });

  it("commits the append and verifies it (read-after-write)", async () => {
    enable();
    const writer = new FakeWriter(grid());
    expect(await commitWritebackAtRow(writer, rowPlan())).toEqual({
      status: "written",
      a1: "Lease Renewal!C2",
    });
    expect(writer.grid[1][2]).toBe("1300");
  });

  it("blocks (no overwrite) when the target cell already has a value", async () => {
    enable();
    const writer = new FakeWriter(grid("999"));
    expect((await commitWritebackAtRow(writer, rowPlan())).status).toBe("blocked");
    expect(writer.updates).toHaveLength(0);
    expect(writer.grid[1][2]).toBe("999");
  });

  it("atomically refuses a collaborator edit that lands after target resolution", async () => {
    enable();
    const writer = new FakeWriter(grid());
    writer.valueBeforeConditionalWrite = "intervening";

    expect(await commitWritebackAtRow(writer, rowPlan())).toEqual({
      status: "blocked",
      reason: "the exact cell value changed",
    });
    expect(writer.grid[1][2]).toBe("intervening");
  });

  it("blocks when the row is the header row or outside the sheet", async () => {
    enable();
    const writer = new FakeWriter(grid());
    expect((await commitWritebackAtRow(writer, rowPlan({ rowIndex: 0 }))).status).toBe(
      "blocked",
    );
    expect((await commitWritebackAtRow(writer, rowPlan({ rowIndex: 9 }))).status).toBe(
      "blocked",
    );
    expect(writer.updates).toHaveLength(0);
  });

  it("blocks when the KB-Proposed column has not been created", async () => {
    enable();
    const writer = new FakeWriter([
      ["Address", "Tenant"],
      ["4821 Maple", "Delgado"],
    ]);
    expect((await commitWritebackAtRow(writer, rowPlan())).status).toBe("blocked");
    expect(writer.updates).toHaveLength(0);
  });

  it("blocks when an earlier data value duplicates the real target header", async () => {
    enable();
    const writer = new FakeWriter([
      ["Noise", "KB Proposed — Rent", "Other"],
      ["Address", "Tenant", "KB Proposed — Rent"],
      ["4821 Maple", "Delgado", ""],
    ]);

    expect(await commitWritebackAtRow(writer, rowPlan({ rowIndex: 2 }))).toMatchObject({
      status: "blocked",
    });
    expect(writer.updates).toHaveLength(0);
    expect(writer.grid[2][2]).toBe("");
  });
});

describe("correctWritebackAtExactCell", () => {
  function correctionPlan(
    overrides: Partial<ExactCellWritebackCorrectionPlan> = {},
  ): ExactCellWritebackCorrectionPlan {
    return {
      idempotencyKey: `sheet_correction_${"c".repeat(48)}`,
      payloadHash: "d".repeat(64),
      expectedEffectId: `effect:sheet_write_${"a".repeat(48)}`,
      spreadsheetId: "sheet",
      a1: "Lease Renewal!C2",
      tabName: "Lease Renewal",
      rowIndex: 1,
      proposedColumnHeader: "KB Proposed — Rent",
      anchorHeaders: ["Address", "Tenant"],
      rowAnchorHash: hashSheetRowAnchor(
        ["Address", "Tenant"],
        ["Address", "Tenant", "KB Proposed — Rent"],
        ["4821 Maple", "Delgado", ""],
      ),
      anchorColumnCount: 3,
      expectedValueHash: hashSheetCellValue("1300"),
      ...overrides,
    };
  }

  it("is disabled before any read or clear when the feature flag is off", async () => {
    const writer = new FakeWriter(grid("1300"));

    expect(await correctWritebackAtExactCell(writer, correctionPlan())).toEqual({
      status: "disabled",
    });
    expect(writer.getCalls).toBe(0);
    expect(writer.clears).toHaveLength(0);
  });

  it("clears the exact receipted cell once and verifies it is empty", async () => {
    enable();
    const writer = new FakeWriter(grid("1300"));

    expect(await correctWritebackAtExactCell(writer, correctionPlan())).toMatchObject({
      status: "corrected",
      providerEffect: {
        status: "applied",
        a1: "Lease Renewal!C2",
      },
    });
    expect(writer.clears).toEqual(["Lease Renewal!C2"]);
    expect(writer.getCalls).toBe(3);
    expect(writer.grid[1][2]).toBe("");
  });

  it("blocks with no clear when an intervening change no longer matches the receipt hash", async () => {
    enable();
    const writer = new FakeWriter(grid("1400"));

    const outcome = await correctWritebackAtExactCell(writer, correctionPlan());

    expect(outcome).toEqual({
      status: "blocked",
      reason: "the correction target changed after the write receipt",
    });
    expect(writer.clears).toHaveLength(0);
    expect(writer.grid[1][2]).toBe("1400");
  });

  it("atomically refuses a collaborator edit that lands after the read but before clear", async () => {
    enable();
    const writer = new FakeWriter(grid("1300"));
    writer.valueBeforeConditionalClear = "intervening";

    const outcome = await correctWritebackAtExactCell(writer, correctionPlan());

    expect(outcome).toEqual({
      status: "blocked",
      reason: "the exact cell value changed",
    });
    expect(writer.clears).toEqual(["Lease Renewal!C2"]);
    expect(writer.grid[1][2]).toBe("intervening");
    expect(writer.getCalls).toBe(2);
  });

  it("returns the authoritative provider effect with a warning when readback is not empty", async () => {
    enable();
    const writer = new FakeWriter(grid("1300"), false);

    const outcome = await correctWritebackAtExactCell(writer, correctionPlan());

    expect(outcome).toMatchObject({
      status: "corrected",
      providerEffect: { status: "applied", a1: "Lease Renewal!C2" },
      readbackWarning:
        "The provider applied the correction, but the current Sheet value has since drifted.",
    });
    expect(writer.clears).toEqual(["Lease Renewal!C2"]);
    expect(writer.getCalls).toBe(3);
    expect(writer.grid[1][2]).toBe("1300");
  });

  it.each([
    {
      label: "a range rather than one exact cell",
      overrides: { a1: "Lease Renewal!C2:C3" },
    },
    {
      label: "an invalid receipt hash",
      overrides: { expectedValueHash: "not-a-sha256" },
    },
  ])("blocks $label before reading or clearing", async ({ overrides }) => {
    enable();
    const writer = new FakeWriter(grid("1300"));

    expect(
      (await correctWritebackAtExactCell(writer, correctionPlan(overrides))).status,
    ).toBe("blocked");
    expect(writer.getCalls).toBe(0);
    expect(writer.clears).toHaveLength(0);
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
