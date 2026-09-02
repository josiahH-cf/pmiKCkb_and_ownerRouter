import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  EnvironmentContextError,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import {
  ActionNotExecutableError,
  ActionRuntimeSuspendedError,
} from "@/lib/operations/runtime-suspension-gate";
import { getMaintenanceTicket } from "@/lib/firestore/maintenance-tickets";
import { getActionExecution } from "@/lib/firestore/action-executions";
import {
  claimMaintenanceWorkOrderLink,
  getMaintenanceWorkOrderLink,
  projectMaintenanceWorkOrderOutcome,
} from "@/lib/firestore/maintenance-work-order-links";
import {
  loadPreparedWorkOrderAction,
  preparedActionInput,
  savePreparedWorkOrderAction,
} from "@/lib/firestore/maintenance-work-order-prepared-actions";
import {
  WORK_ORDER_CREATE_KEY,
  WORK_ORDER_READ_KEY,
  WORK_ORDER_STATUS_KEY,
  WorkOrderServiceError,
  buildTrustedContext,
  assembleWorkOrderCreateAction,
  assembleWorkOrderStatusAction,
  assertWorkOrderActionAllowed,
  buildWorkOrderClients,
  runWorkOrderRead,
  workOrderDefinition,
  workOrderExecutor,
  workOrderS20,
} from "@/lib/maintenance/execution/work-order-service";

const DecimalId = z.string().regex(/^[1-9][0-9]*$/);

const BodySchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("read"),
      ticketId: z.string().trim().min(1).max(200).optional(),
      workOrderId: DecimalId.optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("propose_create"),
      ticketId: z.string().trim().min(1).max(200),
      priorityId: z.enum(["1", "2", "3"]),
      workOrderStatusId: DecimalId,
      isVacant: z.boolean(),
      vendorTradeId: DecimalId.optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("propose_status"),
      workOrderId: DecimalId,
      targetStatusId: DecimalId,
    })
    .strict(),
  z
    .object({
      operation: z.literal("execute"),
      executionId: z.string().trim().min(1).max(300),
    })
    .strict(),
  z
    .object({
      operation: z.literal("reconcile"),
      executionId: z.string().trim().min(1).max(300),
    })
    .strict(),
  z
    .object({
      operation: z.literal("link_status"),
      ticketId: z.string().trim().min(1).max(200),
    })
    .strict(),
]);

function notConfigured() {
  return NextResponse.json({ status: "not_configured" }, { status: 503 });
}

