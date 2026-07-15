import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { ExecutionTechnicalGates } from "@/lib/execution/risk-policy";
import {
  AmbiguousExecutionError,
  DefinitiveExecutionError,
  ExecutionBlockedError,
  executePreparedAction,
  prepareActionExecution,
  type ExecutionApprovalQueueContext,
  type TrustedExecutionContext,
} from "@/lib/execution/service";
import {
  EXECUTION_ACTION_POLICIES,
  hasExecutionActionPolicy,
} from "@/lib/execution/risk-policy";
import type {
  ExternalActionDefinition,
  ExternalActionInput,
  ExternalAuthorityContext,
  ExternalExecutor,
} from "@/lib/external-execution/types";
import { ExternalExecutionError } from "@/lib/external-execution/types";
import { validateExternalAuthority } from "@/lib/external-execution/authority";
import {
  EXTERNAL_ACTION_IDEMPOTENCY_PRINCIPAL,
  externalActionContextHash,
  externalActionIdempotencyKey,
} from "@/lib/external-execution/identity";
import { parseExternalReceipt } from "@/lib/external-execution/receipt";
import { validateExternalReadiness } from "@/lib/external-execution/orchestrator";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  getActionExecution,
  resolveActionReconciliation,
} from "@/lib/firestore/action-executions";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { LEASE_EXECUTION_DEFINITIONS } from "@/lib/lease-renewal/execution/matrix";
import { MAINTENANCE_EXECUTION_DEFINITIONS } from "@/lib/maintenance/execution/matrix";

const CANONICAL_EXTERNAL_DEFINITIONS: readonly Readonly<ExternalActionDefinition>[] =
  Object.freeze(
    [...LEASE_EXECUTION_DEFINITIONS, ...MAINTENANCE_EXECUTION_DEFINITIONS].map(
      (definition) =>
        Object.freeze({
          ...definition,
          dependsOn: Object.freeze([...definition.dependsOn]),
        }),
    ),
  );

/**
 * Authority-free projection of the S25/S26 action input. A route may parse the value-bearing
 * fields from JSON, but execution authority and trusted readiness facts stay separate and
 * server-constructed.
 */
export type ExternalActionPreparationInput = Readonly<
  Omit<ExternalActionInput, "authority">
> & {
  readonly authority?: never;
};

export interface TrustedExternalExecutionContext extends TrustedExecutionContext {
  /** Exact server-derived readiness facts; no value is inferred inside the bridge. */
  readonly technical: ExecutionTechnicalGates;
  /** Exact server-resolved refs; browser-provided aliases cannot establish readiness. */
  readonly externalReferences: {
    readonly connectionRef: string;
    readonly contractRef: string;
    readonly mappingRef: string;
    readonly sourceRefs: readonly string[];
  };
  /** Optional S22 facts for an internal Admin supporting an assigned Vendor ticket. */
  readonly vendor?: ExternalAuthorityContext["vendor"];
}

export interface PrepareExternalActionWithS20Input {
  readonly action: ExternalActionPreparationInput;
  readonly approvalQueue?: ExecutionApprovalQueueContext;
  readonly definition: Readonly<ExternalActionDefinition>;
  readonly trustedContext: TrustedExternalExecutionContext;
  /** Required pure action-specific validation; it cannot call or mutate a provider. */
  readonly validate: NonNullable<ExternalExecutor["validate"]>;
}

export interface ExecuteExternalActionWithS20Input {
  readonly action: ExternalActionPreparationInput;
  /** Required for Medium actions; must be the exact current S20 preview hash. */
  readonly confirmedPreviewHash?: string;
  readonly definition: Readonly<ExternalActionDefinition>;
  /** Server-loaded S20 execution ids keyed by the immutable dependency action key. */
  readonly dependencyExecutionIds?: Readonly<Record<string, string>>;
  readonly executionId: string;
  readonly executor: ExternalExecutor;
  readonly trustedContext: TrustedExternalExecutionContext;
}

export type ReconcileExternalActionWithS20Input = Omit<
  ExecuteExternalActionWithS20Input,
  "dependencyExecutionIds"
>;

export interface ExternalS20BridgeOptions {
  /** Test-only escape hatch for invented provider/source aliases. */
  readonly allowSyntheticAliases?: boolean;
  readonly db?: Firestore;
  /** Server-owned test seam; production callers omit this and use the committed Registry. */
  readonly registry?: CreateActionRegistryInput[];
}

/**
 * Prepare an S25/S26 external action in the S20 ledger and linked Approval Queue only.
 * This seam does not accept an executor and cannot call a provider.
 */
