import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
import {
  externalActionContextHash,
  externalActionIdempotencyKey,
  externalActionRecordId,
} from "@/lib/external-execution/identity";
import {
  createIsolatedTestExternalActionOrchestrator,
  externalPreviewHash,
  ExternalActionOrchestrator,
  markIsolatedTestExecutor,
  validateExternalInput,
} from "@/lib/external-execution/orchestrator";
import type {
  ExternalActionDefinition,
  ExternalActionInput,
  ExternalExecutionRecord,
  ExternalExecutionStore,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { LEASE_EXECUTION_DEFINITION_MAP } from "@/lib/lease-renewal/execution/matrix";
import { MAINTENANCE_EXECUTION_DEFINITION_MAP } from "@/lib/maintenance/execution/matrix";
import { buildSyntheticActionInput } from "@/lib/release/synthetic-execution";

function synthetic(definition: ExternalActionDefinition, index = 0): ExternalActionInput {
  return buildSyntheticActionInput(
    LEASE_EXECUTION_DEFINITION_MAP.has(definition.key) ? "lease" : "maintenance",
    definition.key,
    index,
    definition,
  );
}

function receiptExecutor(
  execute = vi.fn(async (input: ExternalActionInput) => ({
    actionKey: input.actionKey,
    providerRef: "provider:synthetic",
    resultHash: "a".repeat(64),
    reconciled: false,
    createdAt: "2026-07-14T00:00:00.000Z",
  })),
): ExternalExecutor {
  return { execute, reconcile: vi.fn(async () => null) };
}

function orchestrator(
  definition: ExternalActionDefinition,
  store: MemoryExternalExecutionStore,
  executor: ExternalExecutor,
  isExecutable: (key: string) => boolean = () => true,
  allowFakeContracts = true,
) {
  return new ExternalActionOrchestrator(
    new Map([[definition.key, definition]]),
    store,
    new Map([[definition.key, executor]]),
    {
      allowFakeContracts,
      isExecutable,
      registry: ACTION_REGISTRY_SEED,
    },
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("external execution fail-closed boundary", () => {
  it("binds production Test receipts to no-client adapters and rejects cross-lane execution", async () => {
    const definition = LEASE_EXECUTION_DEFINITION_MAP.get(
      "gmail.renewal_notice.draft_create",
    )!;
    const input = synthetic(definition);
    const store = new MemoryExternalExecutionStore();
    const rawExecutor = receiptExecutor();
    const isolated = createIsolatedTestExternalActionOrchestrator(
      new Map([[definition.key, definition]]),
      store,
      new Map([[definition.key, markIsolatedTestExecutor(rawExecutor)]]),
    );

    const prepared = await isolated.prepare(input);
    expect(prepared).toMatchObject({ dataMode: "test", state: "ready" });
    await expect(isolated.execute(input, prepared.previewHash)).resolves.toMatchObject({
      receipt: { dataMode: "test", liveEvidenceEligible: false },
    });

    await expect(
      isolated.prepare({
        ...input,
        dataMode: "live",
        workflowId: "renewal-live-cross-lane",
      }),
    ).rejects.toThrow(/cannot execute a Live record/i);

    const memory = new MemoryExternalExecutionStore();
    const durable = {
      persistence: "firestore" as const,
      get: memory.get.bind(memory),
      create: memory.create.bind(memory),
      claim: memory.claim.bind(memory),
      finish: memory.finish.bind(memory),
      fail: memory.fail.bind(memory),
    } satisfies ExternalExecutionStore;
    vi.stubEnv("NODE_ENV", "production");
    const liveBoundary = new ExternalActionOrchestrator(
      new Map([[definition.key, definition]]),
      durable,
      new Map([[definition.key, rawExecutor]]),
    );
    await expect(liveBoundary.prepare(input)).rejects.toThrow(
      /Test records must use the isolated Test workspace/i,
    );
    expect(rawExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it("blocks synthetic references by default and cannot enable them in production", async () => {
    const definition = LEASE_EXECUTION_DEFINITION_MAP.get(
      "gmail.renewal_notice.draft_create",
    )!;
    const input = synthetic(definition);
    const store = new MemoryExternalExecutionStore();
    const executor = receiptExecutor();
    const boundary = orchestrator(definition, store, executor, () => true, false);

    const prepared = await boundary.prepare(input);
    expect(prepared.state).toBe("blocked");
    expect(prepared.blocker).toContain("test-only");
    expect(prepared.attemptCount).toBe(0);
    expect(executor.execute).not.toHaveBeenCalled();

    vi.stubEnv("NODE_ENV", "production");
    expect(() => orchestrator(definition, store, executor)).toThrow(
      /production.*(option overrides|durable Firestore)/i,
    );
  });

  it("fences production staff to S20 while retaining only the durable scoped Vendor seam", async () => {
    const definition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get("vendor.gmail.health")!;
    const vendor = synthetic(definition);
    vendor.dataMode = "live";
    vendor.contractRef = "documented:vendor-gmail:v1";
    vendor.connectionRef = "vendor-gmail-connection-v1";
    vendor.mappingRef = "vendor-mailbox-mapping-v1";
    vendor.sourceRefs = ["vendor-assignment-source-v1"];
    const memory = new MemoryExternalExecutionStore();
    const durable = {
      persistence: "firestore" as const,
      get: memory.get.bind(memory),
      create: memory.create.bind(memory),
      claim: memory.claim.bind(memory),
      finish: memory.finish.bind(memory),
      fail: memory.fail.bind(memory),
    } satisfies ExternalExecutionStore;
    vi.stubEnv("NODE_ENV", "production");
    const execute = vi.fn();
    const boundary = new ExternalActionOrchestrator(
      new Map([[definition.key, definition]]),
      durable,
      new Map([[definition.key, { execute, reconcile: vi.fn() }]]),
    );
    await expect(
      boundary.prepare({
        ...vendor,
        authority: {
          ...vendor.authority!,
          actor: { role: "Admin", uid: "admin-synthetic" },
        },
      }),
    ).rejects.toThrow(/Internal production actors.*S20/i);
    await expect(boundary.prepare(vendor)).resolves.toMatchObject({
      attemptCount: 0,
      state: "blocked",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks Registry closure and exact-schema drift before an attempt", async () => {
    const definition = LEASE_EXECUTION_DEFINITION_MAP.get(
      "gmail.renewal_notice.draft_create",
    )!;
    const executor = receiptExecutor();
    const closedStore = new MemoryExternalExecutionStore();
    const closed = orchestrator(definition, closedStore, executor, () => false);
    const valid = synthetic(definition);
    const closedRecord = await closed.prepare(valid);
    expect(closedRecord.state).toBe("blocked");
    expect(closedRecord.blocker).toContain("Registry-closed");

    const drifted = synthetic(definition, 1);
    const missingBody = { ...drifted.values };
    delete missingBody.body;
    drifted.values = { ...missingBody, hidden_effect: "not reviewed" };
    const schemaStore = new MemoryExternalExecutionStore();
    const schemaBoundary = orchestrator(definition, schemaStore, executor);
    const schemaRecord = await schemaBoundary.prepare(drifted);
    expect(schemaRecord.state).toBe("blocked");
    expect(schemaRecord.blocker).toContain('Missing required preview field "body"');
    expect(schemaRecord.blocker).toContain('Unexpected preview field "hidden_effect"');
    expect(schemaRecord.attemptCount).toBe(0);
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("accepts dependencies only from the same workflow with matching receipts", async () => {
    const definition = LEASE_EXECUTION_DEFINITION_MAP.get(
      "google_sheets.renewal_checklist.writeback",
    )!;
    const input = synthetic(definition);
    const store = new MemoryExternalExecutionStore();
    const boundary = orchestrator(definition, store, receiptExecutor());
    const dependency = dependencyRecord(input, "gmail.renewal_notice.send");

    const crossWorkflow = { ...dependency, workflowId: "lease-other" };
    let record = await boundary.prepare(input, [crossWorkflow]);
    expect(record.state).toBe("blocked");
    expect(record.blocker).toContain("gmail.renewal_notice.send");

    const nextInput = synthetic(definition, 1);
    const wrongReceipt = {
      ...dependencyRecord(nextInput, "gmail.renewal_notice.send"),
      receipt: {
        ...dependency.receipt!,
        actionKey: "gmail.label.apply",
      },
    };
    record = await boundary.prepare(nextInput, [wrongReceipt]);
    expect(record.state).toBe("blocked");

    const laneInput = synthetic(definition, 2);
    const crossLane = {
      ...dependencyRecord(laneInput, "gmail.renewal_notice.send"),
      dataMode: "live" as const,
      receipt: {
        ...dependencyRecord(laneInput, "gmail.renewal_notice.send").receipt!,
        dataMode: "live" as const,
        liveEvidenceEligible: true,
      },
    };
    record = await boundary.prepare(laneInput, [crossLane]);
    expect(record.state).toBe("blocked");
    expect(record.blocker).toContain("gmail.renewal_notice.send");
  });

  it("marks a wrong-action provider receipt ambiguous after exactly one claim", async () => {
    const definition = LEASE_EXECUTION_DEFINITION_MAP.get(
      "gmail.renewal_notice.draft_create",
    )!;
    const input = synthetic(definition);
    const store = new MemoryExternalExecutionStore();
    const execute = vi.fn(async () => ({
      actionKey: "gmail.label.apply",
      providerRef: "provider:wrong-action",
      resultHash: "b".repeat(64),
      reconciled: false,
      createdAt: "2026-07-14T00:00:00.000Z",
    }));
    const boundary = orchestrator(definition, store, receiptExecutor(execute));
    const prepared = await boundary.prepare(input);

    await expect(boundary.execute(input, prepared.previewHash)).rejects.toMatchObject({
      code: "ambiguous",
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await store.get(prepared.id)).toMatchObject({
      attemptCount: 1,
      state: "ambiguous",
    });
  });

  it("returns and stores only the allowlisted bodyless receipt fields", async () => {
    const definition = LEASE_EXECUTION_DEFINITION_MAP.get(
      "gmail.renewal_notice.draft_create",
    )!;
    const input = synthetic(definition);
    const store = new MemoryExternalExecutionStore();
    const execute = vi.fn(async () => ({
      actionKey: input.actionKey,
      providerRef: "provider:sanitized",
      resultHash: "a".repeat(64),
      reconciled: false,
      createdAt: "2026-07-14T00:00:00.000Z",
      token: "secret-like-test-value",
      body: "customer-like-test-value",
    }));
    const boundary = orchestrator(definition, store, receiptExecutor(execute));
    const prepared = await boundary.prepare(input);
    const result = await boundary.execute(input, prepared.previewHash);
    expect(JSON.stringify(result)).not.toMatch(/secret-like|customer-like|token|body/);
    expect(JSON.stringify(await store.get(prepared.id))).not.toMatch(
      /secret-like|customer-like|token|body/,
    );
  });

  it("keeps authority gates but does not strand read-only reconciliation behind Registry closure", async () => {
    const definition = LEASE_EXECUTION_DEFINITION_MAP.get(
      "gmail.renewal_notice.draft_create",
    )!;
    const input = synthetic(definition);
    const store = new MemoryExternalExecutionStore();
    let executable = true;
    const reconcile = vi.fn(async (value: ExternalActionInput) => ({
      actionKey: value.actionKey,
      providerRef: "provider:reconciled",
      resultHash: "c".repeat(64),
      reconciled: true,
      createdAt: "2026-07-14T00:00:00.000Z",
    }));
    const executor: ExternalExecutor = {
      execute: vi.fn(async () => {
        throw new Error("timeout after provider acceptance");
      }),
      reconcile,
    };
    const boundary = orchestrator(definition, store, executor, () => executable);
    const prepared = await boundary.prepare(input);
    await expect(boundary.execute(input, prepared.previewHash)).rejects.toMatchObject({
      code: "ambiguous",
    });

    executable = false;
    input.authority!.roleScopeAuthorized = false;
    await expect(boundary.reconcile(input)).rejects.toThrow("scope");
    input.authority!.roleScopeAuthorized = true;
    await expect(boundary.reconcile(input)).resolves.toMatchObject({
      status: "succeeded",
    });
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("lets a production Vendor reconcile a consumed read while new execution stays Registry-closed", async () => {
    const definition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get("vendor.gmail.health")!;
    const value = synthetic(definition);
    value.dataMode = "live";
    value.workflowId = "vendor-workflow-placeholder-1";
    value.actionId = "vendor-health-placeholder-1";
    value.contractRef = "documented:vendor-gmail:v1";
    value.connectionRef = "vendor-gmail-connection-v1";
    value.mappingRef = "vendor-mailbox-mapping-v1";
    value.sourceRefs = ["vendor-assignment-source-v1"];
    value.values = {
      vendor_ref: "vendor-placeholder-1",
      mailbox_email: "vendor-placeholder@example.invalid",
    };
    value.authority = {
      ...value.authority!,
      technical: {
        ...value.authority!.technical,
        productionAllowed: false,
      },
    };
    const memory = new MemoryExternalExecutionStore();
    const durable = {
      persistence: "firestore" as const,
      get: memory.get.bind(memory),
      create: memory.create.bind(memory),
      claim: memory.claim.bind(memory),
      finish: memory.finish.bind(memory),
      fail: memory.fail.bind(memory),
    } satisfies ExternalExecutionStore;
    await memory.create({
      id: externalActionRecordId(value),
      dataMode: "live",
      workflowId: value.workflowId,
      actionId: value.actionId,
      actionKey: value.actionKey,
      contextHash: externalActionContextHash(value),
      previewHash: externalPreviewHash(value),
      idempotencyKey: externalActionIdempotencyKey(value),
      state: "ambiguous",
      attemptCount: 1,
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    });
    const reconcile = vi.fn(async () => ({
      actionKey: value.actionKey,
      providerRef: "provider:vendor-health-placeholder-1",
      resultHash: "d".repeat(64),
      reconciled: true,
      createdAt: "2026-07-14T00:00:00.000Z",
    }));
    const execute = vi.fn();

    vi.stubEnv("NODE_ENV", "production");
    const boundary = new ExternalActionOrchestrator(
      new Map([[definition.key, definition]]),
      durable,
      new Map([[definition.key, { execute, reconcile }]]),
    );
    await expect(boundary.execute(value, externalPreviewHash(value))).rejects.toThrow(
      /action_not_production_allowed|Registry-closed/i,
    );
    expect(execute).not.toHaveBeenCalled();
    await expect(boundary.reconcile(value)).resolves.toMatchObject({
      status: "succeeded",
    });
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("allows exact Admin Vendor support without Vendor TOTP but never Admin consent", () => {
    const readDefinition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get(
      "vendor.gmail.thread.read",
    )!;
    const read = synthetic(readDefinition);
    read.authority = {
      ...read.authority!,
      actor: { role: "Admin", uid: "admin-support-synthetic" },
      vendor: {
        adminSupportAuthorized: true,
        assignedTicket: true,
        sameMailbox: true,
        selfConsent: false,
        verifiedEmailTotp: false,
      },
    };
    expect(validateExternalInput(readDefinition, read, true)).toBeNull();
    read.authority.vendor!.adminSupportAuthorized = false;
    expect(validateExternalInput(readDefinition, read, true)).toContain(
      "Admin Vendor-mail support",
    );

    const connectDefinition =
      MAINTENANCE_EXECUTION_DEFINITION_MAP.get("vendor.gmail.connect")!;
    const connect = synthetic(connectDefinition);
    connect.authority = {
      ...connect.authority!,
      actor: { role: "Admin", uid: "admin-support-synthetic" },
      vendor: {
        adminSupportAuthorized: true,
        assignedTicket: true,
        sameMailbox: true,
        selfConsent: true,
        verifiedEmailTotp: false,
      },
    };
    expect(validateExternalInput(connectDefinition, connect, true)).toContain(
      "Only the verified Vendor",
    );
  });
});

function dependencyRecord(
  input: ExternalActionInput,
  actionKey: string,
): ExternalExecutionRecord {
  return {
    id: `${input.workflowId}:dependency`,
    dataMode: input.dataMode ?? "live",
    workflowId: input.workflowId,
    actionId: "dependency",
    actionKey,
    contextHash: "c".repeat(64),
    previewHash: "d".repeat(64),
    idempotencyKey: "e".repeat(64),
    state: "succeeded",
    attemptCount: 1,
    receipt: {
      actionKey,
      dataMode: input.dataMode ?? "live",
      liveEvidenceEligible: (input.dataMode ?? "live") === "live",
      providerRef: "provider:dependency",
      resultHash: "f".repeat(64),
      reconciled: false,
      createdAt: "2026-07-14T00:00:00.000Z",
    },
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
  };
}
