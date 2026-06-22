import { describe, expect, it } from "vitest";

import {
  getSimulationRun,
  listSimulationRuns,
  SIMULATION_RUN_ID,
} from "@/lib/lease-renewal/simulation";

describe("lease-renewal simulation", () => {
  it("lists one canonical simulation run", () => {
    const runs = listSimulationRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].runId).toBe(SIMULATION_RUN_ID);
  });

  it("returns null for an unknown run id", () => {
    expect(getSimulationRun("does-not-exist")).toBeNull();
  });

  it("computes a deterministic, write-free run with the expected flag mix", () => {
    const run = getSimulationRun(SIMULATION_RUN_ID);
    expect(run).not.toBeNull();
    const result = run!;

    expect(result.production_allowed).toBe(false);
    expect(result.manifest.credentialTabsExcluded).toBe(2);
    expect(result.flags.length).toBeGreaterThan(0);

    // A representative spread of severities for review.
    expect(result.bySeverity.High.length).toBeGreaterThan(0);
    expect(result.bySeverity.Blocked.length).toBeGreaterThan(0);
    expect(result.bySeverity.Medium.length).toBeGreaterThan(0);

    // Determinism: recomputing yields an identical result.
    expect(getSimulationRun(SIMULATION_RUN_ID)).toEqual(result);
  });

  it("never leaks a credential placeholder into the run output", () => {
    const result = getSimulationRun(SIMULATION_RUN_ID)!;
    expect(JSON.stringify(result)).not.toContain("PLACEHOLDER");
  });
});
