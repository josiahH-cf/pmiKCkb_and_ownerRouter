import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capability: vi.fn(),
  destroySecret: vi.fn(),
  claimRevocation: vi.fn(),
  completeRevocation: vi.fn(),
  readRevocationResult: vi.fn(),
  getRevocationReceipt: vi.fn(),
}));

vi.mock("@/lib/connections/connector-secret-vault", () => ({
  resolveConnectorSecretVault: () => ({
    capability: mocks.capability,
    storeSecret: vi.fn(),
    destroySecret: mocks.destroySecret,
  }),
}));

vi.mock("@/lib/firestore/connector-connections", () => ({
  getConnectorConnectionStore: () => ({
    claimRevocation: mocks.claimRevocation,
    completeRevocation: mocks.completeRevocation,
    readRevocationResult: mocks.readRevocationResult,
    getRevocationReceipt: mocks.getRevocationReceipt,
  }),
}));

import { POST } from "@/app/api/connections/[connectorId]/disconnect/route";
import { setAuthResolverForTest } from "@/lib/auth/session";

const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const GENERATION_ID = "22222222-2222-4222-8222-222222222222";
const PENDING = {
  connectorId: "rentvine",
  method: "api_key" as const,
  status: "revocation_pending" as const,
  secretRef: "test-only-vault-handle",
  connectedByUid: "admin-0",
  connectedAt: "2026-08-30T12:00:00.000Z",
  generationId: GENERATION_ID,
  revision: 2,
  operationId: OPERATION_ID,
  requestedByUid: "admin-1",
  requestedAt: "2026-08-31T11:00:00.000Z",
  updatedAt: "2026-08-31T11:00:00.000Z",
};
const RECEIPT = {
  connectorId: "rentvine",
  method: "api_key" as const,
  operationId: OPERATION_ID,
  generationId: GENERATION_ID,
  revision: 3,
  requestedByUid: "admin-1",
  requestedAt: "2026-08-31T11:00:00.000Z",
  completedAt: "2026-08-31T12:00:00.000Z",
  destroyOutcome: "destroyed" as const,
};
const REVOKED = {
  connectorId: "rentvine",
  method: "api_key" as const,
  status: "revoked" as const,
  operationId: OPERATION_ID,
  generationId: GENERATION_ID,
  revision: 3,
  requestedByUid: "admin-1",
  requestedAt: "2026-08-31T11:00:00.000Z",
  completedAt: "2026-08-31T12:00:00.000Z",
  destroyOutcome: "destroyed" as const,
  updatedAt: "2026-08-31T12:00:00.000Z",
};

