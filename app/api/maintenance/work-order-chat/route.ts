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
import { rentVineAccountCode } from "@/lib/integrations/rentvine/client";
import { getMaintenanceWorkOrderLink } from "@/lib/firestore/maintenance-work-order-links";
import {
  loadPreparedWorkOrderAction,
  preparedActionInput,
  savePreparedWorkOrderAction,
} from "@/lib/firestore/maintenance-work-order-prepared-actions";
import {
  applyRerunResidentBinding,
  commitChatSyncPage,
  listWorkOrderChatRecords,
  type ChatSyncCounts,
} from "@/lib/firestore/rentvine-work-order-chat-messages";
import { resolveResidentFromLeaseTenants } from "@/lib/integrations/rentvine/chat-contract";
import {
  RentVineWorkOrderChatSyncExecutor,
  WORK_ORDER_CHAT_SYNC_KEY,
  buildChatSyncClients,
} from "@/lib/maintenance/execution/chat-sync-service";
import {
  WORK_ORDER_READ_KEY,
  assertWorkOrderActionAllowed,
  buildTrustedContext,
  workOrderDefinition,
  workOrderS20,
} from "@/lib/maintenance/execution/work-order-service";
import { expectedExternalS20ExecutionId } from "@/lib/external-execution/s20-bridge";
import type { ExternalActionPreparationInput } from "@/lib/external-execution/s20-bridge";

const BodySchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("thread"),
      ticketId: z.string().trim().min(1).max(200),
    })
    .strict(),
  z
    .object({
      operation: z.literal("preview_sync"),
      ticketId: z.string().trim().min(1).max(200),
      page: z.number().int().min(1).max(100_000).optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("confirm_sync"),
      executionId: z.string().trim().min(1).max(300),
      previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      operation: z.literal("rerun_mapping"),
      messageId: z.number().int().positive(),
    })
    .strict(),
]);

const CHAT_CONTRACT_REF = "documented:rentvine:chat-messages:v1";
const CHAT_CONNECTION_REF = "rentvine-manager-api:production";
const CHAT_MAPPING_REF = "maintenance-ticket-work-order-chat:v1";

function accountRef(): string {
  const baseUrl = process.env.RENTVINE_API_BASE_URL?.trim();
  return baseUrl ? `rentvine:${rentVineAccountCode(baseUrl)}` : "rentvine:unconfigured";
}

function syncAction(input: {
  ticketRef: string;
  workOrderId: string;
  page: number;
}): ExternalActionPreparationInput {
  return {
    workflowId: `maintenance:${input.ticketRef}`,
    actionId: `work-order-chat-sync:${input.ticketRef}:p${input.page}`,
    actionKey: WORK_ORDER_CHAT_SYNC_KEY,
    dataMode: "live",
    values: {
      ticket_ref: input.ticketRef,
      work_order_id: input.workOrderId,
      page: String(input.page),
      page_size: "20",
      marks_read_for_managers: true,
    },
    sourceRefs: [`ticket:${input.ticketRef}`, `rentvine:work-order:${input.workOrderId}`],
    contractRef: CHAT_CONTRACT_REF,
    connectionRef: CHAT_CONNECTION_REF,
    mappingRef: CHAT_MAPPING_REF,
  };
}

