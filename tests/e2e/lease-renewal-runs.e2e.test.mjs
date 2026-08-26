import { describe, expect, it } from "vitest";
import { createClient, locationPath } from "./helpers/client.mjs";

const RUN_INDEX = "/lease-renewal/runs";
const RUN_DETAIL = "/lease-renewal/runs/sim-renewal-001";

describe("retired lease-renewal Test-run compatibility", () => {
  it("redirects signed-out visitors to /sign-in", async () => {
    const client = createClient();

    for (const path of [RUN_INDEX, RUN_DETAIL]) {
      const response = await client.get(path);
      expect(response.status, `${path} should redirect`).toBe(307);
      expect(locationPath(response), `${path} redirect target`).toBe("/sign-in");
    }
  });

  it("redirects signed-in historical links to the canonical Live review", async () => {
    const client = createClient();
    await client.signInDemo("Admin");

    for (const path of [RUN_INDEX, RUN_DETAIL]) {
      const response = await client.get(path);
      expect(response.status).toBe(307);
      expect(locationPath(response)).toBe("/lease-renewal/live");
    }
  });

  it("refuses resolution mutations throughout Live-read-only rehearsal", async () => {
    const client = createClient();
    await client.signInDemo("Admin");

    const response = await client.postJson("/api/lease-renewal/resolve", {
      run_id: "sim-renewal-001",
      source_trigger_key:
        "lease_renewal:reconcile:sim-renewal-001:retired-record:lawn_care",
      kind: "flag_incorrect",
      reason: "A retired simulation must remain unavailable.",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/read only/i),
      error_type: "LiveReadOnlyMutationRefused",
    });
  });
});
