import type { Firestore } from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  classifyExecutionRisk,
  type AssignedTicketPhotoGates,
  type ExecutionRiskInput,
  type ExecutionTechnicalGates,
  type TrustedPublicationGates,
  type WorkflowCommunicationGates,
} from "@/lib/execution/risk-policy";
import type {
  ActionExecutionRecord,
  ExecutionBlockerCode,
  ExecutionClassification,
} from "@/lib/execution/types";
import {
  claimActionExecution,
  completeActionExecution,
  failActionExecution,
  getActionExecution,
  prepareActionExecutionRecord,
} from "@/lib/firestore/action-executions";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { createApprovalQueueItem } from "@/lib/firestore/approval-queue";
import {
  CreateActionRegistryInputSchema,
  type CreateActionRegistryInput,
} from "@/lib/firestore/schemas";
import { EditableLayerError } from "@/lib/firestore/errors";
import { assertActionExecutable } from "@/lib/integrations/action-gate";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { validatePreviewPayload } from "@/lib/integrations/preview-payload";

export interface TrustedExecutionContext {
  communication?: WorkflowCommunicationGates;
  connectionReady?: boolean;
  endpointDocumented?: boolean;
  localPreviewValidated?: boolean;
  permissionGranted?: boolean;
  publication?: TrustedPublicationGates;
  roleScopeAuthorized: boolean;
  sourceValidated: boolean;
  ticketPhoto?: AssignedTicketPhotoGates;
}

export interface ExecutionApprovalQueueContext {
  directLink: string;
  processRunRef: { id: string; label: string };
  /** Non-secret target/account projection shown to the approver. */
  reviewTarget?: string;
  requiredAdminUid: string;
}

export interface PrepareActionExecutionInput {
  actionKey: string;
  approvalQueue?: ExecutionApprovalQueueContext;
  contextHash?: string;
  idempotencyKey: string;
  /** Server-owned namespace used when uniqueness must span preparers. */
  idempotencyPrincipal?: string;
  preview: Record<string, unknown>;
  scopeRef?: string;
  trustedContext: TrustedExecutionContext;
}

export interface ExecutePreparedActionInput<T> {
  actor: AuthenticatedUser;
  contextHash?: string;
  db?: Firestore;
  executionId: string;
  executor: () => Promise<T>;
  preview: Record<string, unknown>;
  registry?: CreateActionRegistryInput[];
  resultCode: (result: T) => string;
  trustedContext: TrustedExecutionContext;
}

export class ExecutionBlockedError extends EditableLayerError {
  readonly code = "execution_blocked";

  constructor(readonly blockers: readonly ExecutionBlockerCode[]) {
    super(`Execution is blocked: ${blockers.join(", ")}.`, 409);
    this.name = "ExecutionBlockedError";
  }
}

export class DefinitiveExecutionError extends Error {
  constructor(
    readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = "DefinitiveExecutionError";
  }
}

export class AmbiguousExecutionError extends Error {
  constructor(
    readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = "AmbiguousExecutionError";
  }
}

/**
 * Prepare one bodyless, idempotent execution record. This is an internal server seam:
 * workflow-specific routes construct TrustedExecutionContext; browser JSON never does.
 */
export async function prepareActionExecution(
  actor: AuthenticatedUser,
  input: PrepareActionExecutionInput,
  options: {
    db?: Firestore;
    registry?: CreateActionRegistryInput[];
  } = {},
) {
  const db = options.db ?? getAdminFirestore();
  const registry = options.registry ?? ACTION_REGISTRY_SEED;
  const previewHash = hashExecutionPreview(input.preview);
  const classification = classifyForExecution(
    input.actionKey,
    input.preview,
    input.trustedContext,
    registry,
  );

  if (classification.risk === "High" && !validQueueContext(input.approvalQueue)) {
    throw new ExecutionBlockedError(["approval_route_missing"]);
  }
  assertUnblocked(classification);

  const record = await prepareActionExecutionRecord(
    actor,
    {
      classification,
      contextHash: input.contextHash,
      idempotencyKey: input.idempotencyKey,
      idempotencyPrincipal: input.idempotencyPrincipal,
      previewHash,
      scopeRef: input.scopeRef,
    },
    db,
  );

  if (record.risk === "High" && input.approvalQueue) {
    await createApprovalQueueItem(
      actor,
      {
        action_execution_id: record.id,
        action_execution_context_hash: record.context_hash,
        action_execution_preview_hash: record.preview_hash,
        action_execution_target: input.approvalQueue.reviewTarget,
        action_needed: `Approve and execute ${record.action_key}.`,
        affected_system_action: record.action_key,
        assignee_uid: actor.uid,
        audience_group: "Dan/Admin decisions",
        direct_link: input.approvalQueue.directLink,
        due_date: undefined,
        item_type: "ExternalActionReadiness",
        process_run_ref: input.approvalQueue.processRunRef,
        required_approver_uid: input.approvalQueue.requiredAdminUid,
        risk_signals: { external_write: true },
        source_trigger_key: `action_execution:${record.id}`,
      },
      db,
    );
  }

  return record;
}

