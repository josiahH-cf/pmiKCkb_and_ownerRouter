import { describe, expect, it } from "vitest";

import { evaluateGoldenScenarios } from "@/lib/lease-renewal/golden/harness";
import { loadVerifiedCapturedScenarios } from "@/lib/lease-renewal/golden/load";

// The captured-golden loader feeds the harness gate from a gitignored, in-boundary dir. It must load
// ONLY human-verified sets (drafts await labeling) and stay CI-safe when no captured data is present.
const FIXTURE_DIR = "tests/fixtures/golden/captured";

describe("loadVerifiedCapturedScenarios", () => {
  it("loads only verified captured sets and skips drafts", () => {
    const loaded = loadVerifiedCapturedScenarios(FIXTURE_DIR);
    expect(loaded.map((scenario) => scenario.name)).toEqual(["verified-sample"]);
  });

  it("returns [] when the captured dir is absent (CI / fresh checkout)", () => {
    expect(loadVerifiedCapturedScenarios("tests/fixtures/golden/does-not-exist")).toEqual(
      [],
    );
  });

  it("produces harness-ready scenarios that evaluate cleanly", () => {
    const result = evaluateGoldenScenarios(loadVerifiedCapturedScenarios(FIXTURE_DIR));
    expect(result.scenarioCount).toBe(1);
    expect(result.falsePositives).toBe(0);
  });
});
