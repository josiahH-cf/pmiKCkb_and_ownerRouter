// S13 D5 — the Admin "Verify connection" route: Admin-only, read-only, boolean verdict out.

import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/connections/verify/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { verifyConnectorNow } from "@/lib/connections/verification";

vi.mock("@/lib/connections/verification", () => ({
  verifyConnectorNow: vi.fn(),
}));

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(verifyConnectorNow).mockReset();
});

function setRole(role: "Admin" | "Editor") {
  setAuthResolverForTest(() => ({
    email: `${role.toLowerCase()}@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role,
    uid: `${role.toLowerCase()}-1`,
  }));
}

function request(body: unknown) {
  return new Request("http://localhost/api/connections/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/connections/verify", () => {
  it("runs the fresh probe for an Admin and returns the verdict only", async () => {
    setRole("Admin");
    vi.mocked(verifyConnectorNow).mockResolvedValue({
      supported: true,
      verified: true,
    });

    const response = await POST(request({ connector_id: "rentvine" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connector_id: "rentvine", verified: true });
    expect(verifyConnectorNow).toHaveBeenCalledWith("rentvine");
  });

  it("is Admin-only — an Editor gets 403 and no probe runs", async () => {
    setRole("Editor");

    const response = await POST(request({ connector_id: "rentvine" }));

    expect(response.status).toBe(403);
    expect(verifyConnectorNow).not.toHaveBeenCalled();
  });

  it("rejects a connector without a built live check", async () => {
    setRole("Admin");
    vi.mocked(verifyConnectorNow).mockResolvedValue({
      supported: false,
      verified: false,
    });

    const response = await POST(request({ connector_id: "dotloop" }));

    expect(response.status).toBe(400);
  });

  it("rejects a malformed body", async () => {
    setRole("Admin");

    const response = await POST(request({}));

    expect(response.status).toBe(400);
    expect(verifyConnectorNow).not.toHaveBeenCalled();
  });
});
