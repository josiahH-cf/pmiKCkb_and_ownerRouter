import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capability: vi.fn(),
  storeSecret: vi.fn(),
  destroySecret: vi.fn(),
  createConnectedConnection: vi.fn(),
}));

vi.mock("@/lib/connections/connector-secret-vault", () => ({
  resolveConnectorSecretVault: () => ({
    capability: mocks.capability,
    storeSecret: mocks.storeSecret,
    destroySecret: mocks.destroySecret,
  }),
}));

vi.mock("@/lib/firestore/connector-connections", () => ({
  getConnectorConnectionStore: () => ({
    createConnectedConnection: mocks.createConnectedConnection,
  }),
}));

import { POST } from "@/app/api/connections/[connectorId]/api-key/route";
import { setAuthResolverForTest } from "@/lib/auth/session";

const SECRET = "test-only-secret-value";

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
  it("refuses non-Admin, unknown, wrong-method, status-only, and malformed requests before storage", async () => {
    setRole("Editor");
    expect((await POST(request({ api_key: SECRET }), ctx("rentvine"))).status).toBe(403);
    setRole("Admin");
    expect((await POST(request({ api_key: SECRET }), ctx("nope"))).status).toBe(404);
    expect((await POST(request({ api_key: SECRET }), ctx("dotloop"))).status).toBe(400);
    expect((await POST(request({ api_key: SECRET }), ctx("rentcast"))).status).toBe(400);
    expect((await POST(request({}), ctx("rentvine"))).status).toBe(400);
    expect(mocks.storeSecret).not.toHaveBeenCalled();
    expect(mocks.createConnectedConnection).not.toHaveBeenCalled();
  });

  it("stays honest when secure storage is unavailable", async () => {
    setRole("Admin");
    mocks.storeSecret.mockResolvedValue({ ok: false, reason: "not_configured" });
    const response = await POST(request({ api_key: SECRET }), ctx("rentvine"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      connectorId: "rentvine",
      stored: false,
      status: "storage_not_configured",
    });
    expect(mocks.createConnectedConnection).not.toHaveBeenCalled();
  });

  it("creates a versioned connection using only the opaque handle", async () => {
    setRole("Admin");
    mocks.storeSecret.mockResolvedValue({
      ok: true,
      secretRef: "test-only-vault-handle",
    });
    mocks.createConnectedConnection.mockResolvedValue({});
    const response = await POST(request({ api_key: SECRET }), ctx("rentvine"));
    expect(response.status).toBe(200);
    const saved = mocks.createConnectedConnection.mock.calls[0][0];
    expect(saved).toMatchObject({
      connectorId: "rentvine",
      method: "api_key",
      secretRef: "test-only-vault-handle",
      connectedByUid: "admin-1",
    });
    expect(saved.generationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(saved)).not.toContain(SECRET);
  });

  it("cleans up the just-stored handle when lifecycle creation loses a race", async () => {
    setRole("Admin");
    mocks.storeSecret.mockResolvedValue({
      ok: true,
      secretRef: "test-only-vault-handle",
    });
    mocks.createConnectedConnection.mockRejectedValue(new Error("conflict"));
    mocks.destroySecret.mockResolvedValue({ ok: true, outcome: "destroyed" });
    await expect(POST(request({ api_key: SECRET }), ctx("rentvine"))).rejects.toThrow(
      "conflict",
    );
    expect(mocks.destroySecret).toHaveBeenCalledWith({
      secretRef: "test-only-vault-handle",
      operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });
});
