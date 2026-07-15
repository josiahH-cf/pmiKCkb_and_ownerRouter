import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import { ExternalActionOrchestrator } from "@/lib/external-execution/orchestrator";
import type {
  ExternalActionDefinition,
  ExternalActionInput,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import {
  LEASE_EXECUTION_ACTIONS,
  LEASE_EXECUTION_DEFINITION_MAP,
} from "@/lib/lease-renewal/execution/matrix";
import {
  MAINTENANCE_EXECUTION_DEFINITION_MAP,
  MAINTENANCE_EXECUTION_ORDER,
} from "@/lib/maintenance/execution/matrix";

function executor(): ExternalExecutor {
  return {
    execute: async (input) => ({
      actionKey: input.actionKey,
      providerRef: `fake:${input.actionId}`,
      resultHash: `fake-hash:${input.actionId}`,
      reconciled: false,
      createdAt: "2026-07-14T00:00:00.000Z",
    }),
    reconcile: async () => null,
  };
}

function input(
  workflowId: string,
  key: string,
  index: number,
  definition: ExternalActionDefinition,
): ExternalActionInput {
  return {
    workflowId,
    actionId: `action-${index}`,
    actionKey: key,
    values: { value: `synthetic-${index}` },
    sourceRefs: ["source:synthetic"],
    contractRef: "documented:fake:integrated-v1",
    connectionRef: "connection:fake",
    mappingRef: "mapping:fake",
    ...(definition.risk === "Medium"
      ? { exactConfirmationHash: `confirmation-${index}` }
      : {}),
    ...(definition.risk === "High" ? { approvedByUid: "admin-synthetic" } : {}),
  };
}

async function runLane(
  workflowId: string,
  order: readonly string[],
  definitions: ReadonlyMap<string, ExternalActionDefinition>,
) {
  const store = new MemoryExternalExecutionStore();
  const orchestrator = new ExternalActionOrchestrator(
    definitions,
    store,
    new Map(order.map((key) => [key, executor()])),
    { isExecutable: () => true, allowFakeContracts: true },
  );
  for (const [index, key] of order.entries()) {
    const action = input(workflowId, key, index, definitions.get(key)!);
    const prepared = await orchestrator.prepare(action, [...store.records.values()]);
    if (prepared.state !== "ready") throw new Error(`${key}: ${prepared.blocker}`);
    await orchestrator.execute(action, prepared.previewHash);
  }
  return {
    actionCount: order.length,
    receiptCount: [...store.records.values()].filter((record) => record.receipt).length,
    attemptCount: [...store.records.values()].reduce(
      (total, record) => total + record.attemptCount,
      0,
    ),
    keys: [...order],
  };
}

export async function runIntegratedFakeV1Acceptance() {
  return {
    mode: "synthetic-fake-only" as const,
    vendorBoundary: {
      verifiedEmailTotp: true,
      assignedTicketOnly: true,
      liveProviderCalls: 0,
    },
    lease: await runLane(
      "lease-integrated-synthetic",
      LEASE_EXECUTION_ACTIONS,
      LEASE_EXECUTION_DEFINITION_MAP,
    ),
    maintenance: await runLane(
      "maintenance-integrated-synthetic",
      MAINTENANCE_EXECUTION_ORDER,
      MAINTENANCE_EXECUTION_DEFINITION_MAP,
    ),
  };
}
