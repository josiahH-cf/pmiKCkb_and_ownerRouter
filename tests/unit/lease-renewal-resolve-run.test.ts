import { describe, expect, it } from "vitest";

import { resolveRenewalRun } from "@/lib/lease-renewal/resolve-run";
import { SIMULATION_RUN_ID } from "@/lib/lease-renewal/simulation";

// Locks the resolve route's injected run resolver: it rebuilds the live run for the live id and falls
// back to the pure simulation run otherwise, degrading to null (never throwing) when a run is unknown
// or the live sources are unconfigured.
describe("resolveRenewalRun", () => {
  it("rebuilds the deterministic simulation run for the simulation id", async () => {
    const run = await resolveRenewalRun(SIMULATION_RUN_ID);
    expect(run).not.toBeNull();
    expect(run?.runId).toBe(SIMULATION_RUN_ID);
  });

  it("returns null for an unknown run id", async () => {
    expect(await resolveRenewalRun("does-not-exist")).toBeNull();
  });

  it("degrades to null for the live id when live sources are unconfigured", async () => {
    // Hermetic: only assert the unconfigured-degrade path when the live env is absent, so this test
    // never makes a real RentVine/Sheet read. buildLiveRenewalConfig short-circuits before any I/O.
    if (process.env.RENTVINE_API_BASE_URL) {
      return;
    }
    await expect(resolveRenewalRun("live-review")).resolves.toBeNull();
  });
});
