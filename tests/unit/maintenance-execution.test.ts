import { describe, expect, it, vi } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import { ExternalActionOrchestrator } from "@/lib/external-execution/orchestrator";
import type {
  ExternalActionInput,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import {
  MAINTENANCE_EXECUTION_ACTIONS,
  MAINTENANCE_EXECUTION_DEFINITION_MAP,
  MAINTENANCE_EXECUTION_ORDER,
} from "@/lib/maintenance/execution/matrix";

function action(key: string, index: number): ExternalActionInput {
  const definition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get(key)!;
  return {
    workflowId: "maintenance-e2e-synthetic",
    actionId: `action-${index}`,
    actionKey: key,
    values: { value: `synthetic-${index}` },
    sourceRefs: ["source:synthetic"],
    contractRef: "documented:fake:provider-v1",
    connectionRef: "connection:fake",
    mappingRef: "mapping:fake",
    ...(definition.risk === "Medium"
      ? { exactConfirmationHash: `confirmation-${index}` }
      : {}),
    ...(definition.risk === "High" ? { approvedByUid: "admin-synthetic" } : {}),
  };
}

function executor(): ExternalExecutor {
  return {
    execute: vi.fn(async (input) => ({
      actionKey: input.actionKey,
      providerRef: `fake:${input.actionId}`,
      resultHash: `hash:${input.actionId}`,
      reconciled: false,
      createdAt: "2026-07-14T00:00:00.000Z",
    })),
    reconcile: vi.fn(async () => null),
  };
}

describe("Maintenance fake-provider E2E", () => {
  it("completes every R03 action in dependency order without duplicate attempts", async () => {
    expect(new Set(MAINTENANCE_EXECUTION_ORDER)).toEqual(
      new Set(MAINTENANCE_EXECUTION_ACTIONS),
    );
    const store = new MemoryExternalExecutionStore();
    const executors = new Map(
      MAINTENANCE_EXECUTION_ACTIONS.map((key) => [key, executor()]),
    );
    const orchestrator = new ExternalActionOrchestrator(
      MAINTENANCE_EXECUTION_DEFINITION_MAP,
      store,
      executors,
      { isExecutable: () => true, allowFakeContracts: true },
    );
    for (const [index, key] of MAINTENANCE_EXECUTION_ORDER.entries()) {
      const input = action(key, index);
      const prepared = await orchestrator.prepare(input, [...store.records.values()]);
      expect(prepared.state, `${key}: ${prepared.blocker}`).toBe("ready");
      await orchestrator.execute(input, prepared.previewHash);
    }
    expect(
      [...store.records.values()].every((record) => record.state === "succeeded"),
    ).toBe(true);
    expect([...store.records.values()].every((record) => record.attemptCount === 1)).toBe(
      true,
    );
  });

  it("stops dependents after ambiguous provider outcome", async () => {
    const store = new MemoryExternalExecutionStore();
    const create = executor();
    create.execute = vi.fn().mockRejectedValue(new Error("timeout"));
    const orchestrator = new ExternalActionOrchestrator(
      MAINTENANCE_EXECUTION_DEFINITION_MAP,
      store,
      new Map([["rentvine.work_order.create", create]]),
      { isExecutable: () => true, allowFakeContracts: true },
    );
    const input = action("rentvine.work_order.create", 0);
    const prepared = await orchestrator.prepare(input);
    await expect(orchestrator.execute(input, prepared.previewHash)).rejects.toThrow(
      "ambiguous",
    );
    await expect(orchestrator.execute(input, prepared.previewHash)).rejects.toBeDefined();
    expect(create.execute).toHaveBeenCalledTimes(1);
    const assign = action("rentvine.work_order.assign_vendor", 1);
    const blocked = await orchestrator.prepare(assign, [...store.records.values()]);
    expect(blocked.state).toBe("blocked");
  });
});
