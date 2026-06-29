import { describe, expect, it } from "vitest";

import { evaluateGoldenScenarios } from "@/lib/lease-renewal/golden/harness";
import { loadVerifiedCapturedScenarios } from "@/lib/lease-renewal/golden/load";
import { GOLDEN_SCENARIOS } from "@/lib/lease-renewal/golden/scenarios";

// The golden-data acceptance gate (R2): the reconciliation pipeline must match ground truth on the
// labeled scenarios. The headline guard is the false-positive rate — the metric the ~397-flag live
// run lacked. Failure messages surface the exact offending (tab#row#field) so a regression is legible.
// The committable synthetic set always runs; any human-VERIFIED live-captured sets (gitignored,
// in-boundary) gate too — absent on CI / fresh checkouts, so this stays green without local data.
describe("lease-renewal golden-data harness", () => {
  const result = evaluateGoldenScenarios([
    ...GOLDEN_SCENARIOS,
    ...loadVerifiedCapturedScenarios(),
  ]);

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
