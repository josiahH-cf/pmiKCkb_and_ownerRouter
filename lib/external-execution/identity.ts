import { createHash } from "node:crypto";

import { requireExplicitDataMode } from "@/lib/data-mode";
import type { ExternalActionInput } from "@/lib/external-execution/types";

/**
 * The execution lane for an external action.
 *
 * S40 (AC-S40-1): an unclassified action previously resolved to "live", so an input constructed
 * without a lane was routed to the Live provider path. The lane must be explicit before anything
 * decides whether a real provider client may be built.
 */
export function externalActionDataMode(action: Pick<ExternalActionInput, "dataMode">) {
  return requireExplicitDataMode(action.dataMode);
}

/** Canonical identity shared by the S20 ledger and every provider idempotency key. */
export function externalActionIdempotencyKey(
  action: Pick<ExternalActionInput, "workflowId" | "actionId" | "actionKey" | "dataMode">,
) {
  return createHash("sha256")
    .update(
      `${externalActionDataMode(action)}\u0000${action.workflowId}\u0000${action.actionId}\u0000${action.actionKey}`,
    )
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
    | "dataMode"
  >,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        actionId: action.actionId,
        actionKey: action.actionKey,
        dataMode: externalActionDataMode(action),
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
  action: Pick<ExternalActionInput, "workflowId" | "actionId" | "actionKey" | "dataMode">,
) {
  return `external_${externalActionIdempotencyKey(action).slice(0, 48)}`;
}

/**
 * External actions are globally unique by workflow/action/action-key, not by the user who
 * happened to prepare them. This prevents two internal users from creating two provider attempts.
 */
export const EXTERNAL_ACTION_IDEMPOTENCY_PRINCIPAL = "external-action:v1";
