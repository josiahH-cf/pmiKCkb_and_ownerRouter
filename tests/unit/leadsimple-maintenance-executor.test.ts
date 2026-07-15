import { describe, expect, it, vi } from "vitest";

import { LeadSimpleMaintenanceExecutor } from "@/lib/maintenance/execution/providers";

const base = {
  workflowId: "ticket-1",
  actionId: "leadsimple-1",
  actionKey: "leadsimple.process.update_stage",
  values: {
    process_ref: "process-synthetic",
    stage_ref: "stage-synthetic",
    task_ref: "task-synthetic",
  },
  sourceRefs: ["source:synthetic"],
};

describe("LeadSimple maintenance executor", () => {
  it("updates only mapped process/stage/task and reconciles", async () => {
    const update = vi.fn().mockResolvedValue({ processRef: "process-synthetic" });
    const result = await new LeadSimpleMaintenanceExecutor({
      update,
      read: vi.fn().mockResolvedValue({ stageRef: "stage-synthetic" }),
    }).execute(base);
    expect(result.providerRef).toBe("process-synthetic");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("blocks missing mapping fields before provider", async () => {
    const update = vi.fn();
    await expect(
      new LeadSimpleMaintenanceExecutor({ update, read: vi.fn() }).execute({
        ...base,
        values: { ...base.values, stage_ref: "" },
      }),
    ).rejects.toBeDefined();
    expect(update).not.toHaveBeenCalled();
  });
});