/**
 * S100 manual chat sync surface. Loading a thread performs zero provider calls; only the exact
 * confirmed preview dispatches the one consequential page read, which RentVine documents as
 * marking retrieved messages read for managers. Mapping review can only rerun the same source
 * algorithm; nothing here posts chat, changes a work order, or sends anything.
 */
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request, BodySchema);
    const descriptor = requireEnvironmentDescriptor();
    const user = await requireCapabilityInSpace("edit", "maintenance");

    if (body.operation === "thread") {
      const [records, link] = await Promise.all([
        listWorkOrderChatRecords(user, body.ticketId),
        getMaintenanceWorkOrderLink(user, body.ticketId),
      ]);
      return NextResponse.json({
        status: "ok",
        work_order_id: link?.provider_work_order_id ?? null,
        eligible: Boolean(link?.provider_work_order_id),
        records: records.map((record) =>
          record.lane === "message"
            ? {
                lane: "message",
                message_id: record.message_id,
                role: record.role,
                created_at: record.created_at_iso,
                body: record.body,
                truncated: record.truncated,
                mapping_state: record.mapping_state,
                attachments: record.attachments,
              }
            : {
                lane: "review",
                message_id: record.message_id,
                reason: record.reason,
                created_at: record.created_at_iso,
              },
        ),
      });
    }

    if (body.operation === "preview_sync") {
      await assertWorkOrderActionAllowed(descriptor, WORK_ORDER_CHAT_SYNC_KEY);
      const link = await getMaintenanceWorkOrderLink(user, body.ticketId);
      if (!link?.provider_work_order_id) {
        return NextResponse.json(
          {
            error:
              "This ticket has no receipted RentVine work-order binding; sync needs one first.",
            error_type: "binding_missing",
          },
          { status: 409 },
        );
      }
      const action = syncAction({
        ticketRef: body.ticketId,
        workOrderId: link.provider_work_order_id,
        page: body.page ?? 1,
      });
      const record = await workOrderS20.prepare(user, {
        action,
        definition: workOrderDefinition(WORK_ORDER_CHAT_SYNC_KEY),
        trustedContext: buildTrustedContext(action),
        validate: (input) =>
          new RentVineWorkOrderChatSyncExecutor({
            clients: () => {
              throw new Error("Preparation never constructs a provider client.");
            },
            accountRef: accountRef(),
            commit: async () => {},
          }).validate(input),
      });
      await savePreparedWorkOrderAction(user, {
        execution_id: record.id,
        ticket_ref: body.ticketId,
        action: {
          workflowId: action.workflowId,
          actionId: action.actionId,
          actionKey: WORK_ORDER_CHAT_SYNC_KEY,
          dataMode: "live",
          values: { ...action.values },
          sourceRefs: [...action.sourceRefs],
          contractRef: action.contractRef!,
          connectionRef: action.connectionRef!,
          mappingRef: action.mappingRef!,
        },
        prepared_by_uid: user.uid,
      });
      return NextResponse.json({
        status: "preview",
        execution_id: record.id,
        preview_hash: record.preview_hash,
        preview: action.values,
        warning: "RentVine will mark retrieved messages as read for managers.",
      });
    }

    if (body.operation === "confirm_sync") {
      const prepared = await loadPreparedWorkOrderAction(user, body.executionId);
      if (!prepared || prepared.action.actionKey !== WORK_ORDER_CHAT_SYNC_KEY) {
        return NextResponse.json(
          { error: "No prepared sync matches this id.", error_type: "not_found" },
          { status: 404 },
        );
      }
      await assertWorkOrderActionAllowed(descriptor, WORK_ORDER_CHAT_SYNC_KEY);
      const clients = buildChatSyncClients();
      if (!clients) {
        return NextResponse.json({ status: "not_configured" }, { status: 503 });
      }
      const action = preparedActionInput(prepared);
      if (body.executionId !== expectedExternalS20ExecutionId(action)) {
        return NextResponse.json(
          {
            error: "The execution id does not match the prepared sync.",
            error_type: "not_found",
          },
          { status: 409 },
        );
      }
      let counts: ChatSyncCounts | null = null;
      let nextPage: number | null = null;
      const executor = new RentVineWorkOrderChatSyncExecutor({
        clients: () => clients,
        accountRef: accountRef(),
        commit: async (input) => {
          counts = await commitChatSyncPage(user, {
            accountRef: accountRef(),
            ticketRef: String(action.values.ticket_ref),
            workOrderId: String(action.values.work_order_id),
            syncAttemptRef: body.executionId,
            dispositions: input.dispositions,
            residentBindings: input.residentBindings,
            nowMs: Date.now(),
          });
          nextPage = input.pagination.nextPage;
        },
      });
      const outcome = await workOrderS20.execute(user, {
        action,
        confirmedPreviewHash: body.previewHash,
        definition: workOrderDefinition(WORK_ORDER_CHAT_SYNC_KEY),
        executionId: body.executionId,
        executor,
        trustedContext: buildTrustedContext(action),
      });
      return NextResponse.json({
        status: "synced",
        execution_state: outcome.execution.state,
        counts,
        next_page: nextPage,
        synced_at: new Date().toISOString(),
        read_marker_note:
          "RentVine may have marked the retrieved messages read for managers; that state has no rollback.",
      });
    }

    // rerun_mapping: repeat the same fresh compare-and-commit source algorithm; read-only
    // provider access under the exact read key, never a person/email picker.
    await assertWorkOrderActionAllowed(descriptor, WORK_ORDER_READ_KEY);
    const clients = buildChatSyncClients();
    if (!clients) {
      return NextResponse.json({ status: "not_configured" }, { status: 503 });
    }
    const { getWorkOrderChatMessage } =
      await import("@/lib/firestore/rentvine-work-order-chat-messages");
    const stored = await getWorkOrderChatMessage(user, accountRef(), body.messageId);
    if (!stored || stored.role !== "tenant" || stored.contact_id === null) {
      return NextResponse.json(
        { error: "No stored tenant-role message matches.", error_type: "not_found" },
        { status: 404 },
      );
    }
    const detail = await clients.workOrders.getWorkOrder(Number(stored.work_order_id));
    const leaseId = detail.workOrder.leaseId;
    let state: "resident_bound" | "needs_mapping" = "needs_mapping";
    if (leaseId !== null) {
      const leaseResponse = await clients.leases.getLeaseWithTenants(leaseId);
      const match = resolveResidentFromLeaseTenants(leaseResponse, stored.contact_id);
      state = await applyRerunResidentBinding(user, {
        accountRef: accountRef(),
        messageId: body.messageId,
        binding: match
          ? {
              contactId: stored.contact_id,
              leaseId,
              leaseTenantId: match.leaseTenantId,
              sourceVersion: match.sourceVersion,
            }
          : null,
      });
    } else {
      state = await applyRerunResidentBinding(user, {
        accountRef: accountRef(),
        messageId: body.messageId,
        binding: null,
      });
    }
    return NextResponse.json({ status: "rerun_complete", mapping_state: state });
  } catch (error) {
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
