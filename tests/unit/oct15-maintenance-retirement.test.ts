import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/session", () => ({
  authenticateSessionCookie: vi.fn(),
  getSessionCookieName: () => "pmi-session",
  readLocalDemoSessionRole: () => null,
}));
vi.mock("@/lib/environment/descriptor", () => ({
  resolveEnvironmentDescriptor: () => ({
    ok: true,
    descriptor: { environmentKind: "production", dataContext: "live" },
  }),
}));
import { proxy } from "../../proxy";

describe("October 20 complete maintenance retirement HTTP boundary", () => {
  it.each([
    ["POST", "/api/maintenance/tickets"],
    ["PATCH", "/api/maintenance/tickets/retained-ticket"],
    ["POST", "/api/maintenance/intake/public"],
    ["POST", "/api/maintenance/intake/token"],
    ["POST", "/api/maintenance/owner-notice-draft"],
    ["POST", "/api/maintenance/work-order-chat"],
    ["POST", "/api/vendor/tickets/retained-ticket/work"],
    ["POST", "/api/admin/vendors/live/actions"],
    ["GET", "/api/maintenance/units/search"],
    ["GET", "/api/maintenance/tickets"],
    ["HEAD", "/api/maintenance/tickets/retained-ticket/history"],
    ["GET", "/api/maintenance/reports"],
    ["GET", "/api/vendor/tickets/retained-ticket/work"],
  ])("refuses retired %s %s before its handler can execute", async (method, path) => {
    const response = await proxy(
      new NextRequest(`https://app.invalid${path}`, { method }),
    );
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error_type: "MaintenanceRetired" });
  });

  it.each([
    "/maintenance",
    "/maintenance/vendors",
    "/maintenance/history",
    "/maintenance/report",
    "/maintenance/retired",
    "/maintenance/policies",
    "/vendor",
    "/vendor/setup",
    "/admin/vendors",
  ])("redirects retired page %s without a history component", async (path) => {
    const response = await proxy(new NextRequest(`https://app.invalid${path}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.invalid/lease-renewal");
  });

  it.each(["/lease-renewal", "/api/gmail-hub/connection", "/api/ask"])(
    "preserves the existing authorization handler for %s",
    async (path) => {
      const response = await proxy(new NextRequest(`https://app.invalid${path}`));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );
});