export async function prepareExternalActionWithS20(
  actor: AuthenticatedUser,
  request: PrepareExternalActionWithS20Input,
  options: ExternalS20BridgeOptions = {},
) {
  assertTestOnlyOptions(options);
  const action = snapshotExternalAction(request.action);
  const trustedContext = snapshotTrustedExternalContext(request.trustedContext);
  assertAuthorityFree(action);
  assertSyntheticAliasesAreTestOnly(action, options.allowSyntheticAliases);
  assertStableExternalIdentity(request.definition, action);
  const definition = resolveCanonicalExternalDefinition(request.definition);
  assertDefinitionRiskMatchesServerPolicy(definition);
  assertTrustedExternalReferences(action, trustedContext);
  assertExternalPreparationReadiness(
    definition,
    action,
    trustedContext,
    options.allowSyntheticAliases === true,
    request.validate,
  );

  // External values are primitives by contract. Copy and freeze them so schema validation,
  // the ledger hash, and the Approval Queue all bind to one exact preview snapshot.
  const preview: Record<string, unknown> = { ...action.values };
  Object.freeze(preview);

  return prepareActionExecution(
    actor,
    {
      actionKey: action.actionKey,
      approvalQueue: request.approvalQueue
        ? {
            ...request.approvalQueue,
            reviewTarget: externalReviewTarget(action),
          }
        : undefined,
      contextHash: externalContextHash(action),
      idempotencyKey: externalActionIdempotencyKey(action),
      idempotencyPrincipal: EXTERNAL_ACTION_IDEMPOTENCY_PRINCIPAL,
      preview,
      scopeRef: `external-workflow:${action.workflowId}`,
      trustedContext,
    },
    {
      db: options.db,
      registry: options.registry,
    },
  );
}

/**
 * Production-capable external execution seam. The S20 record—not an in-memory authority object—owns
 * approval, exact preview, Registry readiness, actor/scope, and the one atomic provider claim.
 */
export async function executeExternalActionWithS20(
  actor: AuthenticatedUser,
  request: ExecuteExternalActionWithS20Input,
  options: ExternalS20BridgeOptions = {},
) {
  assertTestOnlyOptions(options);
  const action = snapshotExternalAction(request.action);
  const trustedContext = snapshotTrustedExternalContext(request.trustedContext);
  assertAuthorityFree(action);
  assertSyntheticAliasesAreTestOnly(action, options.allowSyntheticAliases);
  assertStableExternalIdentity(request.definition, action);
  const definition = resolveCanonicalExternalDefinition(request.definition);
  assertDefinitionRiskMatchesServerPolicy(definition);
  assertTrustedExternalReferences(action, trustedContext);
  await assertExternalDependencies(
    actor,
    definition,
    action,
    request.dependencyExecutionIds ?? {},
    options.db,
  );

  const db = options.db;
  const current = await getActionExecution(actor, request.executionId, db);
  if (request.executionId !== expectedExternalS20ExecutionId(action)) {
    throw new EditableLayerError(
      "The S20 execution id does not match this external action identity.",
      409,
    );
  }
  assertS20RecordMatchesAction(current, action);
  if (
    current.risk === "Medium" &&
    request.confirmedPreviewHash !== current.preview_hash
  ) {
    throw new EditableLayerError(
      "Medium external execution requires exact confirmation of the current preview.",
      409,
    );
  }
  const providerInput = buildProviderInput(
    actor,
    action,
    trustedContext,
    current.approval,
    current.risk === "Medium" ? request.confirmedPreviewHash : undefined,
  );
  assertExternalProviderInput(
    definition,
    providerInput,
    request.executor,
    options.allowSyntheticAliases === true,
    false,
  );

  return executePreparedAction({
    actor,
    ...(db ? { db } : {}),
    executionId: request.executionId,
    contextHash: externalContextHash(action),
    executor: async () => {
      try {
        const receipt = parseExternalReceipt(
          await request.executor.execute(providerInput),
          action.actionKey,
          false,
        );
        if (receipt.actionKey !== action.actionKey) {
          throw new AmbiguousExecutionError(
            "provider_receipt_action_mismatch",
            "The provider receipt did not match the S20-claimed action.",
          );
        }
        return receipt;
      } catch (error) {
        if (error instanceof DefinitiveExecutionError) throw error;
        if (error instanceof AmbiguousExecutionError) throw error;
        if (error instanceof ExternalExecutionError && error.code === "provider") {
          throw new DefinitiveExecutionError(
            "provider_refused",
            "The provider definitively refused the action.",
          );
        }
        throw new AmbiguousExecutionError(
          "provider_outcome_ambiguous",
          "The provider outcome requires reconciliation before any new attempt.",
        );
      }
    },
    preview: { ...action.values },
    ...(options.registry ? { registry: options.registry } : {}),
    resultCode: externalReceiptResultCode,
    trustedContext,
  });
}

