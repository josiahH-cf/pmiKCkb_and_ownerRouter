import { afterEach, describe, expect, it, vi } from "vitest";

const { createStoreMock, putMock, runtimeGate } = vi.hoisted(() => ({
  createStoreMock: vi.fn(),
  putMock: vi.fn(),
  runtimeGate: {
    seedOpen: false,
    current: "clear" as "clear" | "action_suspended" | "global_suspended" | "unreadable",
  },
}));

vi.mock("@/lib/integrations/action-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/action-gate")>();
  return {
    ...actual,
    assertActionExecutable: vi.fn((actionKey: string) => {
      if (!runtimeGate.seedOpen) actual.assertActionExecutable(actionKey);
    }),
    isActionExecutable: vi.fn((actionKey: string) =>
      runtimeGate.seedOpen ? true : actual.isActionExecutable(actionKey),
    ),
  };
});

vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: vi.fn(async () => {
    if (runtimeGate.current === "unreadable") {
      throw new Error("synthetic unreadable runtime store");
    }
    return { status: runtimeGate.current };
  }),
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
  runtimeGate.seedOpen = false;
  runtimeGate.current = "clear";
  vi.unstubAllEnvs();
});

describe("maintenance photo route", () => {
  it("refuses Live-read-only before the action gate, body, or image store", async () => {
    vi.stubEnv("ENVIRONMENT_KIND", "demo");
    vi.stubEnv("DATA_CONTEXT", "live_readonly");
    setAuthResolverForTest(() => ({
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
      uid: "editor-1",
    }));
    runtimeGate.seedOpen = true;
    const json = vi.fn();

    const response = await POST({
      headers: new Headers(),
      json,
    } as unknown as Request);

    expect(response.status).toBe(409);
    expect(json).not.toHaveBeenCalled();
    expect(createStoreMock).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
  });

  // S51_DYNAMIC_REFUSAL:maintenance-photo-store
  it.each(["action_suspended", "global_suspended", "unreadable"] as const)(
    "does not construct the Drive image store when runtime state is %s",
    async (status) => {
      setAuthResolverForTest(() => ({
        email: "editor@pmikcmetro.com",
        hd: "pmikcmetro.com",
        role: "Editor",
        scopes: ["maintenance"],
        uid: "editor-1",
      }));
      runtimeGate.seedOpen = true;
      runtimeGate.current = status;
      const json = vi.fn();
      const request = { headers: new Headers(), json } as unknown as Request;

      const response = await POST(request);

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        action_key: MAINTENANCE_PHOTO_ACTION_KEY,
        error_type: "action_runtime_suspended",
      });
      expect(json).not.toHaveBeenCalled();
      expect(createStoreMock).not.toHaveBeenCalled();
      expect(putMock).not.toHaveBeenCalled();
    },
  );

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
