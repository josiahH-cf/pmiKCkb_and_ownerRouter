import { describe, expect, it } from "vitest";
import { createClient, locationPath } from "./helpers/client.mjs";

const RUN_INDEX = "/lease-renewal/runs";
const RUN_DETAIL = "/lease-renewal/runs/sim-renewal-001";
const LAWN_CARE_KEY = "lease_renewal:reconcile:sim-renewal-001:lawn_care";
const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe("lease renewal review surface", () => {
  it("redirects signed-out visitors to /sign-in", async () => {
    const client = createClient();

    for (const path of [RUN_INDEX, RUN_DETAIL]) {
      const response = await client.get(path);
      expect(response.status, `${path} should redirect`).toBe(307);
      expect(locationPath(response), `${path} redirect target`).toBe("/sign-in");
    }
  });

  it("renders the index and a simulation run for a signed-in user", async () => {
    const client = createClient();
    await client.signInDemo("Admin");

    const index = await client.getHtml(RUN_INDEX);
    expect(index.response.status).toBe(200);
    expect(index.html).toContain("Lease Renewal");

    const detail = await client.getHtml(RUN_DETAIL);
    expect(detail.response.status).toBe(200);
    expect(detail.html).toContain("Simulation-only");
    expect(detail.html).toContain("High");
    // No credential placeholder from the excluded tabs may reach the rendered page.
    expect(detail.html).not.toContain("PLACEHOLDER");
  });

  it("rejects a resolution with no reason (400)", async () => {
    const client = createClient();
    await client.signInDemo("Admin");

    const response = await client.postJson("/api/lease-renewal/resolve", {
      run_id: "sim-renewal-001",
      source_trigger_key: LAWN_CARE_KEY,
      kind: "flag_incorrect",
    });

    expect(response.status).toBe(400);
  });

  it("blocks an Approver from resolving a High flag (403)", async () => {
    const client = createClient();
    await client.signInDemo("Approver");

    const response = await client.postJson("/api/lease-renewal/resolve", {
      run_id: "sim-renewal-001",
      source_trigger_key: LAWN_CARE_KEY,
      kind: "flag_incorrect",
      reason: "an Approver attempting to resolve a High flag",
    });

    expect(response.status).toBe(403);
  });

  (hasEmulator ? it : it.skip)(
    "resolves a High flag end-to-end and persists a queued (never executed) write-back",
    async () => {
      const client = createClient();
      await client.signInDemo("Admin");

      const response = await client.postJson("/api/lease-renewal/resolve", {
        run_id: "sim-renewal-001",
        source_trigger_key: LAWN_CARE_KEY,
        kind: "pick_source",
        chosen_source: "rentvine_building",
        reason: "Building-level record reflects the current lawn-care responsibility.",
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.resolution.status).toBe("Resolved");
      expect(body.resolution.proposed_writeback.production_allowed).toBe(false);
      expect(body.activity.length).toBeGreaterThan(0);

      const detail = await client.getHtml(RUN_DETAIL);
      expect(detail.html).toContain("Resolved");
    },
  );
});
