import { describe, expect, it } from "vitest";
import type { FieldReconciliation } from "@/lib/lease-renewal/reconciliation";
import { buildWritebackProposal } from "@/lib/lease-renewal/writeback-proposal";

function makeRecon(overrides: Partial<FieldReconciliation> = {}): FieldReconciliation {
  return {
    field_key: overrides.field_key ?? "current_rent",
    candidates: overrides.candidates ?? [
      { source: "rentvine", source_system: "RentVine", value: 1500 },
      { source: "sheet", source_system: "Renewal sheet", value: 1450 },
    ],
    agreement: overrides.agreement ?? "conflict",
    suggested_winner:
      overrides.suggested_winner === undefined
        ? { source: "rentvine", value: 1500 }
        : overrides.suggested_winner,
    suggestion_only: true,
    auto_apply_allowed: overrides.auto_apply_allowed ?? false,
    severity: overrides.severity ?? "High",
    severity_rule: overrides.severity_rule ?? 1,
    confidence_for_draft: overrides.confidence_for_draft ?? "Conflict",
    raise_flag: overrides.raise_flag ?? true,
    blocked_reason: overrides.blocked_reason,
  };
}

describe("buildWritebackProposal", () => {
  it("proposes an append-only value from the suggested winner", () => {
    const proposal = buildWritebackProposal(makeRecon(), { fieldLabel: "Current rent" });

    expect(proposal).not.toBeNull();
    expect(proposal?.status).toBe("Proposed");
    expect(proposal?.valueReady).toBe(true);
    expect(proposal?.proposedValue).toBe("1500");
    expect(proposal?.sourceSystem).toBe("RentVine");
    expect(proposal?.method).toBe("append_only_column");
    expect(proposal?.proposedColumnHeader).toBe("KB Proposed — Current rent");
    // Binding guardrails are structural, not prose.
    expect(proposal?.requiresApproval).toBe(true);
    expect(proposal?.autoApplyAllowed).toBe(false);
    expect(proposal?.suggestionOnly).toBe(true);
  });

  it("returns null when the reconciliation raised no flag", () => {
    expect(
      buildWritebackProposal(makeRecon({ raise_flag: false }), { fieldLabel: "X" }),
    ).toBeNull();
  });

  it("proposes no value for a blocked flag and never invents one", () => {
    const proposal = buildWritebackProposal(
      makeRecon({
        suggested_winner: null,
        blocked_reason: "no precedence rule",
        severity: "Blocked",
      }),
      { fieldLabel: "Lawn care" },
    );

    expect(proposal?.status).toBe("Blocked");
    expect(proposal?.valueReady).toBe(false);
    expect(proposal?.proposedValue).toBeNull();
    expect(proposal?.sourceSystem).toBeNull();
    expect(proposal?.rationale).toContain("no precedence rule");
  });

  it("proposes no value for a missing field", () => {
    const proposal = buildWritebackProposal(
      makeRecon({ suggested_winner: null, agreement: "missing", candidates: [] }),
      { fieldLabel: "Renewal date" },
    );

    expect(proposal?.valueReady).toBe(false);
    expect(proposal?.proposedValue).toBeNull();
    expect(proposal?.rationale).toContain("missing a source");
  });

  it("stringifies a boolean winner and never proposes a null value", () => {
    const boolProposal = buildWritebackProposal(
      makeRecon({ suggested_winner: { source: "rentvine", value: true } }),
      { fieldLabel: "Lawn care" },
    );
    expect(boolProposal?.proposedValue).toBe("yes");
    expect(boolProposal?.valueReady).toBe(true);

    const nullProposal = buildWritebackProposal(
      makeRecon({ suggested_winner: { source: "rentvine", value: null } }),
      { fieldLabel: "X" },
    );
    expect(nullProposal?.valueReady).toBe(false);
    expect(nullProposal?.proposedValue).toBeNull();
  });

  it("falls back to the winner source id when no candidate matches", () => {
    const proposal = buildWritebackProposal(
      makeRecon({
        suggested_winner: { source: "ghost", value: 1 },
        candidates: [{ source: "rentvine", source_system: "RentVine", value: 1 }],
      }),
      { fieldLabel: "X" },
    );

    expect(proposal?.sourceSystem).toBe("ghost");
    expect(proposal?.proposedValue).toBe("1");
  });
});
