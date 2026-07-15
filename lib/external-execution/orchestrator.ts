import { createHash } from "node:crypto";

import { isActionExecutable } from "@/lib/integrations/action-gate";
import type {
  ExternalActionDefinition,
  ExternalActionInput,
  ExternalExecutionRecord,
  ExternalExecutionStore,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import { ExternalExecutionError } from "@/lib/external-execution/types";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function externalPreviewHash(input: ExternalActionInput) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        stableValue({
          workflowId: input.workflowId,
          actionId: input.actionId,
          actionKey: input.actionKey,
          values: input.values,
          sourceRefs: [...input.sourceRefs].sort(),
          contractRef: input.contractRef,
          connectionRef: input.connectionRef,
          mappingRef: input.mappingRef,
        }),
      ),
    )
    .digest("hex");
}

export function validateExternalInput(
  definition: ExternalActionDefinition,
  input: ExternalActionInput,
  allowFakeContracts = false,
) {
  if (input.actionKey !== definition.key) {
    return "Action key does not match the immutable workflow graph.";
  }
  if (!input.sourceRefs.length) return "Verified source references are required.";
  if (
    Object.keys(input.values).length === 0 ||
    Object.values(input.values).some(
      (value) =>
        (typeof value === "string" &&
          (!value.trim() || /needs verification/i.test(value))) ||
        (typeof value === "number" && !Number.isFinite(value)),
    )
  ) {
    return "Authoritative values are missing or unverified.";
  }
  if (!input.connectionRef) return "Approved provider connection is required.";
  if (!input.mappingRef) return "Approved account mapping is required.";
  const fakeContract = input.contractRef?.startsWith("documented:fake:") === true;
  if (
    (definition.requiredContract !== "documented" &&
      !(allowFakeContracts && fakeContract)) ||
    !input.contractRef?.startsWith("documented:")
  ) {
    return definition.requiredContract === "undocumented"
      ? "Blocked: vendor contract required."
      : "Documented provider contract is required.";
  }
  if (definition.risk === "High" && !input.approvedByUid) {
    return "Admin approval is required for this High action.";
  }
  if (definition.risk === "Medium" && !input.exactConfirmationHash) {
    return "Exact human confirmation is required for this communication.";
  }
  return null;
}

export class ExternalActionOrchestrator {
  constructor(
    private readonly definitions: ReadonlyMap<string, ExternalActionDefinition>,
    private readonly store: ExternalExecutionStore,
    private readonly executors: ReadonlyMap<string, ExternalExecutor>,
    private readonly options: {
      now?: () => Date;
      isExecutable?: (actionKey: string) => boolean;
      allowFakeContracts?: boolean;
    } = {},
  ) {}

  async prepare(
    input: ExternalActionInput,
    dependencyRecords: readonly ExternalExecutionRecord[] = [],
  ) {
    const definition = this.definitions.get(input.actionKey);
    if (!definition)
      throw new ExternalExecutionError("Unknown workflow action.", "blocked");
    const blocker = validateExternalInput(
      definition,
      input,
      this.options.allowFakeContracts === true,
    );
    const missingDependency = definition.dependsOn.find(
      (key) =>
        !dependencyRecords.some(
          (record) =>
            record.actionKey === key &&
            (record.state === "succeeded" || record.state === "not_applicable"),
        ),
    );
    const previewHash = externalPreviewHash(input);
    const now = (this.options.now ?? (() => new Date()))().toISOString();
    const record: ExternalExecutionRecord = {
      id: `${input.workflowId}:${input.actionId}`,
      workflowId: input.workflowId,
      actionId: input.actionId,
      actionKey: input.actionKey,
      previewHash,
      idempotencyKey: createHash("sha256")
        .update(`${input.workflowId}:${input.actionId}:${input.actionKey}`)
        .digest("hex"),
      state: blocker || missingDependency ? "blocked" : "ready",
      attemptCount: 0,
      ...(blocker
        ? { blocker }
        : missingDependency
          ? { blocker: `Dependency ${missingDependency} has no successful receipt.` }
          : {}),
      createdAt: now,
      updatedAt: now,
    };
    await this.store.create(record);
    return record;
  }

  async execute(input: ExternalActionInput, confirmedPreviewHash: string) {
    const recordId = `${input.workflowId}:${input.actionId}`;
    const record = await this.store.get(recordId);
    if (!record || record.state === "blocked") {
      throw new ExternalExecutionError(
        record?.blocker ?? "Action is not prepared.",
        "blocked",
      );
    }
    const currentHash = externalPreviewHash(input);
    if (currentHash !== confirmedPreviewHash || currentHash !== record.previewHash) {
      throw new ExternalExecutionError(
        "The action preview changed. Prepare it again.",
        "stale_preview",
      );
    }
    const executable = this.options.isExecutable ?? isActionExecutable;
    if (!executable(input.actionKey)) {
      throw new ExternalExecutionError(
        `Action ${input.actionKey} remains Registry-closed.`,
        "blocked",
      );
    }
    const executor = this.executors.get(input.actionKey);
    if (!executor)
      throw new ExternalExecutionError("Provider adapter is unavailable.", "blocked");
    const claim = await this.store.claim(recordId, currentHash);
    if (claim === "duplicate") {
      const existing = await this.store.get(recordId);
      if (existing?.receipt) return { receipt: existing.receipt, duplicate: true };
      throw new ExternalExecutionError(
        "The action already consumed its attempt.",
        "duplicate",
      );
    }
    if (claim !== "claimed") {
      throw new ExternalExecutionError(
        "The action cannot claim an execution attempt.",
        "blocked",
      );
    }
    try {
      const receipt = await executor.execute(input);
      await this.store.finish(recordId, receipt);
      return { receipt, duplicate: false };
    } catch (error) {
      const ambiguous =
        !(error instanceof ExternalExecutionError) || error.code === "ambiguous";
      await this.store.fail(recordId, ambiguous);
      throw new ExternalExecutionError(
        ambiguous
          ? "The external result is ambiguous. Reconcile before any correction."
          : "The provider refused the one allowed attempt.",
        ambiguous ? "ambiguous" : "provider",
      );
    }
  }

  async reconcile(input: ExternalActionInput) {
    const recordId = `${input.workflowId}:${input.actionId}`;
    const record = await this.store.get(recordId);
    if (!record || record.state !== "ambiguous") {
      throw new ExternalExecutionError(
        "Only an ambiguous action can reconcile.",
        "blocked",
      );
    }
    const executor = this.executors.get(input.actionKey);
    if (!executor)
      throw new ExternalExecutionError("Provider adapter is unavailable.", "blocked");
    const receipt = await executor.reconcile(input);
    if (!receipt) return { status: "not_found" as const };
    await this.store.finish(recordId, { ...receipt, reconciled: true });
    return { status: "succeeded" as const, receipt };
  }
}
