import { describe, expect, it } from "vitest";
import {
  NORMALIZED_CONFIDENCE_LADDER,
  normalizeCell,
  parseSheetDate,
} from "@/lib/lease-renewal/normalized-value";
import type { CellAddress } from "@/lib/lease-renewal/sheet-types";

const cell: CellAddress = { tab: "Renewals", row: 1, column: "value" };

function norm(raw: string, hint?: Parameters<typeof normalizeCell>[2]) {
  return normalizeCell(raw, cell, hint);
}

describe("normalizeCell — one fixture per type class", () => {
  it("classifies empty cells", () => {
    expect(norm("")).toMatchObject({
      type: "empty",
      value: null,
      confidence: "Verified",
    });
    expect(norm("   ")).toMatchObject({ type: "empty", value: null });
  });

  it("classifies emails (a date column holding an email normalizes as email)", () => {
    expect(norm("jordan.maple@example.com")).toMatchObject({
      type: "email",
      value: "jordan.maple@example.com",
      confidence: "Verified",
    });
  });

  it("classifies booleans", () => {
    expect(norm("TRUE")).toMatchObject({
      type: "boolean",
      value: true,
      confidence: "Verified",
    });
    expect(norm("FALSE")).toMatchObject({ type: "boolean", value: false });
  });

  it("classifies currency", () => {
    expect(norm("$1,250")).toMatchObject({
      type: "currency",
      value: 1250,
      confidence: "Verified",
    });
    expect(norm("$1,400.00")).toMatchObject({ type: "currency", value: 1400 });
  });

  it("classifies yes / no / n-a with the right confidence", () => {
    for (const yes of ["yes", "Yes", "YES", "y"]) {
      expect(norm(yes)).toMatchObject({
        type: "yes_no",
        value: true,
        confidence: "Verified",
      });
    }
    expect(norm("no")).toMatchObject({
      type: "yes_no",
      value: false,
      confidence: "Verified",
    });
    expect(norm("N/A")).toMatchObject({
      type: "yes_no",
      value: null,
      confidence: "Likely",
    });
  });

  it("classifies the mixed date formats in one column", () => {
    expect(norm("8/31/2026")).toMatchObject({
      type: "date",
      value: "2026-08-31",
      confidence: "Verified",
    });
    expect(norm("8/31/26")).toMatchObject({
      type: "date",
      value: "2026-08-31",
      confidence: "Likely",
    });
    expect(norm("09-30-2026")).toMatchObject({
      type: "date",
      value: "2026-09-30",
      confidence: "Verified",
    });
    expect(norm("01/2026")).toMatchObject({
      type: "date",
      value: "2026-01",
      confidence: "Likely",
    });
    expect(norm("September 15, 2023")).toMatchObject({
      type: "date",
      value: "2023-09-15",
      confidence: "Likely",
    });
  });

  it("classifies known free-text status tokens", () => {
    expect(norm("Dont renew")).toMatchObject({
      type: "status",
      value: "dont renew",
      confidence: "Likely",
    });
    expect(norm("not renewing")).toMatchObject({ type: "status", value: "not renewing" });
  });

  it("handles a yes/no answer with workflow state appended in free text", () => {
    const dated = norm("yes 8/1/2026");
    expect(dated).toMatchObject({ type: "yes_no", value: true, confidence: "Likely" });
    expect(dated.notes[0]).toContain("8/1/2026");

    const murky = norm("yes, working");
    expect(murky).toMatchObject({
      type: "yes_no",
      value: true,
      confidence: "Needs Review",
    });
  });

  it("types names only with the name hint, and flags buried state otherwise", () => {
    expect(norm("RIVERS, CASEY", "name")).toMatchObject({
      type: "name",
      value: "RIVERS, CASEY",
      confidence: "Likely",
    });
    expect(norm("ESTELLE WORKING ON")).toMatchObject({
      type: "text",
      confidence: "Needs Review",
    });
  });
});

describe("normalization invariants", () => {
  it("never assigns Conflict confidence at ingest", () => {
    const ladder: readonly string[] = NORMALIZED_CONFIDENCE_LADDER;
    expect(ladder).toEqual(["Verified", "Likely", "Needs Review"]);
    expect(ladder).not.toContain("Conflict");

    const samples = [
      "",
      "yes",
      "no",
      "n/a",
      "$5",
      "TRUE",
      "8/31/26",
      "Dont renew",
      "ESTELLE WORKING ON",
      "x@y.com",
    ];
    for (const sample of samples) {
      expect(ladder).toContain(norm(sample).confidence);
    }
  });

  it("preserves raw and cell address on every value", () => {
    const result = norm("$1,250");
    expect(result.raw).toBe("$1,250");
    expect(result.cell).toEqual(cell);
  });

  it("returns null for unparseable dates", () => {
    expect(parseSheetDate("not a date")).toBeNull();
    expect(parseSheetDate("13/45/2026")).toBeNull();
  });

  it("rejects impossible calendar dates instead of fabricating a Verified ISO", () => {
    // Day within 1..31 but impossible for the month, or a non-leap Feb 29.
    for (const bad of [
      "2/30/2024",
      "4/31/2026",
      "2/31/2026",
      "2/29/2023",
      "June 31, 2026",
    ]) {
      expect(parseSheetDate(bad), bad).toBeNull();
    }
    // The full normalizer therefore does NOT type these as a date.
    expect(norm("2/30/2024").type).not.toBe("date");
    // A real leap day still parses.
    expect(parseSheetDate("2/29/2024")).toMatchObject({ iso: "2024-02-29" });
  });
});
