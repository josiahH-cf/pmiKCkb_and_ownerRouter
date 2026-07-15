import { createHash } from "node:crypto";

import type { ExternalActionInput } from "@/lib/external-execution/types";

/** Canonical identity shared by the S20 ledger and every provider idempotency key. */
export function externalActionIdempotencyKey(
  action: Pick<ExternalActionInput, "workflowId" | "actionId" | "actionKey">,
) {
  return createHash("sha256")
    .update(`${action.workflowId}\u0000${action.actionId}\u0000${action.actionKey}`)
    .digest("hex");
}

export function externalActionContextHash(
  action: Pick<
    ExternalActionInput,
    | "workflowId"
    | "actionId"
    | "actionKey"
    | "connectionRef"
    | "contractRef"
    | "mappingRef"
    | "sourceRefs"
  >,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        actionId: action.actionId,
        actionKey: action.actionKey,
        connectionRef: action.connectionRef,
        contractRef: action.contractRef,
        mappingRef: action.mappingRef,
        sourceRefs: [...action.sourceRefs].sort(),
        workflowId: action.workflowId,
      }),
    )
    .digest("hex");
}

export function externalActionRecordId(
  action: Pick<ExternalActionInput, "workflowId" | "actionId" | "actionKey">,
) {
  return `external_${externalActionIdempotencyKey(action).slice(0, 48)}`;
}

/**
 * External actions are globally unique by workflow/action/action-key, not by the user who
 * happened to prepare them. This prevents two internal users from creating two provider attempts.
 */
export const EXTERNAL_ACTION_IDEMPOTENCY_PRINCIPAL = "external-action:v1";
