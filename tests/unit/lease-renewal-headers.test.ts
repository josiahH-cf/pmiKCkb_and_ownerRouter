import { describe, expect, it } from "vitest";
import {
  coarseShape,
  RENEWAL_TAB_SCHEMAS,
  resolveHeaders,
} from "@/lib/lease-renewal/headers";
import {
  SYNTHETIC_INSPECTION_TRACKER_TAB,
  SYNTHETIC_MOVE_IN_TAB,
  SYNTHETIC_OWNER_ONBOARDING_OFFBYONE_TAB,
  SYNTHETIC_PROPERTY_ATTRIBUTES_TAB,
  SYNTHETIC_RENEWALS_TAB,
  SYNTHETIC_UNRECOGNIZED_TAB,
} from "../fixtures/lease-renewal/synthetic-renewal-sheet";

describe("resolveHeaders", () => {
  it("resolves the full Renewals header at row 0 with no MURKY or mismatch", () => {
    const result = resolveHeaders(
      SYNTHETIC_RENEWALS_TAB.grid,
      RENEWAL_TAB_SCHEMAS.Renewals,
    );

    expect(result.headerRowIndex).toBe(0);
    expect(result.preHeaderRowCount).toBe(0);
    expect(result.murkyColumns).toHaveLength(0);
    expect(result.mismatches).toHaveLength(0);
    expect(result.resolvedFields).toMatchObject({
      owner_pricing_confirmed: 0,
      tenant_name: 2,
      renewal_date: 3,
      current_rent: 4,
      market_value: 5,
      esign_complete: 13,
    });
  });

  it("flags the email-in-date header/data mismatch (Move-In)", () => {
    const result = resolveHeaders(
      SYNTHETIC_MOVE_IN_TAB.grid,
      RENEWAL_TAB_SCHEMAS["Move-In Checklist"],
    );

    expect(result.headerRowIndex).toBe(0);
    expect(result.resolvedFields.move_in_date).toBe(1);
    expect(result.mismatches).toContainEqual({
      field: "move_in_date",
      index: 1,
      expectedShape: "date",
      observedShape: "email",
    });
    // The single-letter `f` header cannot be resolved.
    expect(result.murkyColumns.map((c) => c.index)).toContain(0);
  });

  it("treats the leaked literal FALSE header as MURKY (Inspection Tracker)", () => {
    const result = resolveHeaders(
      SYNTHETIC_INSPECTION_TRACKER_TAB.grid,
      RENEWAL_TAB_SCHEMAS["Inspection Tracker"],
    );

    expect(result.headerRowIndex).toBe(0);
    expect(result.murkyColumns.map((c) => c.rawHeader)).toContain("FALSE");
    expect(result.resolvedFields.owner_charge_130).toBe(7);
    expect(result.resolvedFields.next_inspection).toBe(6);
    // Mixed-format dates in real date columns must NOT be flagged as mismatches.
    expect(result.mismatches).toHaveLength(0);
  });

  it("treats a blank header as MURKY and resolves the HOA-conflict lawn-care column", () => {
    const result = resolveHeaders(
      SYNTHETIC_PROPERTY_ATTRIBUTES_TAB.grid,
      RENEWAL_TAB_SCHEMAS["Property Attributes"],
    );

    expect(result.murkyColumns.map((c) => c.index)).toContain(7);
    expect(result.resolvedFields.lawn_care).toBe(4);
    expect(result.resolvedFields.inspections_cadence).toBe(5);
  });

  it("detects an off-by-one header row (Owner Onboarding)", () => {
    const result = resolveHeaders(
      SYNTHETIC_OWNER_ONBOARDING_OFFBYONE_TAB.grid,
      RENEWAL_TAB_SCHEMAS["Owner Onboarding"],
    );

    expect(result.headerRowIndex).toBe(1);
    expect(result.preHeaderRowCount).toBe(1);
    expect(result.resolvedFields).toMatchObject({
      property: 0,
      owner: 1,
      pma_sent: 2,
      pma_signed: 3,
    });
    expect(result.murkyColumns).toHaveLength(0);
    expect(result.mismatches).toHaveLength(0);
  });

  it("returns a null header row when nothing matches the schema", () => {
    const result = resolveHeaders(
      SYNTHETIC_UNRECOGNIZED_TAB.grid,
      RENEWAL_TAB_SCHEMAS.Renewals,
    );
    expect(result.headerRowIndex).toBeNull();
    expect(result.resolvedFields).toEqual({});
  });
});

describe("coarseShape", () => {
  it("classifies the value shapes the connector must distinguish", () => {
    expect(coarseShape("jordan.maple@example.com")).toBe("email");
    expect(coarseShape("$1,250")).toBe("currency");
    expect(coarseShape("$1,400.00")).toBe("currency");
    expect(coarseShape("8/31/2026")).toBe("date");
    expect(coarseShape("09-30-2026")).toBe("date");
    expect(coarseShape("01/2026")).toBe("date");
    expect(coarseShape("September 15, 2023")).toBe("date");
    expect(coarseShape("TRUE")).toBe("boolean");
    expect(coarseShape("yes")).toBe("yes_no");
    expect(coarseShape("n/a")).toBe("yes_no");
    expect(coarseShape("ESTELLE WORKING ON")).toBe("text");
    expect(coarseShape("")).toBe("text");
  });
});
