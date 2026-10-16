import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityInSpace: vi.fn(async () => ({
    uid: "fixture-editor",
    role: "Editor",
  })),
  authErrorResponse: vi.fn(),
}));
vi.mock("@/lib/maintenance/image-store", async (original) => ({
  ...(await original<typeof import("@/lib/maintenance/image-store")>()),
  createMaintenanceImageStore: vi.fn(),
}));
import { POST } from "@/app/api/maintenance/photo/route";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { createMaintenanceImageStore } from "@/lib/maintenance/image-store";

afterEach(() => vi.unstubAllEnvs());
it("returns retirement 410 from direct photo admission without reading bytes or constructing storage", async () => {
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  const json = vi.fn();
  const response = await POST({ headers: new Headers(), json } as unknown as Request);
  expect(requireCapabilityInSpace).toHaveBeenCalledWith("edit", "maintenance");
  expect(response.status).toBe(410);
  expect(await response.json()).toMatchObject({
    error: expect.stringContaining("Custom maintenance is retired"),
  });
  expect(json).not.toHaveBeenCalled();
  expect(createMaintenanceImageStore).not.toHaveBeenCalled();
});
