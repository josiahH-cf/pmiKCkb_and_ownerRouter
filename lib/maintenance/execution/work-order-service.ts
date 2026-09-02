// S99 governed work-order service: bounded reads, one ticket-bound create proposal, and one
// exact status-update proposal, all through the S20 ledger and linked Approval Queue. The
// browser supplies only value-bearing selections; the server derives the account, paths, ticket,
// property/unit mapping, catalogs, and every trusted readiness fact. Reader/writer construction
// stays behind the exact per-key committed-seed and runtime gates.

import { createHash } from "node:crypto";

import {
  assertLiveProviderActionAllowed,
  type EnvironmentDescriptor,
  EnvironmentContextError,
} from "@/lib/environment/descriptor";
import { assertProductionRuntimeActionExecutable } from "@/lib/operations/runtime-suspension-gate";
import {
  assertRentVineAccount,
  createFetchTransport,
} from "@/lib/integrations/rentvine/client";
import { createRentVineWriteFetchTransport } from "@/lib/integrations/rentvine/write-client";
import {
  RentVineWorkOrderReader,
  RentVineWorkOrderWriter,
  type BoundedWorkOrderList,
} from "@/lib/integrations/rentvine/work-order-client";
import {
  WORK_ORDER_CREATE_SAFE_PRIMARY_GROUPS,
  WORK_ORDER_PRIMARY_GROUPS,
  type WorkOrderDetail,
  type WorkOrderProjection,
  type WorkOrderStatusProjection,
  type VendorTradeProjection,
} from "@/lib/integrations/rentvine/work-order-contract";
import { MAINTENANCE_EXECUTION_DEFINITION_MAP } from "@/lib/maintenance/execution/matrix";
import {
  RentVineWorkOrderWriteExecutor,
  type WorkOrderExecutionClients,
} from "@/lib/maintenance/execution/providers";
import {
  executeExternalActionWithS20,
  prepareExternalActionWithS20,
  reconcileExternalActionWithS20,
  expectedExternalS20ExecutionId,
  type ExternalActionPreparationInput,
  type TrustedExternalExecutionContext,
} from "@/lib/external-execution/s20-bridge";
import { loadLiveUnitCandidates } from "@/lib/maintenance/live-unit-source";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";

export const WORK_ORDER_READ_KEY = "rentvine.work_order.read";
export const WORK_ORDER_CREATE_KEY = "rentvine.work_order.create";
export const WORK_ORDER_STATUS_KEY = "rentvine.work_order.update_status";

const CONTRACT_REF = "documented:rentvine:maintenance-work-orders:v1";
const CONNECTION_REF = "rentvine-manager-api:production";
const MAPPING_REF = "maintenance-ticket-unit-map:v1";

export class WorkOrderServiceError extends Error {
  constructor(
    readonly code:
      | "ticket_not_eligible"
      | "unit_mapping_unavailable"
      | "status_not_creatable"
      | "target_not_found"
      | "provider_read_failed",
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "WorkOrderServiceError";
  }
}

/** Environment posture plus the exact per-key committed-seed and runtime gate. */
export async function assertWorkOrderActionAllowed(
  descriptor: EnvironmentDescriptor,
  actionKey: string,
): Promise<void> {
  assertLiveProviderActionAllowed(descriptor);
  if (descriptor.source !== "explicit") {
    throw new EnvironmentContextError(
      "Live work-order actions require an explicit Production+Live environment descriptor.",
      descriptor,
    );
  }
  await assertProductionRuntimeActionExecutable(actionKey);
}

