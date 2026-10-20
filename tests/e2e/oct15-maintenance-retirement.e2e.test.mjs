import { describe, expect, it } from "vitest";
import { createClient, locationPath } from "./helpers/client.mjs";
describe("complete maintenance retirement through the served request boundary", () => {
  it.each([
    "/maintenance",
    "/maintenance/history",
    "/maintenance/report",
    "/maintenance/retired",
    "/vendor",
    "/admin/vendors",
  ])("leaves retired bookmark %s without loading the component", async (path) => {
    const response = await createClient().get(path);
    expect(response.status).toBe(307);
    expect(locationPath(response)).toBe("/lease-renewal");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each([
    "/api/maintenance/tickets",
    "/api/maintenance/intake/public",
    "/api/admin/vendors/live/actions",
  ])("refuses %s before route-owned mutation", async (path) => {
    const response = await createClient().postJson(path, {});
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ error_type: "MaintenanceRetired" });
  });
  it.each([
    "/api/maintenance/tickets",
    "/api/maintenance/tickets/retained-ticket/history",
    "/api/maintenance/reports",
    "/api/vendor/tickets",
  ])("refuses retired historical read %s before its handler", async (path) => {
    const response = await createClient().get(path);
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error_type: "MaintenanceRetired" });
  });
});
