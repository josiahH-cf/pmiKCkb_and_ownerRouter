import { describe, expect, it, vi } from "vitest";

import type { ExternalActionInput } from "@/lib/external-execution/types";
import {
  LeadSimpleMaintenanceExecutor,
  type LeadSimpleProvider,
  type LeadSimpleTaskState,
} from "@/lib/maintenance/execution/providers";

const stageInput = {
  workflowId: "ticket-synthetic",
  actionId: "leadsimple-stage-1",
  actionKey: "leadsimple.process.update_stage",
  values: {
    process_id: "process-synthetic",
    current_stage: "stage-open-synthetic",
    target_stage: "stage-scheduled-synthetic",
  },
  sourceRefs: ["source:synthetic"],
} satisfies ExternalActionInput;

const taskInput = {
  ...stageInput,
  actionId: "leadsimple-task-1",
  actionKey: "leadsimple.task.create",
  values: {
    process_id: "process-synthetic",
    task_ref: "task-synthetic",
    task_title: "Confirm synthetic appointment",
    assignee_ref: "assignee-synthetic",
    due_date: "2026-07-15",
  },
} satisfies ExternalActionInput;

function harness() {
  let stageRef = "stage-open-synthetic";
  let task: LeadSimpleTaskState | null = null;
  const updateStage = vi.fn(async ({ processRef, expectedStageRef, targetStageRef }) => {
    if (stageRef !== expectedStageRef) return { processRef, applied: false };
    stageRef = targetStageRef;
    return { processRef, applied: true };
  });
  const createTask = vi.fn(
    async ({ processRef, taskRef, title, assigneeRef, dueDate }) => {
      task = {
        taskRef,
        processRef,
        title,
        assigneeRef,
        dueDate,
      };
      return { taskRef: task.taskRef };
    },
  );
  const provider: LeadSimpleProvider = {
    readProcess: vi.fn(async () => ({ processRef: "process-synthetic", stageRef })),
    updateStage,
    createTask,
    readTask: vi.fn(async () => task),
    reconcileStage: vi.fn(async () => ({ processRef: "process-synthetic", stageRef })),
    reconcileTask: vi.fn(async () => task),
  };
  return { provider, updateStage, createTask };
}

describe("LeadSimple maintenance executor", () => {
  it("updates only the reviewed process stage with current-stage CAS and readback", async () => {
    const { provider, updateStage, createTask } = harness();
    const result = await new LeadSimpleMaintenanceExecutor(provider).execute(stageInput);
    expect(result.providerRef).toBe("process-synthetic");
    expect(updateStage).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStageRef: "stage-open-synthetic",
        targetStageRef: "stage-scheduled-synthetic",
      }),
    );
    expect(createTask).not.toHaveBeenCalled();
  });

  it("creates a typed task without changing the process stage", async () => {
    const { provider, updateStage, createTask } = harness();
    const result = await new LeadSimpleMaintenanceExecutor(provider).execute(taskInput);
    expect(result.providerRef).toBe("task-synthetic");
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        processRef: "process-synthetic",
        title: "Confirm synthetic appointment",
        assigneeRef: "assignee-synthetic",
        dueDate: "2026-07-15",
      }),
    );
    expect(updateStage).not.toHaveBeenCalled();
  });

  it("blocks missing or malformed mappings before provider", async () => {
    const { provider, updateStage, createTask } = harness();
    const executor = new LeadSimpleMaintenanceExecutor(provider);
    for (const input of [
      { ...stageInput, values: { ...stageInput.values, target_stage: "" } },
      {
        ...stageInput,
        values: { ...stageInput.values, target_stage: "stage-open-synthetic" },
      },
      { ...taskInput, values: { ...taskInput.values, due_date: "tomorrow" } },
      { ...taskInput, values: { ...taskInput.values, due_date: "2026-02-30" } },
    ]) {
      expect(executor.validate(input)).toBeTruthy();
      await expect(executor.execute(input)).rejects.toBeDefined();
    }
    expect(updateStage).not.toHaveBeenCalled();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("stops current-stage drift before mutation", async () => {
    const { provider, updateStage } = harness();
    provider.readProcess = vi.fn().mockResolvedValue({
      processRef: "process-synthetic",
      stageRef: "stage-drifted",
    });
    await expect(
      new LeadSimpleMaintenanceExecutor(provider).execute(stageInput),
    ).rejects.toMatchObject({ code: "provider" });
    expect(updateStage).not.toHaveBeenCalled();
  });

  it("rejects process identity drift before mutation", async () => {
    const { provider, updateStage } = harness();
    provider.readProcess = vi.fn().mockResolvedValue({
      processRef: "process-other",
      stageRef: "stage-open-synthetic",
    });

    await expect(
      new LeadSimpleMaintenanceExecutor(provider).execute(stageInput),
    ).rejects.toMatchObject({ code: "provider" });
    expect(updateStage).not.toHaveBeenCalled();
  });

  it("refuses a concurrent stage change at the provider conditional-write boundary", async () => {
    const { provider } = harness();
    const updateStage = vi.fn().mockResolvedValue({
      processRef: "process-synthetic",
      applied: false,
    });
    provider.updateStage = updateStage;

    await expect(
      new LeadSimpleMaintenanceExecutor(provider).execute(stageInput),
    ).rejects.toMatchObject({ code: "provider" });
    expect(updateStage).toHaveBeenCalledWith(
      expect.objectContaining({ expectedStageRef: "stage-open-synthetic" }),
    );
  });

  it("returns reconciled receipts for exact stage and task outcomes", async () => {
    const stageHarness = harness();
    const stageExecutor = new LeadSimpleMaintenanceExecutor(stageHarness.provider);
    await stageExecutor.execute(stageInput);
    await expect(stageExecutor.reconcile(stageInput)).resolves.toMatchObject({
      providerRef: "process-synthetic",
      reconciled: true,
    });

    const taskHarness = harness();
    const taskExecutor = new LeadSimpleMaintenanceExecutor(taskHarness.provider);
    await taskExecutor.execute(taskInput);
    await expect(taskExecutor.reconcile(taskInput)).resolves.toMatchObject({
      providerRef: "task-synthetic",
      reconciled: true,
    });
  });
});