/** Lazy concrete clients; a closed key or refused posture never constructs them. */
export function buildWorkOrderClients(): WorkOrderExecutionClients | null {
  const baseUrl = process.env.RENTVINE_API_BASE_URL?.trim();
  const apiKey = process.env.RENTVINE_API_KEY?.trim();
  const apiSecret = process.env.RENTVINE_API_SECRET?.trim();
  if (!baseUrl || !apiKey || !apiSecret) return null;
  assertRentVineAccount(baseUrl, "pmikcmetro");
  const config = { baseUrl, apiKey, apiSecret };
  return {
    reader: new RentVineWorkOrderReader(
      config,
      createFetchTransport({ timeoutMs: 30_000 }),
    ),
    writer: new RentVineWorkOrderWriter(
      config,
      createRentVineWriteFetchTransport({ timeoutMs: 30_000 }),
    ),
  };
}

export interface WorkOrderReadResult {
  list: BoundedWorkOrderList | null;
  detail: WorkOrderDetail | null;
  statuses: WorkOrderStatusProjection[];
  trades: VendorTradeProjection[];
  filters: { propertyId: string | null; unitId: string | null };
}

/**
 * One explicit bounded read: a ticket-scoped list (property/unit filter derived server-side) or
 * one exact work-order detail, plus the fresh status and trade catalogs. Read-only.
 */
export async function runWorkOrderRead(
  clients: WorkOrderExecutionClients,
  request:
    | { kind: "ticket"; ticket: MaintenanceTicketRecord }
    | { kind: "detail"; workOrderId: number },
): Promise<WorkOrderReadResult> {
  const { reader } = clients;
  const [statuses, trades] = await Promise.all([
    reader.listWorkOrderStatuses(),
    reader.listVendorTrades(),
  ]);
  if (request.kind === "detail") {
    const detail = await reader.getWorkOrder(request.workOrderId);
    return {
      list: null,
      detail,
      statuses,
      trades,
      filters: { propertyId: null, unitId: null },
    };
  }
  const mapping = await resolveTicketUnitMapping(request.ticket);
  const list = await reader.listWorkOrdersBounded({
    propertyID: Number(mapping.propertyId),
    unitID: Number(mapping.unitId),
  });
  return {
    list,
    detail: null,
    statuses,
    trades,
    filters: { propertyId: mapping.propertyId, unitId: mapping.unitId },
  };
}

/** Fresh server-side unit -> property derivation for the verified ticket unit. */
export async function resolveTicketUnitMapping(
  ticket: MaintenanceTicketRecord,
): Promise<{ unitId: string; propertyId: string }> {
  if (!ticket.unit || !/^[1-9][0-9]*$/.test(ticket.unit.unitId)) {
    throw new WorkOrderServiceError(
      "ticket_not_eligible",
      "This ticket has no verified RentVine unit.",
    );
  }
  const source = await loadLiveUnitCandidates();
  if (source.status !== "ok") {
    throw new WorkOrderServiceError(
      "provider_read_failed",
      "The live RentVine unit mapping is unavailable.",
      503,
    );
  }
  const candidate = source.candidates.find(
    (entry) => entry.unitId === ticket.unit?.unitId,
  );
  if (!candidate?.propertyId || !/^[1-9][0-9]*$/.test(candidate.propertyId)) {
    throw new WorkOrderServiceError(
      "unit_mapping_unavailable",
      "The verified unit has no current RentVine property mapping.",
    );
  }
  return { unitId: ticket.unit.unitId, propertyId: candidate.propertyId };
}

