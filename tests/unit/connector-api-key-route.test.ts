// Admin-only "Add your API key" route: Admin-guarded, connector-shape-checked, and honest when no
// secure vault is wired. The raw key never reaches the store; only an opaque secretRef is persisted.

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storeSecret: vi.fn(),
  destroySecret: vi.fn(),
  saveConnection: vi.fn(),
  getConnection: vi.fn(),
  listConnections: vi.fn(),
  deleteConnection: vi.fn(),
}));

vi.mock("@/lib/connections/connector-secret-vault", () => ({
  resolveConnectorSecretVault: () => ({
    storeSecret: mocks.storeSecret,
    destroySecret: mocks.destroySecret,
  }),
}));

vi.mock("@/lib/firestore/connector-connections", () => ({
  getConnectorConnectionStore: () => ({
    getConnection: mocks.getConnection,
    listConnections: mocks.listConnections,
    saveConnection: mocks.saveConnection,
    deleteConnection: mocks.deleteConnection,
  }),
}));

import { POST } from "@/app/api/connections/[connectorId]/api-key/route";
import { setAuthResolverForTest } from "@/lib/auth/session";

const SECRET = "super-secret-key-value";

function setRole(role: "Admin" | "Editor") {
  setAuthResolverForTest(() => ({
    email: `${role.toLowerCase()}@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role,
    uid: `${role.toLowerCase()}-1`,
  }));
}

function request(body: unknown) {
  return new Request("http://localhost/api/connections/rentvine/api-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx(connectorId: string) {
  return { params: Promise.resolve({ connectorId }) };
}

afterEach(() => {
  setAuthResolverForTest(null);
  vi.clearAllMocks();
});

describe("POST /api/connections/[connectorId]/api-key", () => {
  it("is Admin-only — an Editor gets 403 and nothing is stored", async () => {
    setRole("Editor");

    const response = await POST(request({ api_key: SECRET }), ctx("rentvine"));

    expect(response.status).toBe(403);
    expect(mocks.storeSecret).not.toHaveBeenCalled();
    expect(mocks.saveConnection).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown connector", async () => {
    setRole("Admin");

    const response = await POST(request({ api_key: SECRET }), ctx("nope"));

    expect(response.status).toBe(404);
    expect(mocks.storeSecret).not.toHaveBeenCalled();
  });

  it("returns 400 for a connector that does not use an API key", async () => {
    setRole("Admin");

    const response = await POST(request({ api_key: SECRET }), ctx("dotloop"));

    expect(response.status).toBe(400);
    expect(mocks.storeSecret).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed body", async () => {
    setRole("Admin");

    const response = await POST(request({}), ctx("rentvine"));

    expect(response.status).toBe(400);
    expect(mocks.storeSecret).not.toHaveBeenCalled();
  });

  it("stays honest when no secure vault is wired: stored:false and no record written", async () => {
    setRole("Admin");
    mocks.storeSecret.mockResolvedValue({ ok: false, reason: "not_configured" });

    const response = await POST(request({ api_key: SECRET }), ctx("rentvine"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      connectorId: "rentvine",
      stored: false,
      status: "storage_not_configured",
    });
    expect(mocks.saveConnection).not.toHaveBeenCalled();
  });

  it("writes a connected record referencing only an opaque secretRef when the vault stores it", async () => {
    setRole("Admin");
    mocks.storeSecret.mockResolvedValue({ ok: true, secretRef: "vault://rentvine/abc" });

    const response = await POST(request({ api_key: SECRET }), ctx("rentvine"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      connectorId: "rentvine",
      stored: true,
      status: "connected",
    });
    expect(mocks.saveConnection).toHaveBeenCalledTimes(1);

    const saved = mocks.saveConnection.mock.calls[0][0];
    expect(saved.connectorId).toBe("rentvine");
    expect(saved.method).toBe("api_key");
    expect(saved.status).toBe("connected");
    expect(saved.secretRef).toBe("vault://rentvine/abc");
    expect(saved.connectedByUid).toBe("admin-1");
    // The raw key is never persisted anywhere on the record.
    expect(JSON.stringify(saved)).not.toContain(SECRET);
  });
});
