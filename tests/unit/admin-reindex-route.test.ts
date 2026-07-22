import { afterEach, describe, expect, it, vi } from "vitest";

// Wiring test for the Admin re-index route: manageAdmin-gated, refuses without confirm:true, stages the
// confirmed request, and returns the owner command. It never ingests (no importDocuments code path).
const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  createReindexRequest: vi.fn(),
  listReindexRequests: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapability: mocks.requireCapability };
});

vi.mock("@/lib/firestore/reindex-requests", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/firestore/reindex-requests")>();
  return {
    ...actual,
    createReindexRequest: mocks.createReindexRequest,
    listReindexRequests: mocks.listReindexRequests,
  };
});

import { GET, POST } from "@/app/api/admin/reindex/route";

const admin = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/admin/reindex", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

afterEach(() => vi.clearAllMocks());

describe("admin re-index route", () => {
  it("stages a confirmed request and returns the owner command (never ingests)", async () => {
    mocks.requireCapability.mockResolvedValue(admin);
    mocks.createReindexRequest.mockResolvedValue({
      id: "r1",
      spaceId: "lease-renewals",
      status: "requested",
      requestedByUid: "admin-1",
      createdAt: "2026-07-22T12:00:00.000Z",
    });

    const res = await post({ spaceId: "lease-renewals", confirm: true });
    expect(res.status).toBe(200);
    expect(mocks.requireCapability).toHaveBeenCalledWith("manageAdmin");
    const json = (await res.json()) as {
      request: { spaceId: string };
      plan: { command: string; runnable: boolean };
    };
    expect(json.request.spaceId).toBe("lease-renewals");
    expect(typeof json.plan.command).toBe("string");
  });

  it("refuses without confirm:true (the cost gate) and never records", async () => {
    mocks.requireCapability.mockResolvedValue(admin);
    const res = await post({ spaceId: "lease-renewals" });
    expect(res.status).toBe(400);
    expect(mocks.createReindexRequest).not.toHaveBeenCalled();

    const res2 = await post({ spaceId: "lease-renewals", confirm: false });
    expect(res2.status).toBe(400);
    expect(mocks.createReindexRequest).not.toHaveBeenCalled();
  });

  it("lists prior requests", async () => {
    mocks.requireCapability.mockResolvedValue(admin);
    mocks.listReindexRequests.mockResolvedValue([
      {
        id: "r1",
        spaceId: "lease-renewals",
        status: "requested",
        requestedByUid: "admin-1",
        createdAt: null,
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { requests: unknown[] }).requests).toHaveLength(1);
  });
});
