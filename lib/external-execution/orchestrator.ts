import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  externalActionContextHash,
  externalActionIdempotencyKey,
  externalActionRecordId,
} from "@/lib/external-execution/identity";
import { parseExternalReceipt } from "@/lib/external-execution/receipt";
import { isActionExecutable } from "@/lib/integrations/action-gate";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { validatePreviewPayload } from "@/lib/integrations/preview-payload";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { validateExternalAuthority } from "@/lib/external-execution/authority";
import type {
  ExternalActionDefinition,
  ExternalActionInput,
  ExternalExecutionRecord,
  ExternalExecutionStore,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import { ExternalExecutionError } from "@/lib/external-execution/types";

export function externalPreviewHash(input: ExternalActionInput) {
  // S20 stores the exact value-bearing preview only. Workflow/action identity,
  // actor, refs, and scope are bound in separate immutable ledger fields and
  // trusted-context checks. Both preparation and execution must therefore use
  // this one canonical hash.
  return hashExecutionPreview({ ...input.values });
}

export function validateExternalReadiness(
  definition: ExternalActionDefinition,
  input: ExternalActionInput,
  allowFakeContracts = false,
) {
  if (input.actionKey !== definition.key) {
    return "Action key does not match the immutable workflow graph.";
  }
  if (
    !input.sourceRefs.length ||
    input.sourceRefs.some((reference) => !validReference(reference))
  ) {
    return "Verified source references are required.";
  }
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
  const fakeContract = input.contractRef?.startsWith("documented:fake:") === true;
  const syntheticReference = [
    input.contractRef,
    input.connectionRef,
    input.mappingRef,
    ...input.sourceRefs,
  ].some(
    (value) =>
      typeof value === "string" && /(?:^|:)(?:fake|synthetic)(?:[:_-]|$)/i.test(value),
  );
  if ((fakeContract || syntheticReference) && !allowFakeContracts) {
    return "Synthetic contracts, mappings, connections, and sources are test-only.";
  }
  if (!validReference(input.connectionRef))
    return "Approved provider connection is required.";
  if (!validReference(input.mappingRef)) return "Approved account mapping is required.";
  if (
    (definition.requiredContract !== "documented" &&
      !(allowFakeContracts && fakeContract)) ||
    !input.contractRef?.startsWith("documented:")
  ) {
    return definition.requiredContract === "undocumented"
      ? "Blocked: vendor contract required."
      : "Documented provider contract is required.";
  }
  return null;
}

function validReference(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 500 &&
    value === value.trim()
  );
}

