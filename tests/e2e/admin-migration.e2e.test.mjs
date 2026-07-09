import { describe, expect, it } from "vitest";
import { createClient, locationPath } from "./helpers/client.mjs";

describe("admin migration console", () => {
  it("redirects signed-out visitors to /sign-in", async () => {
    const client = createClient();
    const response = await client.get("/admin/migration");

    expect(response.status).toBe(307);
    expect(locationPath(response)).toBe("/sign-in");
  });

  it("blocks demo Editors with a forbidden redirect", async () => {
    const client = createClient();
    await client.signInDemo("Editor");

    const response = await client.get("/admin/migration");
    expect(response.status).toBe(307);
    expect(locationPath(response)).toBe("/sign-in?error=forbidden");
  });

  it("renders the read-only readiness panels for a demo Admin", async () => {
    const client = createClient();
    await client.signInDemo();

    const { response, html } = await client.getHtml("/admin/migration");

    expect(response.status).toBe(200);
    expect(html).toContain("Migration Readiness");
    expect(html).toContain("Cutover Blockers");
    expect(html).toContain("Environment Readiness");
    expect(html).toContain("Production Env Preflight");
    expect(html).toContain("Source Corpus Readiness");
    expect(html).toContain("Budget &amp; Away Mode");
    expect(html).toContain("Action Registry Readiness");
    expect(html).toContain("Notification Posture");
    // Copy varies with registry state (all-gated vs an allow-listed executable); assert the stable token.
    expect(html).toContain("production_allowed");
    // Dev/demo sessions honestly report owner-side production blockers.
    expect(html).toContain("Owner-side action required");
  });

  it("links to the migration console from /admin", async () => {
    const client = createClient();
    await client.signInDemo();

    const { response, html } = await client.getHtml("/admin");
    expect(response.status).toBe(200);
    expect(html).toContain("Open migration console");
  });
});

// Locks in graceful degradation when Firestore is unreachable; only runs when the
// harness was started WITHOUT the emulator (matching degraded.e2e.test.mjs).
describe.skipIf(process.env.FIRESTORE_EMULATOR_HOST)(
  "admin migration console without Firestore",
  () => {
    it("falls back to the static seed catalog with a visible note", async () => {
      const client = createClient();
      await client.signInDemo();

      const { response, html } = await client.getHtml("/admin/migration");

      expect(response.status).toBe(200);
      expect(html).toContain(
        "Showing the static seed catalog because Firestore is not available in this session.",
      );
      expect(html).toContain(
        "Approval Queue notification health is not available in this session.",
      );
    });
  },
);
