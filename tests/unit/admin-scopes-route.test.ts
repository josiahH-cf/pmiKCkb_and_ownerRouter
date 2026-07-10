import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/users", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/admin/users")>();
  return { ...actual, setAppUserScopes: vi.fn() };
});

import { PATCH } from "@/app/api/admin/users/[uid]/scopes/route";
import { UserManagementError, setAppUserScopes } from "@/lib/admin/users";
import { setAuthResolverForTest } from "@/lib/auth/session";

function setActor(role: "Editor" | "Approver" | "Admin") {
  setAuthResolverForTest(() => ({
    email: `${role.toLowerCase()}@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role,
    uid: `${role.toLowerCase()}-1`,
  }));
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/admin/users/u1/scopes", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
}

const ctx = { params: Promise.resolve({ uid: "u1" }) };

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(setAppUserScopes).mockReset();
});

describe("admin user scopes API route", () => {
  it("forbids a caller without manageAdmin before any claim write", async () => {
    setActor("Approver");
    const response = await PATCH(
      patchRequest({ scopes: ["maintenance"], reason: "maintenance sub-user" }),
      ctx,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toHaveProperty("error");
    expect(setAppUserScopes).not.toHaveBeenCalled();
  });

  it("passes a known non-empty scope set to the service and returns its user", async () => {
    setActor("Admin");
    vi.mocked(setAppUserScopes).mockResolvedValue({
      uid: "u1",
      email: "worker@pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
      disabled: false,
      lastSignInAt: null,
    });

    const response = await PATCH(
      patchRequest({ scopes: ["maintenance"], reason: "maintenance sub-user" }),
      ctx,
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(setAppUserScopes).mock.calls[0][0]).toMatchObject({
      targetUid: "u1",
      scopes: ["maintenance"],
      reason: "maintenance sub-user",
    });
    expect(await response.json()).toMatchObject({
      user: { role: "Editor", scopes: ["maintenance"] },
    });
  });

  it("maps null to an absent claim for All spaces", async () => {
    setActor("Admin");
    vi.mocked(setAppUserScopes).mockResolvedValue({
      uid: "u1",
      email: "worker@pmikcmetro.com",
      role: "Editor",
      scopes: undefined,
      disabled: false,
      lastSignInAt: null,
    });

    const response = await PATCH(
      patchRequest({ scopes: null, reason: "restore all spaces" }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(vi.mocked(setAppUserScopes).mock.calls[0][0].scopes).toBeUndefined();
  });

  it.each([
    [{ scopes: [], reason: "maintenance sub-user" }, "empty"],
    [{ scopes: ["unknown"], reason: "maintenance sub-user" }, "unknown"],
    [{ scopes: ["maintenance"], reason: "x" }, "short reason"],
  ])("returns 400 for %s (%s)", async (body) => {
    setActor("Admin");
    const response = await PATCH(patchRequest(body), ctx);
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
    expect(setAppUserScopes).not.toHaveBeenCalled();
  });

  it("maps a domain-boundary service error to 403", async () => {
    setActor("Admin");
    vi.mocked(setAppUserScopes).mockRejectedValue(
      new UserManagementError(
        "Scope changes are limited to the allowed Google Workspace domain.",
        403,
      ),
    );
    const response = await PATCH(
      patchRequest({ scopes: ["maintenance"], reason: "maintenance sub-user" }),
      ctx,
    );
    expect(response.status).toBe(403);
  });
});