/**
 * One governed S99 surface. Reads are explicit, bounded, and gated by the exact read key;
 * create/status proposals assemble server-derived previews into the S20 ledger and linked
 * Approval Queue; execution consumes the exact approved S20 record through the official-contract
 * executor with at most one provider POST. No Vendor assignment, share, chat, file, DELETE, or
 * notification is reachable here.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request, BodySchema);
    const descriptor = requireEnvironmentDescriptor();

    if (body.operation === "link_status") {
      const user = await requireCapabilityInSpace("read", "maintenance");
      const link = await getMaintenanceWorkOrderLink(user, body.ticketId);
      return NextResponse.json({ status: "ok", link });
    }

    if (body.operation === "read") {
      const user = await requireCapabilityInSpace("read", "maintenance");
      void user;
      await assertWorkOrderActionAllowed(descriptor, WORK_ORDER_READ_KEY);
      const clients = buildWorkOrderClients();
      if (!clients) return notConfigured();
      if (body.workOrderId !== undefined) {
        const result = await runWorkOrderRead(clients, {
          kind: "detail",
          workOrderId: Number(body.workOrderId),
        });
        return NextResponse.json({ status: "ok", ...serializeRead(result) });
      }
      if (!body.ticketId) {
        return NextResponse.json(
          {
            error: "Provide a ticketId or an exact workOrderId.",
            error_type: "bad_request",
          },
          { status: 400 },
        );
      }
      const ticket = await requireTicket(user, body.ticketId);
      const result = await runWorkOrderRead(clients, { kind: "ticket", ticket });
      return NextResponse.json({ status: "ok", ...serializeRead(result) });
    }

    if (body.operation === "propose_create") {
      const user = await requireCapabilityInSpace("edit", "maintenance");
      await assertWorkOrderActionAllowed(descriptor, WORK_ORDER_READ_KEY);
      const clients = buildWorkOrderClients();
      if (!clients) return notConfigured();
      const ticket = await requireTicket(user, body.ticketId);
      const existing = await getMaintenanceWorkOrderLink(user, ticket.id);
      if (existing && existing.state !== "failed") {
        return NextResponse.json(
          {
            error:
              "This ticket already has a live RentVine create attempt; finish or reconcile it first.",
            error_type: "create_already_live",
            link: existing,
          },
          { status: 409 },
        );
      }
      const attemptSeq = existing ? existing.attempt_seq + 1 : 0;
      const assembled = await assembleWorkOrderCreateAction(
        clients,
        ticket,
        {
          priorityId: body.priorityId,
          workOrderStatusId: body.workOrderStatusId,
          isVacant: body.isVacant,
          ...(body.vendorTradeId !== undefined
            ? { vendorTradeId: body.vendorTradeId }
            : {}),
        },
        attemptSeq,
      );
      const record = await workOrderS20.prepare(user, {
        action: assembled.action,
        approvalQueue: {
          directLink: `/maintenance?ticket_id=${encodeURIComponent(ticket.id)}`,
          processRunRef: {
            id: assembled.action.workflowId,
            label: "RentVine work-order create",
          },
          requiredAdminUid: user.uid,
        },
        definition: workOrderDefinition(WORK_ORDER_CREATE_KEY),
        trustedContext: assembled.trustedContext,
        validate: (input) => workOrderExecutor(() => clients).validate(input),
      });
      await savePreparedWorkOrderAction(user, {
        execution_id: record.id,
        ticket_ref: ticket.id,
        action: {
          workflowId: assembled.action.workflowId,
          actionId: assembled.action.actionId,
          actionKey: WORK_ORDER_CREATE_KEY,
          dataMode: "live",
          values: { ...assembled.action.values },
          sourceRefs: [...assembled.action.sourceRefs],
          contractRef: assembled.action.contractRef!,
          connectionRef: assembled.action.connectionRef!,
          mappingRef: assembled.action.mappingRef!,
        },
        prepared_by_uid: user.uid,
      });
      await claimMaintenanceWorkOrderLink(user, {
        ticket_ref: ticket.id,
        action_key: WORK_ORDER_CREATE_KEY,
        execution_id: record.id,
        state: "pending",
        created_by_uid: user.uid,
        attempt_seq: attemptSeq,
      });
      return NextResponse.json({
        status: "prepared",
        execution_id: record.id,
        approval_state: record.state,
        preview: assembled.action.values,
        status_name: assembled.statusName,
        status_group: assembled.statusGroup,
        ...(assembled.tradeName ? { trade_name: assembled.tradeName } : {}),
        approval_queue_href: "/approval-queue",
      });
    }

    if (body.operation === "propose_status") {
      const user = await requireCapabilityInSpace("edit", "maintenance");
      await assertWorkOrderActionAllowed(descriptor, WORK_ORDER_READ_KEY);
      const clients = buildWorkOrderClients();
      if (!clients) return notConfigured();
      const assembled = await assembleWorkOrderStatusAction(clients, {
        workOrderId: body.workOrderId,
        targetStatusId: body.targetStatusId,
      });
      const record = await workOrderS20.prepare(user, {
        action: assembled.action,
        approvalQueue: {
          directLink: `/maintenance`,
          processRunRef: {
            id: assembled.action.workflowId,
            label: "RentVine work-order status update",
          },
          requiredAdminUid: user.uid,
        },
        definition: workOrderDefinition(WORK_ORDER_STATUS_KEY),
        trustedContext: assembled.trustedContext,
        validate: (input) => workOrderExecutor(() => clients).validate(input),
      });
      await savePreparedWorkOrderAction(user, {
        execution_id: record.id,
        ticket_ref: null,
        action: {
          workflowId: assembled.action.workflowId,
          actionId: assembled.action.actionId,
          actionKey: WORK_ORDER_STATUS_KEY,
          dataMode: "live",
          values: { ...assembled.action.values },
          sourceRefs: [...assembled.action.sourceRefs],
          contractRef: assembled.action.contractRef!,
          connectionRef: assembled.action.connectionRef!,
          mappingRef: assembled.action.mappingRef!,
        },
        prepared_by_uid: user.uid,
      });
      return NextResponse.json({
        status: "prepared",
        execution_id: record.id,
        approval_state: record.state,
        preview: assembled.action.values,
        status_name: assembled.statusName,
        status_group: assembled.statusGroup,
        approval_queue_href: "/approval-queue",
      });
    }

    // execute | reconcile: replay the exact prepared identity through the bridge.
    const user = await requireCapabilityInSpace("edit", "maintenance");
    const prepared = await loadPreparedWorkOrderAction(user, body.executionId);
    if (!prepared) {
      return NextResponse.json(
        {
          error: "No prepared work-order action matches this id.",
          error_type: "not_found",
        },
        { status: 404 },
      );
    }
    const actionKey = prepared.action.actionKey;
    if (body.operation === "execute") {
      // BEH-S99-4: a duplicate confirmation returns the durable outcome; it never re-claims the
      // consumed attempt or touches the provider, so it runs before the mutating key gate.
      const current = await getActionExecution(user, body.executionId);
      if (current.state === "Succeeded") {
        const link = prepared.ticket_ref
          ? await getMaintenanceWorkOrderLink(user, prepared.ticket_ref)
          : null;
        return NextResponse.json({
          status: "executed",
          duplicate: true,
          execution_state: current.state,
          ...(link?.provider_work_order_id
            ? {
                receipt: {
                  provider_ref: link.provider_work_order_id,
                  result_hash: link.receipt_result_hash ?? null,
                  reconciled: false,
                },
              }
            : {}),
        });
      }
    }
    await assertWorkOrderActionAllowed(descriptor, actionKey);
    const clients = buildWorkOrderClients();
    if (!clients) return notConfigured();
    const action = preparedActionInput(prepared);
    const definition = workOrderDefinition(actionKey);
    const executor = workOrderExecutor(() => clients);
    // The prepared refs are replayed verbatim; readiness facts stay server-constructed.
    const trustedContext = buildTrustedContext(action);

    if (body.operation === "execute") {
      const outcome = await workOrderS20.execute(user, {
        action,
        definition,
        executionId: body.executionId,
        executor,
        trustedContext,
      });
      if (prepared.ticket_ref && actionKey === WORK_ORDER_CREATE_KEY) {
        const state =
          outcome.execution.state === "Succeeded"
            ? "succeeded"
            : outcome.execution.state === "Needs reconciliation"
              ? "ambiguous"
              : "failed";
        await projectMaintenanceWorkOrderOutcome(user, {
          ticketRef: prepared.ticket_ref,
          executionId: body.executionId,
          state,
          ...(outcome.result
            ? {
                providerWorkOrderId: outcome.result.providerRef,
                receiptResultHash: outcome.result.resultHash,
                providerStatusId:
                  String(prepared.action.values["work_order_status_id"] ?? "") ||
                  undefined,
              }
            : {}),
        });
      }
      return NextResponse.json({
        status: "executed",
        execution_state: outcome.execution.state,
        ...(outcome.result
          ? {
              receipt: {
                provider_ref: outcome.result.providerRef,
                result_hash: outcome.result.resultHash,
                reconciled: outcome.result.reconciled,
              },
            }
          : {}),
      });
    }

    const outcome = await workOrderS20.reconcile(user, {
      action,
      definition,
      executionId: body.executionId,
      executor,
      trustedContext,
    });
    const reconciledReceipt = "receipt" in outcome ? outcome.receipt : undefined;
    if (
      prepared.ticket_ref &&
      actionKey === WORK_ORDER_CREATE_KEY &&
      outcome.status === "succeeded" &&
      reconciledReceipt
    ) {
      await projectMaintenanceWorkOrderOutcome(user, {
        ticketRef: prepared.ticket_ref,
        executionId: body.executionId,
        state: "succeeded",
        providerWorkOrderId: reconciledReceipt.providerRef,
        receiptResultHash: reconciledReceipt.resultHash,
      });
    }
    return NextResponse.json({
      status: "reconciled",
      reconcile_status: outcome.status,
      execution_state: outcome.execution.state,
      ...(reconciledReceipt
        ? {
            receipt: {
              provider_ref: reconciledReceipt.providerRef,
              result_hash: reconciledReceipt.resultHash,
              reconciled: reconciledReceipt.reconciled,
            },
          }
        : {}),
    });
  } catch (error) {
    if (error instanceof WorkOrderServiceError) {
      return NextResponse.json(
        { error: error.message, error_type: error.code },
        { status: error.status },
      );
    }
    if (
      error instanceof ActionNotExecutableError ||
      error instanceof ActionRuntimeSuspendedError
    ) {
      return NextResponse.json(
        { error: error.message, error_type: error.code },
        { status: error.status },
      );
    }
    if (error instanceof EnvironmentContextError) {
      return NextResponse.json(
        {
          data_context: error.descriptor.dataContext,
          environment_kind: error.descriptor.environmentKind,
          error: error.message,
          error_type: "environment_context_not_allowed",
        },
        { status: 409 },
      );
    }
    return apiErrorResponse(error);
  }
}

async function requireTicket(
  user: Awaited<ReturnType<typeof requireCapabilityInSpace>>,
  ticketId: string,
) {
  const ticket = await getMaintenanceTicket(user, ticketId);
  if (!ticket) {
    throw new WorkOrderServiceError("ticket_not_eligible", "Unknown ticket.", 404);
  }
  return ticket;
}

function serializeRead(result: Awaited<ReturnType<typeof runWorkOrderRead>>) {
  return {
    list: result.list
      ? {
          rows: result.list.rows,
          pages: result.list.pages,
          complete: result.list.complete,
        }
      : null,
    detail: result.detail,
    statuses: result.statuses,
    trades: result.trades,
    filters: result.filters,
  };
}