function setRole(role: "Admin" | "Editor") {
  setAuthResolverForTest(() => ({
    email: `${role.toLowerCase()}@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role,
    uid: `${role.toLowerCase()}-1`,
  }));
}

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/connections/rentvine/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "start",
      operationId: OPERATION_ID,
      connectorId: "rentvine",
      observedVersion: `g:${GENERATION_ID}:1`,
      confirmationPhrase: "Disconnect RentVine",
      ...overrides,
    }),
  });
}

function ctx(connectorId = "rentvine") {
  return { params: Promise.resolve({ connectorId }) };
}

afterEach(() => {
  setAuthResolverForTest(null);
  vi.resetAllMocks();
});

describe("POST /api/connections/[connectorId]/disconnect", () => {
  it("refuses an Editor before vault or store access", async () => {
    setRole("Editor");
    const response = await POST(request(), ctx());
    expect(response.status).toBe(403);
    expect(mocks.capability).not.toHaveBeenCalled();
    expect(mocks.claimRevocation).not.toHaveBeenCalled();
    expect(mocks.destroySecret).not.toHaveBeenCalled();
  });

  it("rejects unknown fields, malformed UUIDs, route mismatch, and wrong phrase before effects", async () => {
    setRole("Admin");
    for (const body of [
      { extra: true },
      { operationId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
      { connectorId: "dotloop" },
      { confirmationPhrase: "Disconnect rentvine" },
    ]) {
      const response = await POST(request(body), ctx());
      expect(response.status).toBe(400);
    }
    expect(mocks.capability).not.toHaveBeenCalled();
    expect(mocks.claimRevocation).not.toHaveBeenCalled();
    expect(mocks.destroySecret).not.toHaveBeenCalled();
  });

  it("refuses a status-only connector before vault or store access", async () => {
    setRole("Admin");
    const response = await POST(
      request({
        connectorId: "rentcast",
        confirmationPhrase: "Disconnect RentCast",
      }),
      ctx("rentcast"),
    );
    expect(response.status).toBe(400);
    expect(mocks.capability).not.toHaveBeenCalled();
    expect(mocks.claimRevocation).not.toHaveBeenCalled();
  });

  it("refuses an unconfigured vault before claiming lifecycle state", async () => {
    setRole("Admin");
    mocks.capability.mockResolvedValue("not_configured");
    const response = await POST(request(), ctx());
    expect(response.status).toBe(409);
    expect(mocks.claimRevocation).not.toHaveBeenCalled();
    expect(mocks.destroySecret).not.toHaveBeenCalled();
  });

  it("claims, destroys once, completes, and returns only the redacted readback", async () => {
    setRole("Admin");
    mocks.capability.mockResolvedValue("configured");
    mocks.claimRevocation.mockResolvedValue({ state: "pending", record: PENDING });
    mocks.destroySecret.mockResolvedValue({ ok: true, outcome: "destroyed" });
    mocks.completeRevocation.mockResolvedValue(RECEIPT);
    mocks.readRevocationResult.mockResolvedValue({ record: REVOKED, receipt: RECEIPT });

    const response = await POST(request(), ctx());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      connectorId: "rentvine",
      disconnected: true,
      operationId: OPERATION_ID,
      completedAt: RECEIPT.completedAt,
    });
    expect(mocks.claimRevocation).toHaveBeenCalledTimes(1);
    expect(mocks.destroySecret).toHaveBeenCalledWith({
      secretRef: PENDING.secretRef,
      operationId: OPERATION_ID,
    });
    expect(mocks.completeRevocation).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: "rentvine",
        operationId: OPERATION_ID,
        generationId: GENERATION_ID,
        expectedRevision: 2,
        destroyOutcome: "destroyed",
      }),
    );
    expect(
      JSON.stringify(await mocks.readRevocationResult.mock.results[0]?.value),
    ).not.toContain(PENDING.secretRef);
  });

  it("returns a completed receipt even when the vault is no longer configured", async () => {
    setRole("Admin");
    mocks.getRevocationReceipt.mockResolvedValue(RECEIPT);
    const response = await POST(request(), ctx());
    expect(response.status).toBe(200);
    expect(mocks.capability).not.toHaveBeenCalled();
    expect(mocks.claimRevocation).not.toHaveBeenCalled();
    expect(mocks.destroySecret).not.toHaveBeenCalled();
    expect(mocks.completeRevocation).not.toHaveBeenCalled();
  });

  it("leaves post-claim vault and completion failures for recovery", async () => {
    setRole("Admin");
    mocks.capability.mockResolvedValue("configured");
    mocks.claimRevocation.mockResolvedValue({ state: "pending", record: PENDING });
    mocks.destroySecret.mockRejectedValueOnce(new Error("timeout"));
    await expect(POST(request(), ctx())).rejects.toThrow("timeout");
    expect(mocks.completeRevocation).not.toHaveBeenCalled();

    mocks.destroySecret.mockResolvedValue({ ok: true, outcome: "already_absent" });
    mocks.completeRevocation.mockRejectedValueOnce(new Error("store unavailable"));
    await expect(POST(request({ mode: "recover" }), ctx())).rejects.toThrow(
      "store unavailable",
    );
    expect(mocks.destroySecret).toHaveBeenCalledTimes(2);
  });
});
