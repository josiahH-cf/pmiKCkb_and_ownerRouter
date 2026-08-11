import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  computeOwnerPolicySuggestion,
  computeRentSuggestion,
  type CompSource,
} from "@/lib/lease-renewal/rent-suggestion";

const COMPS: CompSource[] = [
  { rent: 2200, source: "Manual comp low", label: "Comp A" },
  { rent: 2300, source: "Manual comp midpoint", label: "Comp B" },
  { rent: 2500, source: "Manual comp high", label: "Comp C" },
];

describe("computeRentSuggestion (AC-S29-1)", () => {
  it("is deterministic: two consecutive calls are deep-equal", () => {
    const first = computeRentSuggestion({ comps: COMPS, currentRent: 2300 });
    const second = computeRentSuggestion({ comps: COMPS, currentRent: 2300 });
    expect(first).toEqual(second);
  });

  it("returns the comp median with a non-empty comp source list", () => {
    const result = computeRentSuggestion({ comps: COMPS });
    expect(result.status).toBe("suggested");
    expect(result.method).toBe("comp_median");
    // Median of [2200, 2300, 2500] = 2300.
    expect(result.suggestedRent).toBe(2300);
    expect(Number.isFinite(result.suggestedRent as number)).toBe(true);
    expect(result.comps.length).toBeGreaterThan(0);
    // Every render path shows the number beside its comp sources.
    expect(result.comps).toHaveLength(3);
  });

  it("averages the two middle comps for an even-sized set", () => {
    const result = computeRentSuggestion({
      comps: [
        { rent: 2000, source: "a" },
        { rent: 2400, source: "b" },
      ],
    });
    expect(result.suggestedRent).toBe(2200);
  });

  it("clamps a runaway median into a sane band around current rent", () => {
    const result = computeRentSuggestion({
      comps: [
        { rent: 4000, source: "outlier a" },
        { rent: 4200, source: "outlier b" },
        { rent: 4400, source: "outlier c" },
      ],
      currentRent: 2000,
      policy: { maxDeviationFraction: 0.15 },
    });
    // Median 4200 is clamped to 2000 * 1.15 = 2300.
    expect(result.suggestedRent).toBe(2300);
    expect(result.rationale).toContain("15%");
  });

  it("never emits a number for an empty comp set (needs_verification)", () => {
    const result = computeRentSuggestion({ comps: [], currentRent: 2300 });
    expect(result.status).toBe("needs_verification");
    expect(result.suggestedRent).toBeNull();
    expect(result.comps).toHaveLength(0);
  });

  it("ignores non-finite / non-positive comps and needs verification when none remain", () => {
    const result = computeRentSuggestion({
      comps: [
        { rent: Number.NaN, source: "bad" },
        { rent: 0, source: "zero" },
        { rent: -100, source: "negative" },
      ],
    });
    expect(result.status).toBe("needs_verification");
    expect(result.suggestedRent).toBeNull();
    expect(result.comps).toHaveLength(0);
  });

  it("drops invalid comps but keeps the valid ones as backing sources", () => {
    const result = computeRentSuggestion({
      comps: [
        { rent: 2200, source: "good a" },
        { rent: Number.NaN, source: "bad" },
        { rent: 2400, source: "good b" },
      ],
    });
    expect(result.suggestedRent).toBe(2300);
    expect(result.comps.map((comp) => comp.source)).toEqual(["good a", "good b"]);
  });

  it("is a pure module: no Date.now, network, or filesystem import", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../lib/lease-renewal/rent-suggestion.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(source).not.toMatch(/Date\.now/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/from\s+["']node:fs["']/);
    expect(source).not.toMatch(/from\s+["']node:https?["']/);
    expect(source).not.toMatch(/generateContent|model-provider|llm\/answer/);
  });
});

// S62: the owner-policy suggestion (AC-S62-1, AC-S62-5).
describe("computeOwnerPolicySuggestion", () => {
  const RULE = { portfolioId: "27", percent: 3.5, note: "MKD standing agreement." };

  it("applies the flat percentage to the authoritative current rent, rounded whole", () => {
    const result = computeOwnerPolicySuggestion({ currentRent: 1400, rule: RULE });
    expect(result.status).toBe("suggested");
    expect(result.suggestedRent).toBe(1449); // 1400 * 1.035 = 1449
    expect(result.method).toBe("owner_policy_percent");
    expect(result.rationale).toContain("Owner policy: +3.5% (portfolio 27)");
    expect(result.rationale).toContain("MKD standing agreement.");
    expect(result.comps.length).toBeGreaterThan(0);
    expect(result.comps[0].source).toContain("Owner policy");
  });

  // AC-S62-5: a zero/missing/non-numeric base refuses explicitly; never a percentage of nothing.
  it.each([0, -5, Number.NaN, null, undefined])(
    "refuses with an explicit reason when the base rent is %s",
    (base) => {
      const result = computeOwnerPolicySuggestion({
        currentRent: base as number,
        rule: RULE,
      });
      expect(result.status).toBe("needs_verification");
      expect(result.suggestedRent).toBeNull();
      expect(result.comps).toEqual([]);
      expect(result.rationale).toContain("missing or zero");
    },
  );

  it("refuses an unusable percentage rather than guessing", () => {
    const result = computeOwnerPolicySuggestion({
      currentRent: 1400,
      rule: { portfolioId: "27", percent: 0 },
    });
    expect(result.status).toBe("needs_verification");
    expect(result.suggestedRent).toBeNull();
  });

  it("is deterministic", () => {
    const input = { currentRent: 1400, rule: RULE };
    expect(computeOwnerPolicySuggestion(input)).toEqual(
      computeOwnerPolicySuggestion(input),
    );
  });
});
