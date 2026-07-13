import { afterEach, describe, expect, it, vi } from "vitest";

const { createStoreMock, putMock } = vi.hoisted(() => ({
  createStoreMock: vi.fn(),
  putMock: vi.fn(),
}));

vi.mock("@/lib/maintenance/image-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/maintenance/image-store")>();
  return {
    ...actual,
    createMaintenanceImageStore: createStoreMock,
  };
});

import { POST } from "@/app/api/maintenance/photo/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { MAINTENANCE_PHOTO_ACTION_KEY } from "@/lib/maintenance/photo-action";

afterEach(() => {
  setAuthResolverForTest(null);
  createStoreMock.mockReset();
  putMock.mockReset();
});

describe("maintenance photo route", () => {
  it("refuses the closed registry action before reading the body or constructing a store", async () => {
    setAuthResolverForTest(() => ({
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
      uid: "editor-1",
    }));
    const json = vi.fn();
    const request = { headers: new Headers(), json } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      action_key: MAINTENANCE_PHOTO_ACTION_KEY,
      error:
        "Photo storage is unavailable until the Drive action has owner-approved permission. Continue without a photo.",
      error_type: "action_not_production_allowed",
    });
    expect(json).not.toHaveBeenCalled();
    expect(createStoreMock).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
  });
});
