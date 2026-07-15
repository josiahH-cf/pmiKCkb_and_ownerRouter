import { describe, expect, it, vi } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import { ExternalActionOrchestrator } from "@/lib/external-execution/orchestrator";
import { externalPreviewHash } from "@/lib/external-execution/orchestrator";
import type {
  ExternalActionInput,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  LEASE_EXECUTION_ACTIONS,
  LEASE_EXECUTION_DEFINITION_MAP,
} from "@/lib/lease-renewal/execution/matrix";
import { syntheticExternalTechnicalGates } from "@/tests/helpers/external-execution";

function input(actionKey: string, index: number): ExternalActionInput {
  const definition = LEASE_EXECUTION_DEFINITION_MAP.get(actionKey)!;
  const base: ExternalActionInput = {
    dataMode: "test",
    workflowId: "renewal-e2e-synthetic",
    actionId: `action-${index}`,
    actionKey,
    values: syntheticPreview(actionKey),
    sourceRefs: ["source:synthetic"],
    contractRef: "documented:fake:provider-v1",
    connectionRef: "connection:fake",
    mappingRef: "mapping:fake",
    authority: {
      actor: { role: "Admin", uid: "admin-synthetic" },
      roleScopeAuthorized: true,
      technical: syntheticExternalTechnicalGates(),
      communication: {
        bulk: false,
        governedLabel: true,
        humanInitiated: true,
        mailboxScopeAuthorized: true,
        modelTriggered: false,
        recipientMatchesPreview: true,
        reversible: true,
        scheduled: false,
        workflowLinked: true,
      },
    },
  };
  const previewHash = externalPreviewHash(base);
  base.authority = {
    ...base.authority!,
    ...(definition.risk === "Medium" ? { exactConfirmationHash: previewHash } : {}),
    ...(definition.risk === "High"
      ? {
          approval: {
            approvedByRole: "Admin",
            approvedByUid: "admin-synthetic",
            previewHash,
            reason: "Synthetic Lease provider acceptance.",
          },
        }
      : {}),
  };
  return base;
}

function syntheticPreview(actionKey: string) {
  const fields = ACTION_REGISTRY_SEED.find(
    (entry) => entry.key === actionKey,
  )?.preview_payload_schema;
  if (!fields?.length)
    throw new Error(`Missing synthetic preview schema for ${actionKey}.`);
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      field.type === "number"
        ? 1_000
        : field.type === "boolean"
          ? true
          : field.type === "date"
            ? "2026-08-01"
            : `synthetic-${field.name}`,
    ]),
  );
}

function fakeExecutor(): ExternalExecutor {
  return {
    execute: vi.fn(async (value) => ({
      actionKey: value.actionKey,
      providerRef: `fake:${value.actionId}`,
      resultHash: "a".repeat(64),
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
      ["google_sheets.renewal_checklist.writeback", fakeExecutor()],
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

    const sheet = input("google_sheets.renewal_checklist.writeback", 6);
    const blocked = await orchestrator.prepare(sheet, [...store.records.values()]);
    expect(blocked.state).toBe("blocked");
    expect(blocked.blocker).toContain(LEASE_EXECUTION_ACTIONS[1]);
  });
});
