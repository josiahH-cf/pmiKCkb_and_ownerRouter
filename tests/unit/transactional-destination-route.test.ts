import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the store so the route test exercises only auth + validation + pass-through, never Firestore.
const { readMock, updateMock } = vi.hoisted(() => ({
  readMock: vi.fn(async () => ({
    id: "default",
    destination_email: "josiah@pmikcmetro.com",
    updated_at: "default",
  })),
  updateMock: vi.fn(async (_actor: unknown, input: { destination_email: string }) => ({
    id: "default",
    destination_email: input.destination_email,
    updated_at: "2026-01-01T00:00:00.000Z",
    updated_by_uid: "admin-1",
  })),
}));
vi.mock("@/lib/firestore/owner-transactional-destination", () => ({
  readOwnerTransactionalDestination: readMock,
  updateOwnerTransactionalDestination: updateMock,
}));

import { GET, PATCH } from "@/app/api/admin/transactional-destination/route";
import { setAuthResolverForTest } from "@/lib/auth/session";

function setRole(role: "Admin" | "Editor" | null) {
  setAuthResolverForTest(
    role === null
      ? () => null
      : () => ({
          email: "admin@pmikcmetro.com",
          hd: "pmikcmetro.com",
          role,
          uid: "admin-1",
        }),
  );
}

function patch(body: unknown) {
  return new Request("http://localhost/api/admin/transactional-destination", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  setAuthResolverForTest(null);
  readMock.mockClear();
  updateMock.mockClear();
});

describe("admin transactional-destination route", () => {
  it("GET returns 401 when unauthenticated and never reads the store", async () => {
    setRole(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(readMock).not.toHaveBeenCalled();
  });

  it("GET returns 403 for a non-Admin and never reads the store", async () => {
    setRole("Editor");
    const response = await GET();
    expect(response.status).toBe(403);
    expect(readMock).not.toHaveBeenCalled();
  });

  it("GET returns the current destination for an Admin", async () => {
    setRole("Admin");
    const response = await GET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.destination.destination_email).toBe("josiah@pmikcmetro.com");
  });

  it("PATCH rejects an invalid email with 400 and never writes", async () => {
    setRole("Admin");
    const response = await PATCH(patch({ destination_email: "not-an-email" }));
    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("PATCH persists a valid, lowercased destination for an Admin", async () => {
    setRole("Admin");
    const response = await PATCH(patch({ destination_email: "Owner@Example.COM" }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.destination.destination_email).toBe("owner@example.com");
    expect(updateMock).toHaveBeenCalledWith(expect.anything(), {
      destination_email: "owner@example.com",
    });
  });

  it("PATCH returns 403 for a non-Admin and never writes", async () => {
    setRole("Editor");
    const response = await PATCH(patch({ destination_email: "x@pmikcmetro.com" }));
    expect(response.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
