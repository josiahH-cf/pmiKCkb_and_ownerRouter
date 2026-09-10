import { describe, expect, it } from "vitest";
import {
  parseSheetFieldIntent,
  sheetIntentValue,
} from "@/lib/lease-renewal/sheet-writeback/field-intent";

describe("S113 semantic Sheet intent", () => {
  it("accepts a business field and typed value without caller-selected physical targets", () => {
    expect(
      parseSheetFieldIntent({
        field: "market_value",
        value: 1450,
        source: "Reviewed analysis",
      }),
    ).toEqual({ field: "market_value", value: 1450, source: "Reviewed analysis" });
    expect(() =>
      parseSheetFieldIntent({
        field: "market_value",
        value: 1450,
        source: "Reviewed analysis",
        rowNumber: 8,
      }),
    ).toThrow();
    expect(() =>
      parseSheetFieldIntent({
        field: "tenant_name",
        value: "Other person",
        source: "Typed",
      }),
    ).toThrow();
  });
  it("rejects formulas, impossible dates and unknown or mistyped business values", () => {
    for (const entry of [
      { field: "renewal_date", value: "2026-02-30" },
      { field: "market_value", value: -1 },
      { field: "form_returned", value: "maybe" },
      { field: "lease_docs_sent", value: "=IMPORTXML(1)" },
    ])
      expect(() => parseSheetFieldIntent({ ...entry, source: "Staff review" })).toThrow();
  });
  it("retains boolean, date, currency and text meanings without treating a header fee as a value", () => {
    expect(
      sheetIntentValue(
        parseSheetFieldIntent({
          field: "form_returned",
          value: true,
          source: "Received",
        }),
        "FALSE",
      ),
    ).toBe("TRUE");
    expect(
      sheetIntentValue(
        parseSheetFieldIntent({
          field: "form_returned",
          value: true,
          source: "Received",
        }),
        "",
        true,
      ),
    ).toBe("TRUE");
    expect(
      sheetIntentValue(
        parseSheetFieldIntent({
          field: "form_returned",
          value: false,
          source: "Reviewed",
        }),
        "Yes",
      ),
    ).toBe("No");
    expect(
      sheetIntentValue(
        parseSheetFieldIntent({
          field: "renewal_date",
          value: "2026-10-01",
          source: "Approved terms",
        }),
        "",
      ),
    ).toBe("2026-10-01");
  });
});
