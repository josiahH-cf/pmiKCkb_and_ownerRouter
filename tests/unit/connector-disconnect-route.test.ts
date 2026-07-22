// Admin-only disconnect route: idempotent when nothing is connected, and when a record exists it
// destroys the vault secret and deletes the record.

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

import { POST } from "@/app/api/connections/[connectorId]/disconnect/route";
import { setAuthResolverForTest } from "@/lib/auth/session";

function setRole(role: "Admin" | "Editor") {
  setAuthResolverForTest(() => ({
    email: `${role.toLowerCase()}@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role,
    uid: `${role.toLowerCase()}-1`,
  }));
}

function request() {
  return new Request("http://localhost/api/connections/rentvine/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

const ctx = { params: Promise.resolve({ connectorId: "rentvine" }) };

afterEach(() => {
  setAuthResolverForTest(null);
  vi.clearAllMocks();
});

describe("POST /api/connections/[connectorId]/disconnect", () => {
  it("is Admin-only — an Editor gets 403 and nothing is touched", async () => {
    setRole("Editor");

    const response = await POST(request(), ctx);

    expect(response.status).toBe(403);
    expect(mocks.getConnection).not.toHaveBeenCalled();
    expect(mocks.destroySecret).not.toHaveBeenCalled();
    expect(mocks.deleteConnection).not.toHaveBeenCalled();
  });

  it("is idempotent: reports disconnected:false when no record exists", async () => {
    setRole("Admin");
    mocks.getConnection.mockResolvedValue(null);

    const response = await POST(request(), ctx);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      connectorId: "rentvine",
      disconnected: false,
    });
    expect(mocks.destroySecret).not.toHaveBeenCalled();
    expect(mocks.deleteConnection).not.toHaveBeenCalled();
  });

  it("destroys the vault secret and deletes the record when one exists", async () => {
    setRole("Admin");
    mocks.getConnection.mockResolvedValue({
      connectorId: "rentvine",
      method: "api_key",
      status: "connected",
      secretRef: "vault://rentvine/abc",
      connectedByUid: "admin-1",
      connectedAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
    });

    const response = await POST(request(), ctx);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      connectorId: "rentvine",
      disconnected: true,
    });
    expect(mocks.destroySecret).toHaveBeenCalledWith("vault://rentvine/abc");
    expect(mocks.deleteConnection).toHaveBeenCalledWith("rentvine");
  });
});
