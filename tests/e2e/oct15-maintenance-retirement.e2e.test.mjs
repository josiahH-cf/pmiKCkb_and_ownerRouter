import { describe, expect, it } from "vitest";
import { createClient, locationPath } from "./helpers/client.mjs";

describe("retired maintenance through the served request boundary", () => {
  it.each(["/maintenance", "/vendor", "/admin/vendors"])(
    "renders a public retirement notice at %s without operational controls",
    async (path) => {
      const { response, html } = await createClient().getHtml(path);
      expect(response.status).toBe(200);
      expect(html).toContain("Custom maintenance is retired");
      expect(html).toContain('href="/maintenance/history"');
      expect(html).not.toMatch(
        /<form\b|Capture maintenance|Create work order|Invite vendor/,
      );
    },
  );
  it.each([
    "/api/maintenance/tickets",
    "/api/maintenance/intake/public",
    "/api/admin/vendors/live/actions",
  ])("refuses %s before any route-owned mutation", async (path) => {
    const response = await createClient().postJson(path, {});
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error_type: "MaintenanceRetired" });
  });
  it("keeps retained history behind its original staff sign-in boundary", async () => {
    const response = await createClient().get("/maintenance/history");
    expect(response.status).toBe(307);
    expect(locationPath(response)).toBe("/sign-in");
  });
});
