import { describe, expect, it } from "vitest";

import type {
  GoldenWorksheet,
  WorksheetEntry,
} from "@/lib/lease-renewal/golden/labeling";
import {
  distillDecisionsIntoWorksheet,
  suggestDecision,
  toDecisionSignals,
} from "@/lib/lease-renewal/golden/distillation";

function entry(
  fieldKey: string,
  decision: WorksheetEntry["decision"],
  row = 1,
): WorksheetEntry {
  return {
    key: `Renewals#${row}#${fieldKey}`,
    tab: "Renewals",
    sourceRowIndex: row,
    fieldKey,
    fieldLabel: fieldKey,
    candidateSeverity: "Medium",
    agreement: "conflict",
    suggestedWinner: null,
    confidenceForDraft: "Likely",
    candidates: [],
    decision,
    note: "",
  };
}

function worksheet(entries: WorksheetEntry[]): GoldenWorksheet {
  return {
    capturedName: "r3",
    category: "wrong",
    description: "",
    instructions: "",
    reviewed: false,
    fieldsUnderReview: [],
    entries,
  };
}

describe("suggestDecision", () => {
  it("maps a dismissal to reject and a pick/correction to accept", () => {
    expect(suggestDecision("flag_incorrect")).toBe("reject");
    expect(suggestDecision("pick_source")).toBe("accept");
    expect(suggestDecision("corrected_value")).toBe("accept");
  });
});

describe("toDecisionSignals", () => {
  it("reduces resolution records to value-free (fieldKey, kind) signals", () => {
    const signals = toDecisionSignals([
      { field_key: "current_rent", resolution_kind: "flag_incorrect" },
      { field_key: "renewal_date", resolution_kind: "pick_source" },
      { field_key: "market_value", resolution_kind: undefined },
    ]);
    expect(signals).toEqual([
      { fieldKey: "current_rent", resolution_kind: "flag_incorrect" },
      { fieldKey: "renewal_date", resolution_kind: "pick_source" },
    ]);
  });
});

describe("distillDecisionsIntoWorksheet", () => {
  it("pre-fills PENDING entries with suggestions but never auto-verifies", () => {
    const ws = worksheet([
      entry("current_rent", "PENDING"),
      entry("renewal_date", "PENDING"),
      entry("market_value", "accept"), // already decided -> untouched
    ]);
    const { worksheet: out, summary } = distillDecisionsIntoWorksheet(ws, [
      { fieldKey: "current_rent", resolution_kind: "flag_incorrect" },
      { fieldKey: "renewal_date", resolution_kind: "pick_source" },
    ]);

    expect(out.entries[0].decision).toBe("reject");
    expect(out.entries[0].note).toContain("Prefilled suggestion");
    expect(out.entries[1].decision).toBe("accept");
    expect(out.entries[2].decision).toBe("accept"); // untouched
    // Never auto-verifies:
    expect(out.reviewed).toBe(false);
    expect(summary).toEqual({
      entries: 3,
      prefilled: 2,
      matchedFields: 2,
      ambiguousFields: 0,
      unmatchedFields: 0,
      alreadyDecided: 1,
    });
  });

  it("does NOT fan one decision out to every same-field row (guard 2)", () => {
    // Two tenants share fieldKey current_rent (rows 1 + 2); only row 2's flag was dismissed. A
    // fieldKey-only signal cannot address one row, so BOTH stay PENDING rather than mislabel row 1.
    const ws = worksheet([
      entry("current_rent", "PENDING", 1),
      entry("current_rent", "PENDING", 2),
    ]);
    const { worksheet: out, summary } = distillDecisionsIntoWorksheet(ws, [
      { fieldKey: "current_rent", resolution_kind: "flag_incorrect" },
    ]);
    expect(out.entries[0].decision).toBe("PENDING");
    expect(out.entries[1].decision).toBe("PENDING");
    expect(summary.prefilled).toBe(0);
    expect(summary.ambiguousFields).toBe(1);
    expect(summary.matchedFields).toBe(0);
  });

  it("leaves an entry PENDING when signals for its field conflict (never guesses)", () => {
    const ws = worksheet([entry("current_rent", "PENDING")]);
    const { worksheet: out, summary } = distillDecisionsIntoWorksheet(ws, [
      { fieldKey: "current_rent", resolution_kind: "flag_incorrect" },
      { fieldKey: "current_rent", resolution_kind: "pick_source" },
    ]);
    expect(out.entries[0].decision).toBe("PENDING");
    expect(summary.prefilled).toBe(0);
    expect(summary.unmatchedFields).toBe(1);
  });

  it("counts signal fields that match no entry", () => {
    const ws = worksheet([entry("current_rent", "PENDING")]);
    const { summary } = distillDecisionsIntoWorksheet(ws, [
      { fieldKey: "does_not_exist", resolution_kind: "pick_source" },
    ]);
    expect(summary.prefilled).toBe(0);
    expect(summary.unmatchedFields).toBe(1);
  });
});