/** Read-only provider reconciliation for an already consumed ambiguous S20 attempt. */
export async function reconcileExternalActionWithS20(
  actor: AuthenticatedUser,
  request: ReconcileExternalActionWithS20Input,
  options: ExternalS20BridgeOptions = {},
) {
  assertTestOnlyOptions(options);
  const action = snapshotExternalAction(request.action);
  const trustedContext = snapshotTrustedExternalContext(request.trustedContext);
  assertAuthorityFree(action);
  assertSyntheticAliasesAreTestOnly(action, options.allowSyntheticAliases);
  assertStableExternalIdentity(request.definition, action);
  const definition = resolveCanonicalExternalDefinition(request.definition);
  assertDefinitionRiskMatchesServerPolicy(definition);
  assertTrustedExternalReferences(action, trustedContext);
  const current = await getActionExecution(actor, request.executionId, options.db);
  if (request.executionId !== expectedExternalS20ExecutionId(action)) {
    throw new EditableLayerError(
      "The S20 execution id does not match this external action identity.",
      409,
    );
  }

  assertS20RecordMatchesAction(current, action);
  if (current.state === "Succeeded" && current.attempt_count === 1) {
    return { status: "succeeded" as const, duplicate: true, execution: current };
  }
  if (current.state !== "Needs reconciliation" || current.attempt_count !== 1) {
    throw new EditableLayerError(
      "Only a one-attempt ambiguous S20 execution can be reconciled.",
      409,
    );
  }

  const providerInput = buildProviderInput(
    actor,
    action,
    trustedContext,
    current.approval,
    current.risk === "Medium" ? current.preview_hash : undefined,
  );
  assertExternalProviderInput(
    definition,
    providerInput,
    request.executor,
    options.allowSyntheticAliases === true,
    true,
  );

  const rawReceipt = await request.executor.reconcile(providerInput);
  if (!rawReceipt) {
    return { status: "not_found" as const, duplicate: false, execution: current };
  }
  const receipt = parseExternalReceipt(rawReceipt, action.actionKey, true);
  const execution = await resolveActionReconciliation(
    actor,
    request.executionId,
    { resultCode: externalReceiptResultCode(receipt) },
    options.db,
  );
  return {
    status: "succeeded" as const,
    duplicate: false,
    execution,
    receipt,
  };
}

function assertTestOnlyOptions(options: ExternalS20BridgeOptions) {
  if (
    process.env.NODE_ENV !== "test" &&
    (options.allowSyntheticAliases === true || options.registry !== undefined)
  ) {
    throw new Error(
      "External-action Registry overrides and synthetic aliases are test-only.",
    );
  }
}

function assertAuthorityFree(action: ExternalActionPreparationInput) {
  if (Object.prototype.hasOwnProperty.call(action, "authority")) {
    throw new EditableLayerError(
      "External action authority is server-owned and cannot be supplied by browser JSON.",
      400,
    );
  }
}

function assertTrustedExternalReferences(
  action: ExternalActionPreparationInput,
  context: TrustedExternalExecutionContext,
) {
  const trusted = context.externalReferences;
  if (
    action.contractRef !== trusted.contractRef ||
    action.connectionRef !== trusted.connectionRef ||
    action.mappingRef !== trusted.mappingRef ||
    !sameExactSet(action.sourceRefs, trusted.sourceRefs)
  ) {
    throw new ExecutionBlockedError(["source_validation_failed"]);
  }
}

async function assertExternalDependencies(
  actor: AuthenticatedUser,
  definition: Readonly<ExternalActionDefinition>,
  action: ExternalActionPreparationInput,
  executionIds: Readonly<Record<string, string>>,
  db: Firestore | undefined,
) {
  for (const key of definition.dependsOn) {
    const executionId = executionIds[key];
    if (!executionId) throw new ExecutionBlockedError(["source_validation_failed"]);
    const dependency = await getActionExecution(actor, executionId, db);
    if (
      dependency.action_key !== key ||
      dependency.scope_ref !== `external-workflow:${action.workflowId}` ||
      dependency.state !== "Succeeded" ||
      dependency.attempt_count !== 1 ||
      !dependency.result_code
    ) {
      throw new ExecutionBlockedError(["source_validation_failed"]);
    }
  }
}

