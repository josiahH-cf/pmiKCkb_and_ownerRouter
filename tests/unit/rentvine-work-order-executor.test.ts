import { describe, expect, it, vi } from "vitest";

import { RentvineWorkOrderExecutor } from "@/lib/maintenance/execution/providers";

const base = {
  workflowId: "ticket-1",
  actionId: "status-1",
  actionKey: "rentvine.work_order.update_status",
  values: {
    operation: "status",
    work_order_ref: "wo-synthetic",
    expected_status: "Scheduled",
    target: "Closed",
    completion_evidence: true,
  },
  sourceRefs: ["source:synthetic"],
};

describe("Rentvine work-order executor", () => {
  it("validates transition, mutates once, and reads after write", async () => {
    let status = "Scheduled";
    const mutate = vi.fn(async ({ target }) => {
      status = target;
      return { workOrderRef: "wo-synthetic" };
    });
    const result = await new RentvineWorkOrderExecutor({
      read: async () => ({ status }),
      mutate,
    }).execute(base);
    expect(result.providerRef).toBe("wo-synthetic");
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("blocks drift, invalid transition, and close without evidence before mutation", async () => {
    const mutate = vi.fn();
    const executor = new RentvineWorkOrderExecutor({
      read: vi.fn().mockResolvedValue({ status: "Open" }),
      mutate,
    });
    await expect(executor.execute(base)).rejects.toBeDefined();
    await expect(
      executor.execute({
        ...base,
        values: { ...base.values, expected_status: "Open", target: "Scheduled" },
      }),
    ).rejects.toBeDefined();
    await expect(
      executor.execute({
        ...base,
        values: {
          ...base.values,
          expected_status: "Open",
          target: "Closed",
          completion_evidence: false,
        },
      }),
    ).rejects.toBeDefined();
    expect(mutate).not.toHaveBeenCalled();
  });
});
