import { describe, expect, it } from "vitest";
import { buildWorkOrderDraft } from "@/lib/maintenance/work-order-draft";
import {
  UNIT_ADDRESS_UNVERIFIED,
  deriveUnitCandidatesFromExport,
  matchLocationToUnit,
  type UnitCandidate,
} from "@/lib/maintenance/unit-matcher";

const CANDIDATES: UnitCandidate[] = [
  { unitId: "unit:456", label: "123 Main Street Unit 2" },
  { unitId: "unit:7001", label: "100 Birchwood Lane" },
  { unitId: "unit:7002", label: "500 Elm Street" },
];

describe("matchLocationToUnit", () => {
  it("resolves a structured unit id present verbatim to Verified", () => {
    const result = matchLocationToUnit("leaky faucet at unit:456 kitchen", CANDIDATES);
    expect(result.match).toEqual({
      unitId: "unit:456",
      label: "123 Main Street Unit 2",
      confidence: "Verified",
    });
  });

  it("caps a perfect fuzzy address match at Likely (never Verified from fuzzy)", () => {
    // "Ln" normalizes to "lane" via the shared address abbreviations, so this is a 1.0 token match.
    const result = matchLocationToUnit("100 Birchwood Ln", CANDIDATES);
    expect(result.match?.unitId).toBe("unit:7001");
    expect(result.match?.confidence).toBe("Likely");
  });

  it("routes a tie at the top score to Needs Review without guessing", () => {
    const tied: UnitCandidate[] = [
      { unitId: "unit:a", label: "500 Elm Street" },
      { unitId: "unit:b", label: "500 Elm Street" },
    ];
    const result = matchLocationToUnit("500 Elm Street", tied);
    expect(result.match?.confidence).toBe("Needs Review");
    // The two tied candidates are both surfaced for a human to choose between.
    expect(result.candidates.filter((c) => c.score === 1)).toHaveLength(2);
  });

  it("returns a mid-range unique match as Needs Review", () => {
    // 5 shared of 6 union tokens = 0.833 → in [0.4, 0.85).
    const result = matchLocationToUnit("123 Main Street Unit 2 Rear", [CANDIDATES[0]]);
    expect(result.match?.unitId).toBe("unit:456");
    expect(result.match?.confidence).toBe("Needs Review");
  });

  it("returns no match below the ambiguous threshold", () => {
    const result = matchLocationToUnit("999 Nowhere Boulevard", CANDIDATES);
    expect(result.match).toBeNull();
  });

  it("is deterministic for the same input", () => {
    const a = matchLocationToUnit("123 Main St #2", CANDIDATES);
    const b = matchLocationToUnit("123 Main St #2", CANDIDATES);
    expect(a).toEqual(b);
  });

  it("never auto-merges and always exposes candidates for override", () => {
    const result = matchLocationToUnit("100 Birchwood Ln", CANDIDATES);
    expect(result.autoMerge).toBe(false);
    expect(result.candidates).toHaveLength(3);
    // Ordered best-first.
    expect(result.candidates[0].score).toBeGreaterThanOrEqual(result.candidates[1].score);
  });

  it("handles empty candidates and empty location without throwing", () => {
    expect(matchLocationToUnit("anything", []).match).toBeNull();
    expect(matchLocationToUnit("", CANDIDATES).match).toBeNull();
  });
});

describe("deriveUnitCandidatesFromExport (confirmed live shape 2026-07-01)", () => {
  it("lifts the unit id + composes the street label from the unit append", () => {
    // Confirmed: the `unit` append carries unitID + streetNumber/streetName/address2.
    const { candidates, skipped } = deriveUnitCandidatesFromExport([
      {
        unit: {
          unitID: "456",
          streetNumber: "123",
          streetName: "Main Street",
          address2: "Unit 2",
          propertyID: "99",
        },
      },
    ]);
    expect(candidates).toEqual([
      { unitId: "unit:456", label: "123 Main Street Unit 2", propertyId: "99" },
    ]);
    expect(skipped).toBe(0);
  });

  it("falls back to Needs Verification when the unit append has no address", () => {
    const { candidates } = deriveUnitCandidatesFromExport([{ unit: { unitID: "789" } }]);
    expect(candidates).toEqual([{ unitId: "unit:789", label: UNIT_ADDRESS_UNVERIFIED }]);
  });

  it("uses the lease FK for the id when the unit append lacks one", () => {
    const { candidates } = deriveUnitCandidatesFromExport([
      { lease: { unitID: "789" }, unit: { streetNumber: "1", streetName: "A Street" } },
    ]);
    expect(candidates).toEqual([{ unitId: "unit:789", label: "1 A Street" }]);
  });

  it("skips (and counts) a row with no resolvable unit id", () => {
    const { candidates, skipped } = deriveUnitCandidatesFromExport([
      { property: { propertyID: "99" } },
      {},
    ]);
    expect(candidates).toEqual([]);
    expect(skipped).toBe(2);
  });

  it("de-duplicates repeated unit ids and matches a live-shaped candidate", () => {
    const { candidates } = deriveUnitCandidatesFromExport([
      { unit: { unitID: "456", streetNumber: "123", streetName: "Main Street" } },
      { unit: { unitID: "456", streetNumber: "123", streetName: "Main Street" } },
    ]);
    expect(candidates).toHaveLength(1);
    // End-to-end: a reporter's free text matches the composed live label.
    const match = matchLocationToUnit("123 Main St", candidates).match;
    expect(match?.unitId).toBe("unit:456");
    expect(match?.confidence).toBe("Likely");
  });
});

describe("unit matcher wires into buildWorkOrderDraft with zero change", () => {
  const base = {
    reporterUid: "u-1",
    typedNote: "leaky faucet",
    capturedAt: "2026-07-01T10:00:00Z",
  };

  it("a Likely match clears the unit blockers", () => {
    const match = matchLocationToUnit("100 Birchwood Ln", CANDIDATES).match;
    const draft = buildWorkOrderDraft({ ...base, unit: match });
    expect(draft.unit).toEqual({ unitId: "unit:7001", label: "100 Birchwood Lane" });
    expect(draft.blockers).not.toContain("Match the location to a unit.");
    expect(draft.blockers).not.toContain(
      "Confirm the matched unit (low-confidence match).",
    );
  });

  it("a Needs Review match raises the confirm blocker", () => {
    const match = matchLocationToUnit("123 Main Street Unit 2 Rear", [
      CANDIDATES[0],
    ]).match;
    const draft = buildWorkOrderDraft({ ...base, unit: match });
    expect(draft.blockers).toContain("Confirm the matched unit (low-confidence match).");
  });

  it("a null match raises the match blocker", () => {
    const match = matchLocationToUnit("999 Nowhere Boulevard", CANDIDATES).match;
    const draft = buildWorkOrderDraft({ ...base, unit: match });
    expect(draft.blockers).toContain("Match the location to a unit.");
  });
});
