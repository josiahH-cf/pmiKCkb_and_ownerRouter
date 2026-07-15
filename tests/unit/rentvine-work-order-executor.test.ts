import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { ExternalActionInput } from "@/lib/external-execution/types";
import {
  RentvineWorkOrderExecutor,
  type RentvineWorkOrderProvider,
  type RentvineWorkOrderState,
} from "@/lib/maintenance/execution/providers";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

const statusInput = {
  workflowId: "ticket-synthetic",
  actionId: "status-1",
  actionKey: "rentvine.work_order.update_status",
  values: {
    work_order_id: "wo-synthetic",
    current_status: "Scheduled",
    target_status: "Closed",
    completion_evidence: true,
    financial_checks_passed: true,
    owner_checks_passed: true,
  },
  sourceRefs: ["source:synthetic"],
} satisfies ExternalActionInput;

function harness(initial: RentvineWorkOrderState): {
  provider: RentvineWorkOrderProvider;
  create: ReturnType<typeof vi.fn>;
  assignVendor: ReturnType<typeof vi.fn>;
  updateStatus: ReturnType<typeof vi.fn>;
} {
  let state = { ...initial };
  const create = vi.fn(async (input) => {
    state = {
      workOrderRef: "wo-created",
      status: input.expectedStatus,
      propertyUnitRef: input.propertyUnitRef,
      vendorTradeRef: input.vendorTradeRef,
      descriptionHash: hash(input.description),
      priority: input.priority,
    };
    return { workOrderRef: state.workOrderRef };
  });
  const assignVendor = vi.fn(async (input) => {
    if (
      state.workOrderRef !== input.workOrderRef ||
      state.status !== input.expectedStatus ||
      (state.vendorRef ?? "unassigned") !== input.expectedVendorRef
    ) {
      return { workOrderRef: input.workOrderRef, applied: false };
    }
    state = { ...state, vendorRef: input.vendorRef };
    return { workOrderRef: state.workOrderRef, applied: true };
  });
  const updateStatus = vi.fn(async (input) => {
    if (
      state.workOrderRef !== input.workOrderRef ||
      state.status !== input.expectedStatus
    ) {
      return { workOrderRef: input.workOrderRef, applied: false };
    }
    state = { ...state, status: input.targetStatus };
    return { workOrderRef: state.workOrderRef, applied: true };
  });
  return {
    create,
    assignVendor,
    updateStatus,
    provider: {
      create,
      assignVendor,
      updateStatus,
      read: vi.fn(async () => ({ ...state })),
      reconcile: vi.fn(async () => ({ ...state })),
    },
  };
}

