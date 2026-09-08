import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const auth = vi.hoisted(() => ({
  rehearsal: false,
  user: {
    uid: "isolated-canary",
    email: "canary-admin@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin",
  },
}));
vi.mock("@/lib/auth/session", () => ({
  authenticateSessionCookie: vi.fn(async () => auth.user),
  getSessionCookieName: () => "pmi-session",
  readLocalDemoSessionRole: (cookie: string) =>
    auth.rehearsal && cookie === "local-demo:Admin" ? "Admin" : null,
}));
vi.mock("@/lib/environment/descriptor", () => ({
  resolveEnvironmentDescriptor: () => ({
    ok: true,
    descriptor: auth.rehearsal
      ? { environmentKind: "demo", dataContext: "live_readonly" }
      : { environmentKind: "production", dataContext: "live" },
  }),
}));
import { proxy } from "../../proxy";
import { authenticateSessionCookie } from "@/lib/auth/session";

async function request(method: string, path: string) {
  return proxy(
    new NextRequest(`https://app.invalid${path}`, {
      method,
      headers: { cookie: "pmi-session=isolated-fixture-cookie" },
    }),
  );
}
describe("server canary boundary before route execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.rehearsal = false;
    auth.user.email = "canary-admin@pmikcmetro.com";
  });
  it.each([
    ["POST", "/api/lease-renewal/rentvine-writeback"],
    ["POST", "/api/lease-renewal/renewal-notice-draft"],
    ["POST", "/api/maintenance/work-order-chat"],
    ["POST", "/api/lease-renewal/operating-sheet"],
    ["POST", "/api/admin/access/review/isolated-request/apply"],
    ["POST", "/lease-renewal"],
    ["GET", "/api/lease-renewal/comp-screenshot?operation=reconcile"],
    ["GET", "/api/connections/dotloop/callback?code=fixture"],
  ])(
    "refuses %s %s without forwarding to an executor or writer",
    async (method, path) => {
      const response = await request(method, path);
      expect(response.status).toBe(403);
      expect(response.headers.get("x-middleware-next")).toBeNull();
      expect(await response.json()).toMatchObject({ error_type: "canary_read_only" });
    },
  );
  it.each([
    ["GET", "/admin"],
    ["GET", "/api/auth/me"],
    ["POST", "/api/assistant/query"],
    ["POST", "/api/auth/session"],
    ["DELETE", "/api/auth/session"],
  ])("preserves role-aware read/auth operation %s %s", async (method, path) => {
    expect((await request(method, path)).headers.get("x-middleware-next")).toBe("1");
    expect(auth.user.role).toBe("Admin");
  });
  it("preserves ordinary staff's existing effect gates", async () => {
    auth.user.email = "josiah@pmikcmetro.com";
    expect(
      (await request("POST", "/api/lease-renewal/rentvine-writeback")).headers.get(
        "x-middleware-next",
      ),
    ).toBe("1");
  });
  it("preserves a locally enabled Demo read session without Firebase verification", async () => {
    auth.rehearsal = true;
    const response = await proxy(
      new NextRequest("http://localhost/api/ask", {
        method: "POST",
        headers: { cookie: "pmi-session=local-demo:Admin" },
      }),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(authenticateSessionCookie).not.toHaveBeenCalled();
  });
  it("refuses a rehearsal effect before checking a session", async () => {
    auth.rehearsal = true;
    const response = await request(
      "POST",
      "/api/lease-renewal/runs/isolated/resolutions",
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error_type: "LiveReadOnlyMutationRefused",
    });
    expect(authenticateSessionCookie).not.toHaveBeenCalled();
  });
  it("does not accept the Demo session exception in production", async () => {
    const response = await proxy(
      new NextRequest("https://app.invalid/api/ask", {
        method: "POST",
        headers: { cookie: "pmi-session=local-demo:Admin" },
      }),
    );
    expect(response.status).toBe(403);
    expect(authenticateSessionCookie).toHaveBeenCalledWith("local-demo:Admin");
    expect(await response.json()).toMatchObject({ error_type: "canary_read_only" });
  });
});
