import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";

const mocks = vi.hoisted(() => ({
  assertSheetWritebackExecutionAllowed: vi.fn(),
  buildLiveWritebackDeps: vi.fn(),
  buildLiveWritebackRecoveryDeps: vi.fn(),
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
    assertSheetWritebackExecutionAllowed: mocks.assertSheetWritebackExecutionAllowed,
    buildLiveWritebackDeps: mocks.buildLiveWritebackDeps,
    buildLiveWritebackRecoveryDeps: mocks.buildLiveWritebackRecoveryDeps,
    prepareOrCommitWriteback: mocks.prepareOrCommitWriteback,
  };
});

import { POST } from "@/app/api/lease-renewal/writeback-execute/route";
import { EnvironmentContextError } from "@/lib/environment/descriptor";
import { ActionNotExecutableError } from "@/lib/integrations/action-gate";
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
  mocks.assertSheetWritebackExecutionAllowed.mockImplementation(
    (
      { descriptor }: { descriptor: EnvironmentDescriptor },
      mode: "mutating" | "recovery" = "mutating",
    ) => {
      if (
        descriptor.environmentKind !== "production" ||
        descriptor.dataContext !== "live"
      ) {
        throw new EnvironmentContextError(
          `A Live provider action requires the Production environment with Live data. This process is Demo environment with ${descriptor.dataContext}.`,
          descriptor,
        );
      }
      if (mode === "recovery") return;
      throw new ActionNotExecutableError(RENEWAL_SHEET_WRITEBACK_ACTION_KEY);
    },
  );
});

describe("POST /api/lease-renewal/writeback-execute — early execution fences", () => {
  it("returns the exact closed-key refusal after operation parsing but before live dependencies", async () => {
    const { request, json } = requestWithJsonSpy();

    const response = await POST(request);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      action_key: RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
      error: `Action "${RENEWAL_SHEET_WRITEBACK_ACTION_KEY}" is not enabled for execution (production_allowed:false).`,
      error_type: "action_not_production_allowed",
    });
    expect(json).toHaveBeenCalledTimes(1);
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

  it("returns a typed 409 for legacy confirm:true without an exact server preview", async () => {
    mocks.assertSheetWritebackExecutionAllowed.mockImplementation(() => {});
    mocks.buildLiveWritebackDeps.mockReturnValue({ status: "not_configured" });
    const { request } = requestWithJsonSpy();

    const response = await POST(request);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      action_key: RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
      error: "An exact server-issued execution id and preview hash are required.",
      error_type: "confirmation_required",
    });
    expect(mocks.buildLiveWritebackDeps).not.toHaveBeenCalled();
    expect(mocks.prepareOrCommitWriteback).not.toHaveBeenCalled();
  });

  it("passes the immutable preview identifiers through to the service", async () => {
    mocks.assertSheetWritebackExecutionAllowed.mockImplementation(() => {});
    mocks.buildLiveWritebackDeps.mockReturnValue({ lazy: "deps" });
    mocks.prepareOrCommitWriteback.mockResolvedValue({
      status: "written",
      a1: "Renewals!C2",
      duplicate: false,
      receipt: { receiptId: "sheet_write_receipt" },
    });
    const request = new Request("http://localhost/api/lease-renewal/writeback-execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId: "run-1",
        sourceTriggerKey: "trigger-1",
        operation: "write",
        confirm: true,
        executionId: `sheet_write_${"a".repeat(48)}`,
        previewHash: "b".repeat(64),
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.prepareOrCommitWriteback).toHaveBeenCalledWith(
      expect.anything(),
      {
        runId: "run-1",
        sourceTriggerKey: "trigger-1",
        operation: "write",
        confirm: true,
        executionId: `sheet_write_${"a".repeat(48)}`,
        previewHash: "b".repeat(64),
      },
      expect.any(String),
      { lazy: "deps" },
      { descriptor: productionDescriptor },
    );
  });

  it("hydrates durable status through recovery deps while the mutation key is closed", async () => {
    mocks.buildLiveWritebackRecoveryDeps.mockReturnValue({ recovery: "deps" });
    mocks.prepareOrCommitWriteback.mockResolvedValue({
      status: "needs_reconciliation",
      executionId: `sheet_write_${"a".repeat(48)}`,
      operation: "write",
      reason: "Reconcile the one attempt.",
    });
    const request = new Request("http://localhost/api/lease-renewal/writeback-execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId: "run-1",
        sourceTriggerKey: "trigger-1",
        operation: "status",
        confirm: false,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "needs_reconciliation",
      operation: "write",
    });
    expect(mocks.buildLiveWritebackDeps).not.toHaveBeenCalled();
    expect(mocks.buildLiveWritebackRecoveryDeps).toHaveBeenCalledTimes(1);
    expect(mocks.prepareOrCommitWriteback).toHaveBeenCalledWith(
      expect.anything(),
      {
        runId: "run-1",
        sourceTriggerKey: "trigger-1",
        operation: "status",
        confirm: false,
      },
      expect.any(String),
      { recovery: "deps" },
      { descriptor: productionDescriptor },
    );
  });
});
