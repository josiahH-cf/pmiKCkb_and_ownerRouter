import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";

const mocks = vi.hoisted(() => ({
  buildLiveWritebackDeps: vi.fn(),
  prepareOrCommitWriteback: vi.fn(),
  requireCapabilityInSpace: vi.fn(),
  requireEnvironmentDescriptor: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: mocks.requireCapabilityInSpace };
});

vi.mock("@/lib/environment/descriptor", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/environment/descriptor")>();
  return {
    ...actual,
    requireEnvironmentDescriptor: mocks.requireEnvironmentDescriptor,
  };
});

vi.mock("@/lib/lease-renewal/sheet-writeback-service", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/lease-renewal/sheet-writeback-service")>();
  return {
    ...actual,
    buildLiveWritebackDeps: mocks.buildLiveWritebackDeps,
    prepareOrCommitWriteback: mocks.prepareOrCommitWriteback,
  };
});

import { POST } from "@/app/api/lease-renewal/writeback-execute/route";
import { RENEWAL_SHEET_WRITEBACK_ACTION_KEY } from "@/lib/lease-renewal/sheet-writeback-service";

const productionDescriptor: EnvironmentDescriptor = {
  environmentKind: "production",
  dataContext: "live",
  source: "explicit",
};

function requestWithJsonSpy() {
  const json = vi.fn(async () => ({
    runId: "run-1",
    sourceTriggerKey: "trigger-1",
    confirm: true,
  }));
  return { request: { json } as unknown as Request, json };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCapabilityInSpace.mockResolvedValue({
    uid: "admin-1",
    email: "admin@pmikcmetro.com",
    role: "Admin",
  });
  mocks.requireEnvironmentDescriptor.mockReturnValue(productionDescriptor);
});

describe("POST /api/lease-renewal/writeback-execute — early execution fences", () => {
  it("returns the exact closed-key refusal before parsing or building live dependencies", async () => {
    const { request, json } = requestWithJsonSpy();

    const response = await POST(request);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      action_key: RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
      error: `Action "${RENEWAL_SHEET_WRITEBACK_ACTION_KEY}" is not enabled for execution (production_allowed:false).`,
      error_type: "action_not_production_allowed",
    });
    expect(json).not.toHaveBeenCalled();
    expect(mocks.buildLiveWritebackDeps).not.toHaveBeenCalled();
    expect(mocks.prepareOrCommitWriteback).not.toHaveBeenCalled();
  });

  it.each([
    {
      environmentKind: "demo",
      dataContext: "demo",
      label: "Demo data",
    },
    {
      environmentKind: "demo",
      dataContext: "live_readonly",
      label: "Live read-only",
    },
  ] as const)(
    "returns an environment refusal for $label before parsing or building live dependencies",
    async ({ environmentKind, dataContext }) => {
      mocks.requireEnvironmentDescriptor.mockReturnValue({
        environmentKind,
        dataContext,
        source: "explicit",
      });
      const { request, json } = requestWithJsonSpy();

      const response = await POST(request);
      const payload = await response.json();

      expect(response.status).toBe(409);
      expect(payload).toMatchObject({
        action_key: RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
        data_context: dataContext,
        environment_kind: environmentKind,
        error_type: "environment_context_not_allowed",
      });
      expect(payload.error).toContain(
        "A Live provider action requires the Production environment with Live data.",
      );
      expect(json).not.toHaveBeenCalled();
      expect(mocks.buildLiveWritebackDeps).not.toHaveBeenCalled();
      expect(mocks.prepareOrCommitWriteback).not.toHaveBeenCalled();
    },
  );
});
