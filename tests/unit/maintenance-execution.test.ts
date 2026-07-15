import { describe, expect, it, vi } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import { ExternalActionOrchestrator } from "@/lib/external-execution/orchestrator";
import { externalPreviewHash } from "@/lib/external-execution/orchestrator";
import type {
  ExternalActionInput,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import {
  MAINTENANCE_EXECUTION_ACTIONS,
  MAINTENANCE_EXECUTION_DEFINITION_MAP,
  MAINTENANCE_EXECUTION_ORDER,
} from "@/lib/maintenance/execution/matrix";
import { FINAL_V1_ACTION_PREVIEW_SCHEMAS } from "@/lib/integrations/final-v1-action-contracts";
import { syntheticExternalTechnicalGates } from "@/tests/helpers/external-execution";

function action(key: string, index: number): ExternalActionInput {
  const definition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get(key)!;
  const schema = FINAL_V1_ACTION_PREVIEW_SCHEMAS[key];
  const vendorMailboxAction = key.startsWith("vendor.gmail.");
  const actor = vendorMailboxAction
    ? ({ role: "Vendor" as const, uid: "vendor-synthetic" } as const)
    : ({ role: "Admin" as const, uid: "admin-synthetic" } as const);
  const base: ExternalActionInput = {
    dataMode: "test",
    workflowId: "maintenance-e2e-synthetic",
    actionId: `action-${index}`,
    actionKey: key,
    values: Object.fromEntries(
      schema.map((field) => [field.name, syntheticValue(field.type, field.name, index)]),
    ),
    sourceRefs: ["source:synthetic"],
    contractRef: "documented:fake:provider-v1",
    connectionRef: "connection:fake",
    mappingRef: "mapping:fake",
    authority: {
      actor,
      roleScopeAuthorized: true,
      technical: syntheticExternalTechnicalGates(),
      communication: {
        workflowLinked: true,
        mailboxScopeAuthorized: true,
        humanInitiated: true,
        recipientMatchesPreview: true,
        reversible: true,
        governedLabel: true,
        scheduled: false,
        bulk: false,
        modelTriggered: false,
      },
      ...(vendorMailboxAction
        ? {
            vendor: {
              assignedTicket: true,
              sameMailbox: true,
              selfConsent: true,
              verifiedEmailTotp: true,
            },
          }
        : {}),
    },
  };
  const previewHash = externalPreviewHash(base);
  base.authority = {
    ...base.authority!,
    ...(definition.risk === "Medium" ? { exactConfirmationHash: previewHash } : {}),
    ...(definition.risk === "High" && actor.role !== "Vendor"
      ? {
          approval: {
            approvedByRole: "Admin",
            approvedByUid: "admin-synthetic",
            previewHash,
            reason: "Synthetic Maintenance provider acceptance.",
          },
        }
      : {}),
  };
  return base;
}

function syntheticValue(type: string, name: string, index: number) {
  if (type === "boolean") return true;
  if (type === "number") return index + 1;
  if (type === "date") return "2026-07-14";
  return `${name}-synthetic-${index}`;
}

function executor(): ExternalExecutor {
  return {
    execute: vi.fn(async (input) => ({
      actionKey: input.actionKey,
      providerRef: `fake:${input.actionId}`,
      resultHash: "a".repeat(64),
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