describe("Rentvine work-order executor", () => {
  it("binds create to the Registry preview fields and verifies exact readback", async () => {
    const input = {
      ...statusInput,
      actionId: "create-1",
      actionKey: "rentvine.work_order.create",
      values: {
        property_unit: "unit-synthetic-101",
        vendor_trade: "plumbing-synthetic",
        description: "Synthetic kitchen leak",
        priority: "Normal",
        expected_status: "Open",
      },
    } satisfies ExternalActionInput;
    const { provider, create, assignVendor, updateStatus } = harness({
      workOrderRef: "unused",
      status: "Open",
    });
    const result = await new RentvineWorkOrderExecutor(provider).execute(input);
    expect(result.providerRef).toBe("wo-created");
    expect(create).toHaveBeenCalledTimes(1);
    expect(assignVendor).not.toHaveBeenCalled();
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it("binds assignment to current Vendor/status and verifies the target Vendor", async () => {
    const input = {
      ...statusInput,
      actionId: "assign-1",
      actionKey: "rentvine.work_order.assign_vendor",
      values: {
        work_order_id: "wo-synthetic",
        current_vendor: "unassigned",
        target_vendor: "vendor-synthetic",
        current_status: "Open",
        reason: "Assign synthetic plumbing Vendor",
      },
    } satisfies ExternalActionInput;
    const { provider, assignVendor } = harness({
      workOrderRef: "wo-synthetic",
      status: "Open",
    });
    await expect(
      new RentvineWorkOrderExecutor(provider).execute(input),
    ).resolves.toMatchObject({ providerRef: "wo-synthetic" });
    expect(assignVendor).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStatus: "Open",
        expectedVendorRef: "unassigned",
        vendorRef: "vendor-synthetic",
      }),
    );
  });

  it("validates transition, mutates once, and reads after write", async () => {
    const { provider, updateStatus } = harness({
      workOrderRef: "wo-synthetic",
      status: "Scheduled",
      vendorRef: "vendor-synthetic",
    });
    const result = await new RentvineWorkOrderExecutor(provider).execute(statusInput);
    expect(result.providerRef).toBe("wo-synthetic");
    expect(updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStatus: "Scheduled",
        targetStatus: "Closed",
      }),
    );
  });

  it("blocks operation/key drift, state drift, invalid transition, and incomplete close", async () => {
    const { provider, create, assignVendor, updateStatus } = harness({
      workOrderRef: "wo-synthetic",
      status: "Open",
    });
    const executor = new RentvineWorkOrderExecutor(provider);
    expect(
      executor.validate({ ...statusInput, actionKey: "rentvine.work_order.create" }),
    ).toContain("property_unit");
    await expect(executor.execute(statusInput)).rejects.toBeDefined();
    for (const patch of [
      { current_status: "Open", target_status: "Scheduled" },
      { completion_evidence: false },
      { financial_checks_passed: false },
      { owner_checks_passed: false },
    ]) {
      await expect(
        executor.execute({
          ...statusInput,
          values: { ...statusInput.values, ...patch },
        }),
      ).rejects.toBeDefined();
    }
    expect(create).not.toHaveBeenCalled();
    expect(assignVendor).not.toHaveBeenCalled();
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it("marks wrong assignment readback ambiguous", async () => {
    const input = {
      ...statusInput,
      actionKey: "rentvine.work_order.assign_vendor",
      values: {
        work_order_id: "wo-synthetic",
        current_vendor: "vendor-old",
        target_vendor: "vendor-new",
        current_status: "Open",
        reason: "Synthetic reassignment",
      },
    } satisfies ExternalActionInput;
    const provider: RentvineWorkOrderProvider = {
      create: vi.fn(),
      updateStatus: vi.fn(),
      assignVendor: vi.fn().mockResolvedValue({
        workOrderRef: "wo-synthetic",
        applied: true,
      }),
      read: vi.fn().mockResolvedValue({
        workOrderRef: "wo-synthetic",
        status: "Open",
        vendorRef: "vendor-old",
      }),
      reconcile: vi.fn(),
    };
    await expect(
      new RentvineWorkOrderExecutor(provider).execute(input),
    ).rejects.toMatchObject({ code: "ambiguous" });
  });

  it("rejects a mutation result for a different work order", async () => {
    const input = {
      ...statusInput,
      actionKey: "rentvine.work_order.assign_vendor",
      values: {
        work_order_id: "wo-synthetic",
        current_vendor: "vendor-old",
        target_vendor: "vendor-new",
        current_status: "Open",
        reason: "Synthetic reassignment",
      },
    } satisfies ExternalActionInput;
    const provider: RentvineWorkOrderProvider = {
      create: vi.fn(),
      updateStatus: vi.fn(),
      assignVendor: vi.fn().mockResolvedValue({
        workOrderRef: "wo-other",
        applied: true,
      }),
      read: vi.fn().mockResolvedValue({
        workOrderRef: "wo-synthetic",
        status: "Open",
        vendorRef: "vendor-old",
      }),
      reconcile: vi.fn(),
    };

    await expect(
      new RentvineWorkOrderExecutor(provider).execute(input),
    ).rejects.toMatchObject({ code: "ambiguous" });
    expect(provider.read).toHaveBeenCalledTimes(1);
  });

  it("refuses provider mutations when the atomic expected state no longer matches", async () => {
    const provider: RentvineWorkOrderProvider = {
      create: vi.fn(),
      assignVendor: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue({
        workOrderRef: "wo-synthetic",
        applied: false,
      }),
      read: vi.fn().mockResolvedValue({
        workOrderRef: "wo-synthetic",
        status: "Scheduled",
        vendorRef: "vendor-synthetic",
      }),
      reconcile: vi.fn(),
    };

    await expect(
      new RentvineWorkOrderExecutor(provider).execute(statusInput),
    ).rejects.toMatchObject({ code: "provider" });
    expect(provider.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ expectedStatus: "Scheduled" }),
    );
    expect(provider.read).toHaveBeenCalledTimes(1);
  });

  it("returns a reconciled receipt only for the exact reviewed outcome", async () => {
    const { provider } = harness({
      workOrderRef: "wo-synthetic",
      status: "Closed",
      vendorRef: "vendor-synthetic",
    });

    await expect(
      new RentvineWorkOrderExecutor(provider).reconcile(statusInput),
    ).resolves.toMatchObject({
      providerRef: "wo-synthetic",
      reconciled: true,
    });
  });
});