function sameExactSet(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((value) => right.includes(value))
  );
}

function hashExternalValues(action: ExternalActionPreparationInput) {
  return hashExecutionPreview({ ...action.values });
}

function expectedExternalS20ExecutionId(action: ExternalActionPreparationInput) {
  const idempotencyHash = createHash("sha256")
    .update(
      `${EXTERNAL_ACTION_IDEMPOTENCY_PRINCIPAL}\u0000${action.actionKey}\u0000${externalActionIdempotencyKey(action)}`,
    )
    .digest("hex");
  return `exec_${idempotencyHash.slice(0, 40)}`;
}

function assertS20RecordMatchesAction(
  current: Awaited<ReturnType<typeof getActionExecution>>,
  action: ExternalActionPreparationInput,
) {
  if (
    current.action_key !== action.actionKey ||
    current.scope_ref !== `external-workflow:${action.workflowId}` ||
    current.preview_hash !== hashExternalValues(action) ||
    current.context_hash !== externalContextHash(action)
  ) {
    throw new EditableLayerError(
      "The S20 execution record does not match this exact external action.",
      409,
    );
  }
}

function buildProviderInput(
  actor: AuthenticatedUser,
  action: ExternalActionPreparationInput,
  context: TrustedExternalExecutionContext,
  approval: ExternalAuthorityContext["approval"],
  exactConfirmationHash: string | undefined,
): ExternalActionInput {
  return {
    ...action,
    authority: {
      actor: { role: actor.role, uid: actor.uid },
      ...(approval ? { approval } : {}),
      ...(exactConfirmationHash ? { exactConfirmationHash } : {}),
      roleScopeAuthorized: context.roleScopeAuthorized,
      technical: {
        ...context.technical,
        roleScopeAuthorized: context.roleScopeAuthorized,
      },
      ...(context.communication ? { communication: context.communication } : {}),
      ...(context.vendor ? { vendor: context.vendor } : {}),
    },
  };
}

function assertExternalPreparationReadiness(
  definition: Readonly<ExternalActionDefinition>,
  action: ExternalActionPreparationInput,
  context: TrustedExternalExecutionContext,
  allowSyntheticAliases: boolean,
  validate: NonNullable<ExternalExecutor["validate"]>,
) {
  const input = buildProviderInput(
    { role: "Editor", uid: "preparation-only" } as AuthenticatedUser,
    action,
    context,
    undefined,
    undefined,
  );
  const blocker =
    validateExternalReadiness(definition, input, allowSyntheticAliases) ??
    validate(input);
  if (blocker) throw new EditableLayerError(blocker, 409);
}

function snapshotExternalAction(
  action: ExternalActionPreparationInput,
): ExternalActionPreparationInput {
  const values = Object.freeze({ ...action.values });
  const sourceRefs = Object.freeze([...action.sourceRefs]);
  return Object.freeze({ ...action, sourceRefs, values });
}

function snapshotTrustedExternalContext(
  context: TrustedExternalExecutionContext,
): TrustedExternalExecutionContext {
  const externalReferences = Object.freeze({
    ...context.externalReferences,
    sourceRefs: Object.freeze([...context.externalReferences.sourceRefs]),
  });
  return Object.freeze({
    ...context,
    externalReferences,
    technical: Object.freeze({ ...context.technical }),
    ...(context.communication
      ? { communication: Object.freeze({ ...context.communication }) }
      : {}),
    ...(context.publication
      ? { publication: Object.freeze({ ...context.publication }) }
      : {}),
    ...(context.ticketPhoto
      ? { ticketPhoto: Object.freeze({ ...context.ticketPhoto }) }
      : {}),
    ...(context.vendor ? { vendor: Object.freeze({ ...context.vendor }) } : {}),
  });
}

function assertExternalProviderInput(
  definition: Readonly<ExternalActionDefinition>,
  input: ExternalActionInput,
  executor: ExternalExecutor,
  allowSyntheticAliases: boolean,
  readOnlyReconciliation: boolean,
) {
  const readinessBlocker = validateExternalReadiness(
    definition,
    input,
    allowSyntheticAliases,
  );
  const authorityBlocker = validateExternalAuthority(
    definition,
    input,
    hashExecutionPreview({ ...input.values }),
    { readOnlyReconciliation },
  );
  const providerBlocker = executor.validate?.(input);
  const blocker = readinessBlocker ?? authorityBlocker ?? providerBlocker;
  if (blocker) throw new EditableLayerError(blocker, 409);
}