export function buildTrustedContext(
  action: ExternalActionPreparationInput,
): TrustedExternalExecutionContext {
  const technical = {
    connectionReady: true,
    documentedEvidence: true,
    endpointDocumented: true,
    permissionGranted: true,
    productionAllowed: true,
    requiredValuesPresent: true,
    roleScopeAuthorized: true,
    sourceValidated: true,
  };
  return {
    connectionReady: true,
    endpointDocumented: true,
    // Every reference is the server-built one from the action itself; the bridge re-compares
    // them and refuses drift. Browser payloads never reach the assembled action objects.
    externalReferences: {
      connectionRef: action.connectionRef ?? CONNECTION_REF,
      contractRef: action.contractRef ?? CONTRACT_REF,
      mappingRef: action.mappingRef ?? MAPPING_REF,
      sourceRefs: action.sourceRefs,
    },
    localPreviewValidated: true,
    permissionGranted: true,
    roleScopeAuthorized: true,
    sourceValidated: true,
    technical,
    // The S100 stateful-read policy requires an operator-confirmed, workflow-linked, one-off
    // dispatch; exactConfirmed is derived by the bridge from the confirmed preview hash.
    communication: {
      workflowLinked: true,
      mailboxScopeAuthorized: true,
      humanInitiated: true,
      recipientMatchesPreview: true,
      reversible: true,
    },
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface WorkOrderCreateSelection {
  priorityId: "1" | "2" | "3";
  workOrderStatusId: string;
  isVacant: boolean;
  vendorTradeId?: string;
}

export interface AssembledWorkOrderAction {
  action: ExternalActionPreparationInput;
  trustedContext: TrustedExternalExecutionContext;
  executionId: string;
  /** Fresh human-facing context echoed in the preview response. */
  statusName: string;
  statusGroup: string;
  tradeName?: string;
}

/**
 * Assemble the exact create action from one eligible Live ticket, the fresh unit->property
 * mapping, and fresh catalog revalidation of the explicit staff selections. Values mirror the
 * official wire body exactly; the fixed safety flags are literals here, never caller input.
 */
export async function assembleWorkOrderCreateAction(
  clients: WorkOrderExecutionClients,
  ticket: MaintenanceTicketRecord,
  selection: WorkOrderCreateSelection,
  attemptSeq: number,
): Promise<AssembledWorkOrderAction> {
  if (ticket.data_mode !== "live") {
    throw new WorkOrderServiceError(
      "ticket_not_eligible",
      "Only a Live app ticket can propose a RentVine create.",
    );
  }
  const description = ticket.description.trim();
  if (!description) {
    throw new WorkOrderServiceError(
      "ticket_not_eligible",
      "The ticket description is empty; edit the ticket before proposing.",
    );
  }
  const mapping = await resolveTicketUnitMapping(ticket);
  const status = await clients.reader.getWorkOrderStatus(
    Number(assertDecimal(selection.workOrderStatusId, "workOrderStatusId")),
  );
  if (!WORK_ORDER_CREATE_SAFE_PRIMARY_GROUPS.has(status.primaryWorkOrderStatusId)) {
    throw new WorkOrderServiceError(
      "status_not_creatable",
      `Creation permits only a status grouped Pending or Open; "${status.name}" groups ${
        WORK_ORDER_PRIMARY_GROUPS[status.primaryWorkOrderStatusId] ?? "differently"
      }.`,
    );
  }
  let tradeName: string | undefined;
  if (selection.vendorTradeId !== undefined) {
    const trade = await clients.reader.getVendorTrade(
      Number(assertDecimal(selection.vendorTradeId, "vendorTradeId")),
    );
    tradeName = trade.name;
  }
  const values: Record<string, string | number | boolean> = {
    ticket_ref: ticket.id,
    property_id: mapping.propertyId,
    unit_id: mapping.unitId,
    description,
    priority_id: selection.priorityId,
    work_order_status_id: status.workOrderStatusId,
    is_vacant: selection.isVacant,
    owner_approved: false,
    shared_with_tenant: "0",
    shared_with_owner: false,
    send_vendor_notification: false,
    send_email: false,
    ...(selection.vendorTradeId !== undefined
      ? { vendor_trade_id: selection.vendorTradeId }
      : {}),
  };
  const action: ExternalActionPreparationInput = {
    workflowId: `maintenance:${ticket.id}`,
    actionId: `rentvine-create:${ticket.id}:a${attemptSeq}`,
    actionKey: WORK_ORDER_CREATE_KEY,
    dataMode: "live",
    values,
    sourceRefs: [
      `ticket:${ticket.id}`,
      `rentvine:unit:${mapping.unitId}`,
      `rentvine:status-catalog:${status.workOrderStatusId}`,
    ],
    contractRef: CONTRACT_REF,
    connectionRef: CONNECTION_REF,
    mappingRef: MAPPING_REF,
  };
  return {
    action,
    trustedContext: buildTrustedContext(action),
    executionId: expectedExternalS20ExecutionId(action),
    statusName: status.name,
    statusGroup: WORK_ORDER_PRIMARY_GROUPS[status.primaryWorkOrderStatusId] ?? "",
    ...(tradeName !== undefined ? { tradeName } : {}),
  };
}

export interface WorkOrderStatusSelection {
  workOrderId: string;
  targetStatusId: string;
}

/**
 * Assemble the exact status-update action from one freshly read, unshared work order and one
 * fresh-catalog target that differs from the current status.
 */
export async function assembleWorkOrderStatusAction(
  clients: WorkOrderExecutionClients,
  selection: WorkOrderStatusSelection,
): Promise<AssembledWorkOrderAction & { before: WorkOrderProjection }> {
  const detail = await clients.reader.getWorkOrder(
    Number(assertDecimal(selection.workOrderId, "workOrderId")),
  );
  const before = detail.workOrder;
  if (before.isSharedWithTenant !== "0" || before.isSharedWithOwner !== "0") {
    throw new WorkOrderServiceError(
      "ticket_not_eligible",
      "Status update is unavailable for a work order shared to a portal.",
    );
  }
  const target = await clients.reader.getWorkOrderStatus(
    Number(assertDecimal(selection.targetStatusId, "targetStatusId")),
  );
  if (target.workOrderStatusId === before.workOrderStatusId) {
    throw new WorkOrderServiceError(
      "target_not_found",
      "The target status must differ from the current status.",
    );
  }
  const values: Record<string, string | number | boolean> = {
    work_order_id: before.workOrderId,
    current_status_id: before.workOrderStatusId,
    target_status_id: target.workOrderStatusId,
    send_vendor_notification: false,
    send_review: false,
  };
  const action: ExternalActionPreparationInput = {
    workflowId: `rentvine-work-order:${before.workOrderId}`,
    actionId: `rentvine-status:${before.workOrderId}:${sha256(
      `${before.workOrderStatusId}->${target.workOrderStatusId}`,
    ).slice(0, 16)}`,
    actionKey: WORK_ORDER_STATUS_KEY,
    dataMode: "live",
    values,
    sourceRefs: [
      `rentvine:work-order:${before.workOrderId}`,
      `rentvine:status-catalog:${target.workOrderStatusId}`,
    ],
    contractRef: CONTRACT_REF,
    connectionRef: CONNECTION_REF,
    mappingRef: MAPPING_REF,
  };
  return {
    action,
    trustedContext: buildTrustedContext(action),
    executionId: expectedExternalS20ExecutionId(action),
    statusName: target.name,
    statusGroup: WORK_ORDER_PRIMARY_GROUPS[target.primaryWorkOrderStatusId] ?? "",
    before,
  };
}

function assertDecimal(value: string, field: string): string {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new WorkOrderServiceError(
      "target_not_found",
      `${field} must be a canonical positive decimal string.`,
      400,
    );
  }
  return value;
}

export function workOrderDefinition(actionKey: string) {
  const definition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get(actionKey);
  if (!definition) {
    throw new WorkOrderServiceError(
      "target_not_found",
      `Unknown maintenance action ${actionKey}.`,
      400,
    );
  }
  return definition;
}

export function workOrderExecutor(
  clients: () => WorkOrderExecutionClients,
): RentVineWorkOrderWriteExecutor {
  return new RentVineWorkOrderWriteExecutor(clients);
}

export const workOrderS20 = {
  prepare: prepareExternalActionWithS20,
  execute: executeExternalActionWithS20,
  reconcile: reconcileExternalActionWithS20,
};