export function validateExternalInput(
  definition: ExternalActionDefinition,
  input: ExternalActionInput,
  allowFakeContracts = false,
) {
  return (
    validateExternalReadiness(definition, input, allowFakeContracts) ??
    validateExternalAuthority(definition, input, externalPreviewHash(input))
  );
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
      registry?: readonly CreateActionRegistryInput[];
    } = {},
  ) {
    if (process.env.NODE_ENV === "production") {
      if (Object.keys(options).length > 0) {
        throw new Error("Production external execution forbids test option overrides.");
      }
      if (store.persistence !== "firestore") {
        throw new Error(
          "Production Vendor execution requires the durable Firestore store.",
        );
      }
    }
  }

  async prepare(
    input: ExternalActionInput,
    dependencyRecords: readonly ExternalExecutionRecord[] = [],
  ) {
    input = snapshotExternalInput(input);
    this.assertProductionDirectActor(input);
    const definition = this.definitions.get(input.actionKey);
    if (!definition)
      throw new ExternalExecutionError("Unknown workflow action.", "blocked");
    const blocker = validateExternalInput(
      definition,
      input,
      this.options.allowFakeContracts === true,
    );
    const previewBlocker = validateRegistryPreview(
      input,
      this.options.registry ?? ACTION_REGISTRY_SEED,
    );
    const executable = this.options.isExecutable ?? isActionExecutable;
    const executor = this.executors.get(input.actionKey);
    const readinessBlocker = !executable(input.actionKey)
      ? `Action ${input.actionKey} remains Registry-closed.`
      : !executor
        ? "Provider adapter is unavailable."
        : executor.validate?.(input);
    const missingDependency = await this.findMissingDependency(
      definition.dependsOn,
      input.workflowId,
      dependencyRecords,
    );
    const previewHash = externalPreviewHash(input);
    const now = (this.options.now ?? (() => new Date()))().toISOString();
    const record: ExternalExecutionRecord = {
      id: externalActionRecordId(input),
      workflowId: input.workflowId,
      actionId: input.actionId,
      actionKey: input.actionKey,
      contextHash: externalActionContextHash(input),
      previewHash,
      idempotencyKey: externalActionIdempotencyKey(input),
      state:
        blocker || previewBlocker || readinessBlocker || missingDependency
          ? "blocked"
          : "ready",
      attemptCount: 0,
      ...(blocker
        ? { blocker }
        : previewBlocker
          ? { blocker: previewBlocker }
          : readinessBlocker
            ? { blocker: readinessBlocker }
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
    input = snapshotExternalInput(input);
    this.assertProductionDirectActor(input);
    const recordId = externalActionRecordId(input);
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
    if (
      record.workflowId !== input.workflowId ||
      record.actionId !== input.actionId ||
      record.actionKey !== input.actionKey ||
      record.contextHash !== externalActionContextHash(input)
    ) {
      throw new ExternalExecutionError(
        "The external target or source context changed after preparation.",
        "stale_preview",
      );
    }
    const definition = this.definitions.get(input.actionKey);
    if (!definition) {
      throw new ExternalExecutionError("Unknown workflow action.", "blocked");
    }
    const freshBlocker = validateExternalInput(
      definition,
      input,
      this.options.allowFakeContracts === true,
    );
    if (freshBlocker) {
      throw new ExternalExecutionError(freshBlocker, "blocked");
    }
    const previewBlocker = validateRegistryPreview(
      input,
      this.options.registry ?? ACTION_REGISTRY_SEED,
    );
    if (previewBlocker) {
      throw new ExternalExecutionError(previewBlocker, "blocked");
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
    const actionBlocker = executor.validate?.(input);
    if (actionBlocker) {
      throw new ExternalExecutionError(actionBlocker, "blocked");
    }
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
      const receipt = parseExternalReceipt(
        await executor.execute(input),
        input.actionKey,
        false,
      );
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
    input = snapshotExternalInput(input);
    this.assertProductionDirectActor(input);
    const recordId = externalActionRecordId(input);
    const record = await this.store.get(recordId);
    if (!record || record.state !== "ambiguous") {
      throw new ExternalExecutionError(
        "Only an ambiguous action can reconcile.",
        "blocked",
      );
    }
    if (
      record.workflowId !== input.workflowId ||
      record.actionId !== input.actionId ||
      record.actionKey !== input.actionKey ||
      record.previewHash !== externalPreviewHash(input) ||
      record.contextHash !== externalActionContextHash(input)
    ) {
      throw new ExternalExecutionError(
        "Reconciliation input does not match the claimed preview.",
        "stale_preview",
      );
    }
    const definition = this.definitions.get(input.actionKey);
    if (!definition)
      throw new ExternalExecutionError("Unknown workflow action.", "blocked");
    const blocker =
      validateExternalReadiness(
        definition,
        input,
        this.options.allowFakeContracts === true,
      ) ??
      validateExternalAuthority(definition, input, externalPreviewHash(input), {
        readOnlyReconciliation: true,
      }) ??
      validateRegistryPreview(input, this.options.registry ?? ACTION_REGISTRY_SEED);
    if (blocker) throw new ExternalExecutionError(blocker, "blocked");
    const executor = this.executors.get(input.actionKey);
    if (!executor)
      throw new ExternalExecutionError("Provider adapter is unavailable.", "blocked");
    const actionBlocker = executor.validate?.(input);
    if (actionBlocker) throw new ExternalExecutionError(actionBlocker, "blocked");
    const rawReceipt = await executor.reconcile(input);
    if (!rawReceipt) return { status: "not_found" as const };
    const receipt = parseExternalReceipt(rawReceipt, input.actionKey, true);
    await this.store.finish(recordId, receipt);
    return { status: "succeeded" as const, receipt };
  }

  private assertProductionDirectActor(input: ExternalActionInput) {
    if (
      process.env.NODE_ENV === "production" &&
      input.authority?.actor.role !== "Vendor"
    ) {
      throw new ExternalExecutionError(
        "Internal production actors must use the S20 execution ledger.",
        "blocked",
      );
    }
  }

  private async findMissingDependency(
    dependencyKeys: readonly string[],
    workflowId: string,
    dependencyRecords: readonly ExternalExecutionRecord[],
  ) {
    for (const key of dependencyKeys) {
      const candidate = dependencyRecords.find(
        (record) => record.workflowId === workflowId && record.actionKey === key,
      );
      if (!candidate) return key;
      const persisted = await this.store.get(candidate.id);
      if (
        !persisted ||
        persisted.id !== candidate.id ||
        persisted.workflowId !== workflowId ||
        persisted.actionKey !== key ||
        persisted.attemptCount !== 1 ||
        (persisted.state !== "succeeded" && persisted.state !== "not_applicable") ||
        persisted.receipt?.actionKey !== key
      ) {
        return key;
      }
    }
    return undefined;
  }
}

function validateRegistryPreview(
  input: ExternalActionInput,
  registry: readonly CreateActionRegistryInput[],
) {
  const entry = registry.find((candidate) => candidate.key === input.actionKey);
  if (!entry) return "Action Registry entry is missing.";
  if (!entry.preview_payload_schema?.length) {
    return "Structured Action Registry preview schema is required.";
  }
  const validation = validatePreviewPayload(
    entry.preview_payload_schema.map((field) => ({
      ...field,
      required: field.required ?? false,
    })),
    input.values,
  );
  return validation.ok ? null : validation.errors.join(" ");
}

function snapshotExternalInput(input: ExternalActionInput): ExternalActionInput {
  const authority = input.authority
    ? Object.freeze({
        ...input.authority,
        actor: Object.freeze({ ...input.authority.actor }),
        technical: Object.freeze({ ...input.authority.technical }),
        ...(input.authority.approval
          ? { approval: Object.freeze({ ...input.authority.approval }) }
          : {}),
        ...(input.authority.communication
          ? { communication: Object.freeze({ ...input.authority.communication }) }
          : {}),
        ...(input.authority.vendor
          ? { vendor: Object.freeze({ ...input.authority.vendor }) }
          : {}),
      })
    : undefined;
  return Object.freeze({
    ...input,
    values: Object.freeze({ ...input.values }),
    sourceRefs: Object.freeze([...input.sourceRefs]),
    ...(authority ? { authority } : {}),
  });
}