function externalReceiptResultCode(receipt: {
  actionKey: string;
  outcome?: "succeeded" | "not_applicable";
  providerRef: string;
  resultHash: string;
}) {
  return `external_receipt:${createHash("sha256")
    .update(
      `${receipt.actionKey}\u0000${receipt.providerRef}\u0000${receipt.resultHash}\u0000${receipt.outcome ?? "succeeded"}`,
    )
    .digest("hex")}`;
}

function externalContextHash(action: ExternalActionPreparationInput) {
  return externalActionContextHash(action);
}

function externalReviewTarget(action: ExternalActionPreparationInput) {
  return [
    `workflow=${action.workflowId}`,
    `connection=${action.connectionRef}`,
    `mapping=${action.mappingRef}`,
    `contract=${action.contractRef}`,
    `sources=${[...action.sourceRefs].sort().join(",")}`,
  ].join("; ");
}

function assertStableExternalIdentity(
  definition: Readonly<ExternalActionDefinition>,
  action: ExternalActionPreparationInput,
) {
  if (definition.key !== action.actionKey) {
    throw new EditableLayerError(
      "Action key does not match the immutable workflow definition.",
      409,
    );
  }
  if (!stableIdentifier(action.workflowId) || !stableIdentifier(action.actionId)) {
    throw new EditableLayerError(
      "External workflow and action identifiers are required.",
      400,
    );
  }
  if (
    !action.contractRef ||
    !stableIdentifier(action.contractRef) ||
    !action.connectionRef ||
    !stableIdentifier(action.connectionRef) ||
    !action.mappingRef ||
    !stableIdentifier(action.mappingRef)
  ) {
    throw new ExecutionBlockedError(["source_validation_failed"]);
  }
  if (
    action.sourceRefs.length === 0 ||
    action.sourceRefs.some((sourceRef) => !stableIdentifier(sourceRef))
  ) {
    throw new ExecutionBlockedError(["source_validation_failed"]);
  }
}

function assertDefinitionRiskMatchesServerPolicy(
  definition: Readonly<ExternalActionDefinition>,
) {
  if (!hasExecutionActionPolicy(definition.key)) {
    throw new ExecutionBlockedError(["action_unknown"]);
  }
  if (EXECUTION_ACTION_POLICIES[definition.key].defaultRisk !== definition.risk) {
    throw new ExecutionBlockedError(["source_validation_failed"]);
  }
}

/**
 * Route input may identify an action but cannot define its workflow graph. Shared action keys
 * (currently gmail.thread.reply) are accepted only when every immutable field matches one exact
 * committed lane definition; downstream checks always receive that committed object.
 */
function resolveCanonicalExternalDefinition(
  supplied: Readonly<ExternalActionDefinition>,
): Readonly<ExternalActionDefinition> {
  const candidates = CANONICAL_EXTERNAL_DEFINITIONS.filter(
    (candidate) => candidate.key === supplied.key,
  );
  if (candidates.length === 0) {
    throw new ExecutionBlockedError(["action_unknown"]);
  }
  const canonical = candidates.find((candidate) =>
    sameImmutableDefinition(candidate, supplied),
  );
  if (!canonical) {
    throw new ExecutionBlockedError(["source_validation_failed"]);
  }
  return canonical;
}

function sameImmutableDefinition(
  canonical: Readonly<ExternalActionDefinition>,
  supplied: Readonly<ExternalActionDefinition>,
) {
  return (
    canonical.key === supplied.key &&
    canonical.group === supplied.group &&
    canonical.risk === supplied.risk &&
    canonical.correction === supplied.correction &&
    canonical.requiredContract === supplied.requiredContract &&
    canonical.dependsOn.length === supplied.dependsOn.length &&
    canonical.dependsOn.every((key, index) => key === supplied.dependsOn[index])
  );
}

function assertSyntheticAliasesAreTestOnly(
  action: ExternalActionPreparationInput,
  allowSyntheticAliases = false,
) {
  const references = [
    action.workflowId,
    action.actionId,
    action.contractRef,
    action.connectionRef,
    action.mappingRef,
    ...action.sourceRefs,
  ];
  const containsSyntheticAlias = references.some(
    (reference) =>
      typeof reference === "string" &&
      /(?:^|:)(?:fake|synthetic)(?:[:_-]|$)/i.test(reference),
  );

  if (containsSyntheticAlias && !allowSyntheticAliases) {
    throw new EditableLayerError(
      "Synthetic external-action aliases are restricted to the test harness.",
      400,
    );
  }
}

function stableIdentifier(value: string) {
  return value.length <= 500 && value === value.trim() && value.length > 0;
}
