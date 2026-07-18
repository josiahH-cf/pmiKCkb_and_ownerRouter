import { describe, expect, it } from "vitest";

import {
  createRenewalRunResolver,
  resolveRenewalRun,
} from "@/lib/lease-renewal/resolve-run";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
import { SIMULATION_RUN_ID } from "@/lib/lease-renewal/simulation";

const editor = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};

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

  it("resolves a persisted Test run through the actor-bound route resolver", async () => {
    const db = new FakeFirestore();
    const runId = "test-renewal-persisted";
    db.store.set(`lease_renewal_test_runs/${runId}`, {
      data_mode: "test",
      scenario: "canonical-v1",
      status: "Created",
      labels: ["TEST DATA"],
      created_at: "2026-07-18T00:00:00.000Z",
      updated_at: "2026-07-18T00:00:00.000Z",
    });

    const resolve = createRenewalRunResolver(editor, db as never);
    await expect(resolve(runId)).resolves.toMatchObject({ runId });
    await expect(resolve("test-renewal-missing")).resolves.toBeNull();
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
