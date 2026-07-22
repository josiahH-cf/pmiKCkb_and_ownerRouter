import { afterEach, describe, expect, it, vi } from "vitest";

// Wiring test for the Admin add-a-Space route: manageAdmin-gated, records the request, returns the
// generated provisioning plan, and rejects a malformed body without recording.
const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  createSpaceRequest: vi.fn(),
  listSpaceRequests: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapability: mocks.requireCapability };
});

vi.mock("@/lib/firestore/space-requests", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/firestore/space-requests")>();
  return {
    ...actual,
    createSpaceRequest: mocks.createSpaceRequest,
    listSpaceRequests: mocks.listSpaceRequests,
  };
});

import { GET, POST } from "@/app/api/admin/spaces/request/route";
import { EditableLayerError } from "@/lib/firestore/errors";

const admin = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/admin/spaces/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

afterEach(() => vi.clearAllMocks());

describe("admin space-request route", () => {
  it("records a request through the manageAdmin gate and returns the generated plan", async () => {
    mocks.requireCapability.mockResolvedValue(admin);
    mocks.createSpaceRequest.mockResolvedValue({
      id: "r1",
      name: "Owner Statements",
      spaceId: "owner-statements",
      scope: "Monthly owner statements",
      intendedSources: [],
      status: "requested",
      requestedByUid: "admin-1",
      createdAt: "2026-07-22T12:00:00.000Z",
    });

    const res = await post({
      name: "Owner Statements",
      scope: "Monthly owner statements",
      intendedSources: [],
    });

    expect(res.status).toBe(200);
    expect(mocks.requireCapability).toHaveBeenCalledWith("manageAdmin");
    const json = (await res.json()) as {
      request: { spaceId: string };
      plan: { spaceId: string; envLocalLines: string[] };
    };
    expect(json.request.spaceId).toBe("owner-statements");
    expect(json.plan.spaceId).toBe("owner-statements");
    expect(
      json.plan.envLocalLines.some((line) =>
        line.startsWith("SPACE_VERTEX_DATA_STORE_IDS="),
      ),
    ).toBe(true);
  });

  it("rejects a malformed body with 400 and never records", async () => {
    mocks.requireCapability.mockResolvedValue(admin);
    const res = await post({ name: "A", scope: "x" });
    expect(res.status).toBe(400);
    expect(mocks.createSpaceRequest).not.toHaveBeenCalled();
  });

  it("lists prior requests", async () => {
    mocks.requireCapability.mockResolvedValue(admin);
    mocks.listSpaceRequests.mockResolvedValue([
      {
        id: "r1",
        name: "A Space",
        spaceId: "a-space",
        scope: "x scope",
        intendedSources: [],
        status: "requested",
        requestedByUid: "admin-1",
        createdAt: null,
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { requests: unknown[] }).requests).toHaveLength(1);
  });

  it("surfaces the gate rejection for a non-Admin and never records", async () => {
    mocks.requireCapability.mockRejectedValue(new EditableLayerError("forbidden", 403));
    const res = await post({
      name: "Owner Statements",
      scope: "Monthly owner statements",
      intendedSources: [],
    });
    expect(res.status).toBe(403);
    expect(mocks.createSpaceRequest).not.toHaveBeenCalled();
  });
});
