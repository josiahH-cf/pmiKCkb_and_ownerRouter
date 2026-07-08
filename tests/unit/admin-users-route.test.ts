import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the service layer; keep the real UserManagementError so the route's instanceof mapping works.
vi.mock("@/lib/admin/users", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/admin/users")>();
  return { ...actual, listAppUsers: vi.fn(), setAppUserRole: vi.fn() };
});

import { GET } from "@/app/api/admin/users/route";
import { PATCH } from "@/app/api/admin/users/[uid]/route";
import { UserManagementError, listAppUsers, setAppUserRole } from "@/lib/admin/users";
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
  return new Request("http://localhost/api/admin/users/u1", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
}

const ctx = { params: Promise.resolve({ uid: "u1" }) };

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(listAppUsers).mockReset();
  vi.mocked(setAppUserRole).mockReset();
});

describe("admin users API route", () => {
  it("GET returns 401 when unauthenticated", async () => {
    setAuthResolverForTest(() => null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(listAppUsers).not.toHaveBeenCalled();
  });

  it("GET returns the roster for an Admin", async () => {
    setActor("Admin");
    vi.mocked(listAppUsers).mockResolvedValue([
      {
        uid: "u1",
        email: "u1@pmikcmetro.com",
        role: "Editor",
        disabled: false,
        lastSignInAt: null,
      },
    ]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      users: [
        {
          uid: "u1",
          email: "u1@pmikcmetro.com",
          role: "Editor",
          disabled: false,
          lastSignInAt: null,
        },
      ],
    });
  });

  it("PATCH is forbidden for a non-Admin (manageAdmin gate) before any write", async () => {
    setActor("Approver");
    const response = await PATCH(patchRequest({ role: "Admin", reason: "please" }), ctx);
    expect(response.status).toBe(403);
    expect(setAppUserRole).not.toHaveBeenCalled();
  });

  it("PATCH changes a role and returns the updated row", async () => {
    setActor("Admin");
    vi.mocked(setAppUserRole).mockResolvedValue({
      uid: "u1",
      email: "u1@pmikcmetro.com",
      role: "Approver",
      disabled: false,
      lastSignInAt: null,
    });
    const response = await PATCH(
      patchRequest({ role: "Approver", reason: "can approve now" }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(vi.mocked(setAppUserRole).mock.calls[0][0]).toMatchObject({
      targetUid: "u1",
      role: "Approver",
      reason: "can approve now",
    });
  });

  it("PATCH maps a UserManagementError to its status", async () => {
    setActor("Admin");
    vi.mocked(setAppUserRole).mockRejectedValue(
      new UserManagementError("Cannot remove the last Admin.", 409),
    );
    const response = await PATCH(
      patchRequest({ role: "Editor", reason: "step down" }),
      ctx,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Cannot remove the last Admin." });
  });
});
