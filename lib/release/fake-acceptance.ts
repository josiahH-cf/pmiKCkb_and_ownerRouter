import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import { createIsolatedTestExternalActionOrchestrator } from "@/lib/external-execution/orchestrator";
import type {
  ExternalActionDefinition,
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
import {
  buildSyntheticActionInput,
  createSyntheticExecutorHarness,
  type SyntheticLane,
} from "@/lib/release/synthetic-execution";
import { runSyntheticVendorJourney } from "@/lib/release/synthetic-vendor-acceptance";

async function runLane(
  lane: SyntheticLane,
  workflowId: string,
  order: readonly string[],
  definitions: ReadonlyMap<string, ExternalActionDefinition>,
  executors: ReadonlyMap<string, ExternalExecutor>,
  providerCallCount: () => number,
) {
  const store = new MemoryExternalExecutionStore();
  const orchestrator = createIsolatedTestExternalActionOrchestrator(
    definitions,
    store,
    executors,
  );
  const callsBefore = providerCallCount();
  for (const [index, key] of order.entries()) {
    const action = buildSyntheticActionInput(lane, key, index, definitions.get(key)!);
    if (action.workflowId !== workflowId) throw new Error("Synthetic workflow drifted.");
    const prepared = await orchestrator.prepare(action, [...store.records.values()]);
    if (prepared.state !== "ready") throw new Error(`${key}: ${prepared.blocker}`);
    await orchestrator.execute(action, prepared.previewHash);
  }
  const records = [...store.records.values()];
  return {
    actionCount: order.length,
    receiptCount: records.filter((record) => record.receipt).length,
    attemptCount: records.reduce((total, record) => total + record.attemptCount, 0),
    typedAdapterCount: records.filter((record) => record.receipt).length,
    providerCallCount: providerCallCount() - callsBefore,
    keys: [...order],
    actions: records.map((record) => ({
      key: record.actionKey,
      state: record.state,
      attemptCount: record.attemptCount,
      outcome: record.receipt?.outcome ?? "succeeded",
      receiptHash: record.receipt?.resultHash,
    })),
  };
}

export async function runIntegratedFakeV1Acceptance() {
  const harness = createSyntheticExecutorHarness();
  return {
    mode: "production-test-workspace" as const,
    dataMode: "test" as const,
    liveEvidenceEligible: false,
    liveProviderCallCount: 0,
    vendorBoundary: {
      ...(await runSyntheticVendorJourney()),
      typedProviderBoundary: true,
    },
    lease: await runLane(
      "lease",
      "lease-synthetic-001",
      LEASE_EXECUTION_ACTIONS,
      LEASE_EXECUTION_DEFINITION_MAP,
      harness.leaseExecutors,
      harness.providerCallCount,
    ),
    maintenance: await runLane(
      "maintenance",
      "ticket-synthetic-001",
      MAINTENANCE_EXECUTION_ORDER,
      MAINTENANCE_EXECUTION_DEFINITION_MAP,
      harness.maintenanceExecutors,
      harness.providerCallCount,
    ),
    providerOperations: harness.providerOperations(),
  };
}