/** Claim exactly once, then record a definitive success/failure or an ambiguous outcome. */
export async function executePreparedAction<T>(
  input: ExecutePreparedActionInput<T>,
): Promise<{ execution: ActionExecutionRecord; result?: T }> {
  const db = input.db ?? getAdminFirestore();
  const registry = input.registry ?? ACTION_REGISTRY_SEED;
  const current = await getActionExecution(input.actor, input.executionId, db);
  const previewHash = hashExecutionPreview(input.preview);
  const freshClassification = classifyForExecution(
    current.action_key,
    input.preview,
    input.trustedContext,
    registry,
  );
  assertUnblocked(freshClassification);

  if (
    freshClassification.risk !== current.risk ||
    freshClassification.kind !== current.action_kind
  ) {
    throw new ExecutionBlockedError(["source_validation_failed"]);
  }
  if (current.requires_action_registry) {
    assertActionExecutable(current.action_key, registry);
  }

  await claimActionExecution(input.actor, current.id, previewHash, db, input.contextHash);

  try {
    const result = await input.executor();
    const execution = await completeActionExecution(
      input.actor,
      current.id,
      { resultCode: input.resultCode(result) },
      db,
    );
    return { execution, result };
  } catch (error) {
    const definitive = error instanceof DefinitiveExecutionError;
    const errorCode =
      error instanceof DefinitiveExecutionError ||
      error instanceof AmbiguousExecutionError
        ? error.errorCode
        : "unknown_executor_error";
    const execution = await failActionExecution(
      input.actor,
      current.id,
      errorCode,
      !definitive,
      db,
    );
    return { execution };
  }
}

export function classifyForExecution(
  actionKey: string,
  preview: Record<string, unknown>,
  trustedContext: TrustedExecutionContext,
  registry: CreateActionRegistryInput[] = ACTION_REGISTRY_SEED,
) {
  const rawEntry = registry.find((candidate) => candidate.key === actionKey);
  const entry = rawEntry ? CreateActionRegistryInputSchema.parse(rawEntry) : undefined;
  const validation = entry?.preview_payload_schema
    ? validatePreviewPayload(entry.preview_payload_schema, preview)
    : { ok: trustedContext.localPreviewValidated === true, errors: [] };
  const technical: ExecutionTechnicalGates | undefined = entry
    ? {
        connectionReady: trustedContext.connectionReady === true,
        documentedEvidence: entry.evidence_status === "Documented",
        endpointDocumented:
          entry.evidence_status === "Documented" &&
          trustedContext.endpointDocumented === true,
        permissionGranted: trustedContext.permissionGranted === true,
        productionAllowed: entry.production_allowed === true,
        requiredValuesPresent: validation.ok,
        roleScopeAuthorized: trustedContext.roleScopeAuthorized,
        sourceValidated: trustedContext.sourceValidated,
      }
    : undefined;
  const riskInput: ExecutionRiskInput = {
    actionKey,
    communication: trustedContext.communication,
    publication: trustedContext.publication,
    technical,
    ticketPhoto: trustedContext.ticketPhoto,
  };
  const classification = classifyExecutionRisk(riskInput);

  if (!validation.ok) {
    return {
      ...classification,
      blockers: Array.from(
        new Set([...classification.blockers, "preview_invalid" as const]),
      ),
      risk: "Blocked" as const,
    };
  }

  return classification;
}

function assertUnblocked(
  classification: ExecutionClassification,
): asserts classification is ExecutionClassification & {
  kind: NonNullable<ExecutionClassification["kind"]>;
  risk: Exclude<ExecutionClassification["risk"], "Blocked">;
} {
  if (classification.risk === "Blocked" || !classification.kind) {
    throw new ExecutionBlockedError(classification.blockers);
  }
}

function validQueueContext(
  context: ExecutionApprovalQueueContext | undefined,
): context is ExecutionApprovalQueueContext {
  return Boolean(
    context?.directLink.trim() &&
    context.processRunRef.id.trim() &&
    context.processRunRef.label.trim() &&
    context.requiredAdminUid.trim(),
  );
}
