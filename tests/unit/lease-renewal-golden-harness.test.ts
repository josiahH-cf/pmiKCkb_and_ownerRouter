import { describe, expect, it } from "vitest";

import { evaluateGoldenScenarios } from "@/lib/lease-renewal/golden/harness";
import { GOLDEN_SCENARIOS } from "@/lib/lease-renewal/golden/scenarios";

// The golden-data acceptance gate (R2): the reconciliation pipeline must match ground truth on the
// labeled scenarios. The headline guard is the false-positive rate — the metric the ~397-flag live
// run lacked. Failure messages surface the exact offending (tab#row#field) so a regression is legible.
describe("lease-renewal golden-data harness", () => {
  const result = evaluateGoldenScenarios(GOLDEN_SCENARIOS);

  it("raises zero false-positive flags across the golden set", () => {
    expect(result.diffs.filter((diff) => diff.kind === "false_positive")).toEqual([]);
    expect(result.falsePositiveRate).toBe(0);
  });

  it("catches every flag ground truth expects (no false negatives)", () => {
    expect(result.diffs.filter((diff) => diff.kind === "false_negative")).toEqual([]);
  });

  it("assigns the correct severity to each expected flag", () => {
    expect(result.diffs.filter((diff) => diff.kind === "severity_mismatch")).toEqual([]);
  });

  it("exercises a representative, non-trivial flag set", () => {
    expect(result.truePositives).toBeGreaterThanOrEqual(5);
  });
});
