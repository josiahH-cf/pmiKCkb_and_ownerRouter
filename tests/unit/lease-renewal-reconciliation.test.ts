import { describe, expect, it } from "vitest";
import { PRECEDENCE_CONFIRMED } from "@/lib/lease-renewal/field-reconciliation-rules";
import { reconcileField, type ReconCandidate } from "@/lib/lease-renewal/reconciliation";

function candidate(source: string, value: ReconCandidate["value"]): ReconCandidate {
  return { source, source_system: source, value };
}

describe("reconcileField — worked cases (§3.2)", () => {
  it("Case A: inspection-cadence conflict is Medium and suggests the building-level value", () => {
    const result = reconcileField("inspections_cadence", [
      candidate("sheet_tab17", "1 per year"),
      candidate("sheet_tab18", "2 per year"),
      candidate("rentvine_building", "1 per year"),
    ]);

    expect(result.agreement).toBe("conflict");
    expect(result.severity).toBe("Medium");
    expect(result.confidence_for_draft).toBe("Conflict");
    expect(result.raise_flag).toBe(true);
    expect(result.suggested_winner).toEqual({ source: "rentvine_building", value: "1 per year" });
    expect(result.auto_apply_allowed).toBe(false);
  });

  it("Case A escalation: cadence implicating the $130 owner charge becomes High", () => {
    const result = reconcileField(
      "inspections_cadence",
      [candidate("sheet_tab17", "1 per year"), candidate("rentvine_building", "2 per year")],
      { implicatesOwnerCharge: true },
    );
    expect(result.severity).toBe("High");
  });

  it("Case B: lawn-care conflict is High and suggests the contractual source", () => {
    const result = reconcileField("lawn_care", [
      candidate("spreadsheet", "Tenant"),
      candidate("rentvine_building", "HOA"),
    ]);

    expect(result.agreement).toBe("conflict");
    expect(result.severity).toBe("High");
    expect(result.suggested_winner).toEqual({ source: "rentvine_building", value: "HOA" });
    expect(result.raise_flag).toBe(true);
  });

  it("date mismatch: Rentvine vs Tab 3 renewal date is High, Rentvine suggested", () => {
    const result = reconcileField("renewal_date", [
      candidate("rentvine", "2026-09-30"),
      candidate("sheet_tab3", "2026-08-31"),
    ]);
    expect(result.severity).toBe("High");
    expect(result.suggested_winner?.source).toBe("rentvine");
  });

  it("agreement raises no flag and never sets Conflict confidence", () => {
    const result = reconcileField("current_rent", [
      candidate("rentvine", 1250),
      candidate("sheet_tab3", 1250),
    ]);
    expect(result.agreement).toBe("agree");
    expect(result.raise_flag).toBe(false);
    expect(result.confidence_for_draft).not.toBe("Conflict");
  });

  it("single source raises no flag", () => {
    const result = reconcileField("renewal_date", [candidate("rentvine", "2026-09-30")]);
    expect(result.agreement).toBe("single_source");
    expect(result.raise_flag).toBe(false);
  });

  it("missing on a gating (High) field raises a Blocked-grade flag", () => {
    const result = reconcileField("renewal_date", [
      candidate("rentvine", ""),
      candidate("sheet_tab3", null),
    ]);
    expect(result.agreement).toBe("missing");
    expect(result.severity).toBe("High");
    expect(result.raise_flag).toBe(true);
    expect(result.confidence_for_draft).toBe("Needs Review");
  });

  it("unlisted field type degrades to Blocked 'no precedence rule' (OQ-PREC-1)", () => {
    const result = reconcileField("mystery_field", [
      candidate("sheet_tab3", "A"),
      candidate("rentvine", "B"),
    ]);
    expect(result.severity).toBe("Blocked");
    expect(result.blocked_reason).toBe("no precedence rule");
    expect(result.suggested_winner).toBeNull();
    expect(result.raise_flag).toBe(true);
  });
});

describe("reconciliation gating invariants", () => {
  it("is suggestion-only and never auto-applies until OQ-PREC-1 confirms the precedence table", () => {
    expect(PRECEDENCE_CONFIRMED).toBe(false);
    const results = [
      reconcileField("lawn_care", [candidate("spreadsheet", "Tenant"), candidate("rentvine_building", "HOA")]),
      reconcileField("esign_complete", [candidate("spreadsheet", "yes"), candidate("inferred", "no")]),
      reconcileField("inspections_cadence", [candidate("sheet_tab17", "1 per year"), candidate("sheet_tab18", "2 per year")]),
    ];
    for (const result of results) {
      expect(result.suggestion_only).toBe(true);
      expect(result.auto_apply_allowed).toBe(false);
    }
  });
});
