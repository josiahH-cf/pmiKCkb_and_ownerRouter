import {
  observeStaffOperation,
  operationStage,
} from "@/lib/observability/staff-operation";
import { assertMaintenanceCaseActor } from "@/lib/firestore/maintenance-case-records";
import { approveActionExecution } from "@/lib/firestore/action-executions";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { expectedExternalS20ExecutionId } from "@/lib/external-execution/s20-bridge";
import { workOrderActionCompanion } from "@/lib/firestore/maintenance-work-order-prepared-actions";
import { ExternalExecutionError } from "@/lib/external-execution/types";
import { readMaintenanceWorkAuthorization } from "@/lib/maintenance/work-authorization";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  EnvironmentContextError,
  assertMutationAllowed,
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
  linkExistingMaintenanceWorkOrder,
  getMaintenanceWorkOrderLink,
  recordMaintenanceWorkOrderSnapshot,
  type MaintenanceWorkOrderProviderSnapshot,
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
  workOrderCreateAuthorizationRefs,
  assembleWorkOrderStatusAction,
  assertWorkOrderActionAllowed,
  buildWorkOrderClients,
  runWorkOrderRead,
  resolveTicketUnitMapping,
  workOrderDefinition,
  workOrderExecutor,
  workOrderS20,
} from "@/lib/maintenance/execution/work-order-service";

import {
  buildExistingWorkOrderLinkPreview,
  confirmExistingWorkOrderLinkPreview,
} from "@/lib/maintenance/existing-work-order-link";

const DecimalId = z.string().regex(/^[1-9][0-9]*$/);

const SelectionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("create"),
      ticketId: z.string().min(1).max(200),
      priorityId: z.enum(["1", "2", "3"]),
      workOrderStatusId: DecimalId,
      isVacant: z.boolean(),
      vendorTradeId: DecimalId.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("status"),
      workOrderId: DecimalId,
      targetStatusId: DecimalId,
    })
    .strict(),
]);
const BodySchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("review"), selection: SelectionSchema }).strict(),
  z
    .object({
      operation: z.literal("apply"),
      selection: SelectionSchema,
      executionId: z.string().regex(/^exec_[a-f0-9]{40}$/),
      reviewHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      operation: z.literal("original"),
      executionId: z.string().regex(/^exec_[a-f0-9]{40}$/),
    })
    .strict(),
  z
    .object({
      operation: z.literal("preview_link"),
      ticketId: z.string().trim().min(1).max(200),
      workOrderId: DecimalId,
    })
    .strict(),
  z
    .object({
      operation: z.literal("confirm_link"),
      ticketId: z.string().trim().min(1).max(200),
      workOrderId: DecimalId,
      confirmedPreviewHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal("Link this existing work order"),
    })
    .strict(),
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
async function handlePost(request: Request) {
  try {
    await operationStage("permission", () =>
      requireCapabilityInSpace("read", "maintenance"),
    );
    const body = await operationStage("decode", () => parseJsonBody(request, BodySchema));
    const descriptor = requireEnvironmentDescriptor();

    if (body.operation === "original") {
      const user = await operationStage("permission", () =>
          requireCapabilityInSpace("read", "maintenance"),
        ),
        prepared = await loadPreparedWorkOrderAction(user, body.executionId);
      if (!prepared)
        return NextResponse.json({
          state: "not_recorded",
          executionId: body.executionId,
          detail:
            "No original snapshot is recorded. This does not establish that an in-flight Apply failed.",
        });
      const execution = await getActionExecution(user, body.executionId);
      return NextResponse.json({
        state: execution.state,
        executionId: execution.id,
        preview: prepared.action.values,
        reviewHash: prepared.review_hash ?? null,
      });
    }
    if (body.operation === "review" || body.operation === "apply") {
      const user = await operationStage("permission", () =>
          requireCapabilityInSpace(
            body.operation === "apply" ? "edit" : "read",
            "maintenance",
          ),
        ),
        selection = body.selection;
      if (body.operation === "apply") assertMaintenanceCaseActor(user, true);
      let stored =
        body.operation === "apply"
          ? await loadPreparedWorkOrderAction(user, body.executionId)
          : null;
      if (stored && body.operation === "apply") {
        if (stored.review_hash !== body.reviewHash)
          throw new WorkOrderServiceError(
            "ticket_not_eligible",
            "The exact reviewed work-order snapshot does not match this Apply.",
          );
        const values = stored.action.values;
        if (
          selection.kind === "create"
            ? stored.ticket_ref !== selection.ticketId ||
              values.priority_id !== selection.priorityId ||
              values.work_order_status_id !== selection.workOrderStatusId ||
              values.is_vacant !== selection.isVacant ||
              String(values.vendor_trade_id ?? "") !==
                String(selection.vendorTradeId ?? "")
            : stored.action.actionKey !== WORK_ORDER_STATUS_KEY ||
              String(values.work_order_id) !== selection.workOrderId ||
              values.target_status_id !== selection.targetStatusId
        )
          throw new WorkOrderServiceError(
            "ticket_not_eligible",
            "The original operation identifies different selected values. Recover its original outcome.",
          );
        const current = await getActionExecution(user, body.executionId);
        if (current.state === "Succeeded")
          return NextResponse.json({
            status: "executed",
            duplicate: true,
            execution_state: current.state,
          });
      }
      if (!stored) {
        await assertWorkOrderActionAllowed(descriptor, WORK_ORDER_READ_KEY);
        const clients = buildWorkOrderClients();
        if (!clients) return notConfigured();
        let attempt = 0,
          ticket: Awaited<ReturnType<typeof requireTicket>> | null = null;
        if (selection.kind === "create") {
          ticket = await requireTicket(user, selection.ticketId);
          const existing = await getMaintenanceWorkOrderLink(user, ticket.id);
          if (existing && existing.state !== "failed")
            throw new WorkOrderServiceError(
              "ticket_not_eligible",
              "This ticket already has a linked or unresolved work order. Read or reconcile its original before another create.",
            );
          attempt = existing ? existing.attempt_seq + 1 : 0;
        }
        const assembled =
            selection.kind === "create"
              ? await assembleWorkOrderCreateAction(
                  clients,
                  ticket!,
                  selection,
                  attempt,
                  await readMaintenanceWorkAuthorization(user, ticket!),
                )
              : await assembleWorkOrderStatusAction(clients, selection),
          reviewHash = hashExecutionPreview({ action: assembled.action }),
          executionId = expectedExternalS20ExecutionId(assembled.action);
        if (body.operation === "review")
          return NextResponse.json({
            status: "review",
            executionId,
            reviewHash,
            preview: assembled.action.values,
            statusName: assembled.statusName,
            statusGroup: assembled.statusGroup,
          });
        if (body.executionId !== executionId || body.reviewHash !== reviewHash)
          throw new WorkOrderServiceError(
            "ticket_not_eligible",
            "The target, assessed scope, authority or selected values changed after review. Keep the input and read a current review before Apply.",
          );
        await assertWorkOrderActionAllowed(descriptor, assembled.action.actionKey);
        stored = {
          execution_id: executionId,
          ticket_ref: ticket?.id ?? null,
          action: {
            ...assembled.action,
            actionKey: assembled.action.actionKey as
              | "rentvine.work_order.create"
              | "rentvine.work_order.update_status",
            dataMode: "live",
            sourceRefs: [...assembled.action.sourceRefs],
            contractRef: assembled.action.contractRef!,
            connectionRef: assembled.action.connectionRef!,
            mappingRef: assembled.action.mappingRef!,
          },
          prepared_by_uid: user.uid,
          review_hash: reviewHash,
        };
        await workOrderS20.prepare(user, {
          action: assembled.action,
          companion: workOrderActionCompanion(stored),
          definition: workOrderDefinition(assembled.action.actionKey),
          trustedContext: assembled.trustedContext,
          validate: (input) => workOrderExecutor(() => clients).validate(input),
        });
      }
      if (body.operation !== "apply")
        throw new WorkOrderServiceError(
          "ticket_not_eligible",
          "Choose one exact Apply target.",
        );
      if (stored.ticket_ref) {
        const currentLink = await getMaintenanceWorkOrderLink(user, stored.ticket_ref);
        await claimMaintenanceWorkOrderLink(user, {
          ticket_ref: stored.ticket_ref,
          action_key: WORK_ORDER_CREATE_KEY,
          execution_id: stored.execution_id,
          state: "pending",
          created_by_uid: stored.prepared_by_uid,
          attempt_seq:
            currentLink?.execution_id === stored.execution_id
              ? currentLink.attempt_seq
              : currentLink
                ? currentLink.attempt_seq + 1
                : 0,
        });
      }
      const current = await getActionExecution(user, stored.execution_id);
      if (current.state === "Awaiting Admin")
        await approveActionExecution(user, stored.execution_id, {
          previewHash: current.preview_hash,
          contextHash: current.context_hash,
          reason: "Staff applied the displayed exact maintenance work-order change.",
        });
      // Continue through the existing guarded one-attempt execution/readback/recovery path.
      return handlePost(
        new Request(request.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operation: "execute",
            executionId: stored.execution_id,
          }),
        }),
      );
    }
    if (body.operation === "link_status") {
      const user = await operationStage("permission", () =>
        requireCapabilityInSpace("read", "maintenance"),
      );
      const link = await getMaintenanceWorkOrderLink(user, body.ticketId);
      return NextResponse.json({ status: "ok", link });
    }

    if (body.operation === "read") {
      const user = await operationStage("permission", () =>
        requireCapabilityInSpace("read", "maintenance"),
      );
      void user;
      await assertWorkOrderActionAllowed(descriptor, WORK_ORDER_READ_KEY);
      const clients = buildWorkOrderClients();
      if (!clients) return notConfigured();
      if (body.workOrderId !== undefined) {
        const result = await runWorkOrderRead(clients, {
          kind: "detail",
          workOrderId: Number(body.workOrderId),
        });
        const snapshot = await persistProviderSnapshot(user, body.ticketId, result);
        return NextResponse.json({
          status: "ok",
          ...serializeRead(result),
          provider_snapshot: snapshot,
        });
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
      const snapshot = await persistProviderSnapshot(user, ticket.id, result);
      return NextResponse.json({
        status: "ok",
        ...serializeRead(result),
        provider_snapshot: snapshot,
      });
    }

    if (body.operation === "preview_link" || body.operation === "confirm_link") {
      const user = await operationStage("permission", () =>
        requireCapabilityInSpace("edit", "maintenance"),
      );
      if (body.operation === "confirm_link") assertMutationAllowed(descriptor);
      await assertWorkOrderActionAllowed(descriptor, WORK_ORDER_READ_KEY);
      const clients = buildWorkOrderClients();
      if (!clients) return notConfigured();
      const ticket = await requireTicket(user, body.ticketId);
      const mapping = await resolveTicketUnitMapping(ticket);
      const observed = await clients.reader.getWorkOrder(Number(body.workOrderId));
      if (observed.workOrder.workOrderId !== body.workOrderId)
        throw new WorkOrderServiceError(
          "provider_read_failed",
          "The work-order read returned a different identity.",
        );
      const source = {
        actorUid: user.uid,
        accountRef: "pmikcmetro",
        ticket,
        mapping,
        workOrder: observed.workOrder,
      };
      if (body.operation === "preview_link")
        return NextResponse.json({
          status: "preview",
          ...buildExistingWorkOrderLinkPreview(source),
        });
      const preview = confirmExistingWorkOrderLinkPreview(
        body.confirmedPreviewHash,
        source,
      );
      const link = await linkExistingMaintenanceWorkOrder(user, {
        ticketId: ticket.id,
        ticketVersion: ticket.updated_at,
        workOrderId: body.workOrderId,
        ...mapping,
        confirmedPreviewHash: preview.previewHash,
      });
      return NextResponse.json({ status: "linked", link });
    }

    if (body.operation === "propose_create") {
      const user = await operationStage("permission", () =>
        requireCapabilityInSpace("edit", "maintenance"),
      );
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
        await readMaintenanceWorkAuthorization(user, ticket),
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
      const user = await operationStage("permission", () =>
        requireCapabilityInSpace("edit", "maintenance"),
      );
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
    const user = await operationStage("permission", () =>
      requireCapabilityInSpace("edit", "maintenance"),
    );
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
          ...(link?.state === "succeeded" &&
          link.execution_id === body.executionId &&
          link.provider_work_order_id
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
    if (body.operation === "execute" && actionKey === WORK_ORDER_CREATE_KEY) {
      if (!prepared.ticket_ref)
        throw new WorkOrderServiceError(
          "ticket_not_eligible",
          "Recover the original prepared ticket identity before any new create.",
        );
      const ticket = await requireTicket(user, prepared.ticket_ref),
        currentRefs = workOrderCreateAuthorizationRefs(
          ticket,
          await readMaintenanceWorkAuthorization(user, ticket),
        );
      if (currentRefs.some((ref) => !prepared.action.sourceRefs.includes(ref)))
        throw new WorkOrderServiceError(
          "ticket_not_eligible",
          "The assessed scope or spending authority changed after preparation. Review the current work before a new provider action.",
        );
    }
    await assertWorkOrderActionAllowed(descriptor, actionKey);
    const clients = buildWorkOrderClients();
    if (!clients) return notConfigured();
    const action = preparedActionInput(prepared);
    const definition = workOrderDefinition(actionKey);
    const executor = workOrderExecutor(
      () => clients,
      async () => {
        if (!prepared.ticket_ref)
          throw new ExternalExecutionError(
            "The prepared ticket identity is unavailable.",
            "provider",
          );
        try {
          const ticket = await requireTicket(user, prepared.ticket_ref);
          const refs = workOrderCreateAuthorizationRefs(
            ticket,
            await readMaintenanceWorkAuthorization(user, ticket),
          );
          if (refs.some((ref) => !prepared.action.sourceRefs.includes(ref)))
            throw new Error("Authority changed");
        } catch {
          throw new ExternalExecutionError(
            "The assessed work or its spending authority changed before dispatch. No provider create was attempted.",
            "provider",
          );
        }
      },
    );
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

/**
 * S108: record the observed provider state on the ticket's existing link. The snapshot exists only
 * because a person just ran the exact read key; nothing here re-reads, retries, or writes to
 * RentVine, and a ticket without a link records nothing.
 */
async function persistProviderSnapshot(
  user: Awaited<ReturnType<typeof requireCapabilityInSpace>>,
  ticketId: string | undefined,
  result: Awaited<ReturnType<typeof runWorkOrderRead>>,
): Promise<MaintenanceWorkOrderProviderSnapshot | null> {
  if (!ticketId) return null;
  const link = await getMaintenanceWorkOrderLink(user, ticketId);
  const providerWorkOrderId = link?.provider_work_order_id;
  if (!providerWorkOrderId) return null;
  const observed =
    result.detail?.workOrder.workOrderId === providerWorkOrderId
      ? result.detail.workOrder
      : (result.list?.rows.find((row) => row.workOrderId === providerWorkOrderId) ??
        null);
  if (!observed) return null;
  const snapshot: MaintenanceWorkOrderProviderSnapshot = {
    property_id: observed.propertyId,
    work_order_status_id: observed.workOrderStatusId,
    status_label:
      result.statuses.find(
        (status) => status.workOrderStatusId === observed.workOrderStatusId,
      )?.name ?? `Status ${observed.workOrderStatusId}`,
    priority_id: observed.priorityId,
    is_owner_approved: observed.isOwnerApproved,
    assigned_vendor_trade_id: observed.vendorTradeId,
    updated_at_iso: null,
    read_at_iso: new Date().toISOString(),
  };
  const outcome = await recordMaintenanceWorkOrderSnapshot(user, {
    ticketRef: ticketId,
    providerWorkOrderId,
    snapshot,
  });
  return outcome === "recorded" ? snapshot : null;
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

export async function POST(request: Request) {
  const response = await observeStaffOperation("maintenance_provider_update", 1, () =>
    operationStage("prepare", () => handlePost(request)),
  );
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("x-content-type-options", "nosniff");
  return response;
}
