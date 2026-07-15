import { describe, expect, it, vi } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import { ExternalActionOrchestrator } from "@/lib/external-execution/orchestrator";
import type {
  ExternalActionInput,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import {
  LEASE_EXECUTION_ACTIONS,
  LEASE_EXECUTION_DEFINITION_MAP,
} from "@/lib/lease-renewal/execution/matrix";

function input(actionKey: string, index: number): ExternalActionInput {
  const definition = LEASE_EXECUTION_DEFINITION_MAP.get(actionKey)!;
  return {
    workflowId: "renewal-e2e-synthetic",
    actionId: `action-${index}`,
    actionKey,
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

function fakeExecutor(): ExternalExecutor {
  return {
    execute: vi.fn(async (value) => ({
      actionKey: value.actionKey,
      providerRef: `fake:${value.actionId}`,
      resultHash: `hash:${value.actionId}`,
      reconciled: false,
      createdAt: "2026-07-14T00:00:00.000Z",
    })),
    reconcile: vi.fn(async () => null),
  };
}

describe("Lease Renewal fake-provider E2E", () => {
  it("completes every R02 action in dependency order with one receipt", async () => {
    const store = new MemoryExternalExecutionStore();
    const executors = new Map(
      LEASE_EXECUTION_ACTIONS.map((key) => [key, fakeExecutor()]),
    );
    const orchestrator = new ExternalActionOrchestrator(
      LEASE_EXECUTION_DEFINITION_MAP,
      store,
      executors,
      { isExecutable: () => true, allowFakeContracts: true },
    );

    for (const [index, key] of LEASE_EXECUTION_ACTIONS.entries()) {
      const action = input(key, index);
      const prepared = await orchestrator.prepare(action, [...store.records.values()]);
      expect(prepared.state, `${key}: ${prepared.blocker}`).toBe("ready");
      const result = await orchestrator.execute(action, prepared.previewHash);
      expect(result.receipt.actionKey).toBe(key);
    }
    expect(
      [...store.records.values()].every((record) => record.state === "succeeded"),
    ).toBe(true);
    expect([...store.records.values()].every((record) => record.attemptCount === 1)).toBe(
      true,
    );
  });

  it("consumes one ambiguous attempt and blocks dependent work", async () => {
    const store = new MemoryExternalExecutionStore();
    const failing = fakeExecutor();
    failing.execute = vi
      .fn()
      .mockRejectedValue(new Error("timeout after provider accept"));
    const executors = new Map<string, ExternalExecutor>([
      [LEASE_EXECUTION_ACTIONS[0], fakeExecutor()],
      [LEASE_EXECUTION_ACTIONS[1], failing],
    ]);
    const orchestrator = new ExternalActionOrchestrator(
      LEASE_EXECUTION_DEFINITION_MAP,
      store,
      executors,
      { isExecutable: () => true, allowFakeContracts: true },
    );
    const draft = input(LEASE_EXECUTION_ACTIONS[0], 0);
    const draftPrepared = await orchestrator.prepare(draft);
    await orchestrator.execute(draft, draftPrepared.previewHash);
    const send = input(LEASE_EXECUTION_ACTIONS[1], 1);
    const sendPrepared = await orchestrator.prepare(send, [...store.records.values()]);
    await expect(orchestrator.execute(send, sendPrepared.previewHash)).rejects.toThrow(
      "ambiguous",
    );
    await expect(
      orchestrator.execute(send, sendPrepared.previewHash),
    ).rejects.toBeDefined();
    expect(failing.execute).toHaveBeenCalledTimes(1);

    const sheet = input(LEASE_EXECUTION_ACTIONS[4], 4);
    const blocked = await orchestrator.prepare(sheet, [...store.records.values()]);
    expect(blocked.state).toBe("blocked");
    expect(blocked.blocker).toContain(LEASE_EXECUTION_ACTIONS[1]);
  });
});
