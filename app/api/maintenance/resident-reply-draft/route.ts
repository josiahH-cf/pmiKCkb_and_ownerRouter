import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { requireEnvironmentDescriptor } from "@/lib/environment/descriptor";
import {
  ActionNotExecutableError,
  ActionRuntimeSuspendedError,
  assertProductionRuntimeActionExecutable,
} from "@/lib/operations/runtime-suspension-gate";
import {
  executeGovernedDraft,
  prepareGovernedDraft,
  reconcileGovernedDraft,
} from "@/lib/external-execution/governed-draft-execution";
import { createDescriptorBoundGmailRuntimeClient } from "@/lib/gmail-hub/dependencies";
import { getWorkOrderChatMessage } from "@/lib/firestore/rentvine-work-order-chat-messages";
import { rentVineAccountCode } from "@/lib/integrations/rentvine/client";
import { resolveResidentFromLeaseTenants } from "@/lib/integrations/rentvine/chat-contract";
import {
  RESIDENT_REPLY_DRAFT_KEY,
  buildChatSyncClients,
} from "@/lib/maintenance/execution/chat-sync-service";
import { buildResidentReplyDraftAction } from "@/lib/maintenance/execution/resident-reply-draft-request";
import { MAINTENANCE_EXECUTION_DEFINITION_MAP } from "@/lib/maintenance/execution/matrix";

const BodySchema = z
  .object({
    messageId: z.number().int().positive(),
    subject: z.string().min(1).max(500),
    body: z.string().min(1).max(20_000),
    confirm: z
      .object({
        executionId: z.string().regex(/^exec_[a-f0-9]{40}$/),
        previewHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .optional(),
    reconcile: z
      .object({ executionId: z.string().regex(/^exec_[a-f0-9]{40}$/) })
      .strict()
      .optional(),
  })
  .strict();

/**
 * S100 resident reply: preview or exact-confirm ONE unsent Gmail draft to the one server-verified
 * resident email re-resolved fresh from the authoritative lease-tenants relation. The browser
 * supplies subject/body only; it can never supply the recipient, mailbox, or provider target.
 * There is no CC, BCC, attachment, send, thread reply, or app draft-delete here.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("edit", "maintenance");
    const body = await parseJsonBody(request, BodySchema);
    const descriptor = requireEnvironmentDescriptor();
    await assertProductionRuntimeActionExecutable(RESIDENT_REPLY_DRAFT_KEY);

    if (/[\r\n]/.test(body.subject)) {
      return NextResponse.json(
        { error: "The subject may not contain line breaks.", error_type: "bad_request" },
        { status: 400 },
      );
    }

    const clients = buildChatSyncClients();
    if (!clients) {
      return NextResponse.json({ status: "not_configured" }, { status: 503 });
    }
    const baseUrl = process.env.RENTVINE_API_BASE_URL?.trim() ?? "";
    const accountRef = `rentvine:${rentVineAccountCode(baseUrl)}`;
    const stored = await getWorkOrderChatMessage(user, accountRef, body.messageId);
    if (!stored || stored.role !== "tenant" || stored.contact_id === null) {
      return NextResponse.json(
        {
          error: "Only a synchronized resident-origin message can seed a reply draft.",
          error_type: "message_not_eligible",
        },
        { status: 409 },
      );
    }
    if (stored.mapping_state !== "resident_bound") {
      return NextResponse.json(
        {
          error: "This message still needs resident mapping before a reply draft.",
          error_type: "needs_mapping",
        },
        { status: 409 },
      );
    }

    // Fresh authoritative re-resolution: the current unique lease-tenant match supplies the one
    // current email; a changed relation changes the source ref and invalidates any prior preview.
    const detail = await clients.workOrders.getWorkOrder(Number(stored.work_order_id));
    const leaseId = detail.workOrder.leaseId;
    if (leaseId === null) {
      return NextResponse.json(
        {
          error:
            "The work order no longer binds a lease; the resident source is unavailable.",
          error_type: "resident_source_unavailable",
        },
        { status: 409 },
      );
    }
    const leaseResponse = await clients.leases.getLeaseWithTenants(leaseId);
    const match = resolveResidentFromLeaseTenants(leaseResponse, stored.contact_id);
    if (!match || !match.email) {
      return NextResponse.json(
        {
          error:
            "The authoritative resident source did not resolve one current verified email.",
          error_type: "resident_source_unavailable",
        },
        { status: 409 },
      );
    }

    const action = buildResidentReplyDraftAction({
      ticketRef: stored.ticket_ref,
      messageRef: `${accountRef}:${stored.message_id}`,
      recipient: {
        to: match.email,
        sourceRef: `rentvine:lease:${leaseId}:lease-tenant:${match.leaseTenantId}:v${match.sourceVersion.slice(0, 16)}`,
      },
      mailbox: { email: user.email, sourceRef: `app:session:${user.uid}` },
      subject: body.subject,
      body: body.body,
    });
    const definition = MAINTENANCE_EXECUTION_DEFINITION_MAP.get(
      RESIDENT_REPLY_DRAFT_KEY,
    )!;
    const requestShape = {
      action,
      definition,
      createClient: () => createDescriptorBoundGmailRuntimeClient(user.email, descriptor),
    };

    if (body.reconcile) {
      const outcome = await reconcileGovernedDraft(user, {
        ...requestShape,
        executionId: body.reconcile.executionId,
      });
      return NextResponse.json({
        status: "reconciled",
        reconcile_status: outcome.status,
        ...("receipt" in outcome && outcome.receipt
          ? { draft_id: outcome.receipt.providerRef }
          : {}),
      });
    }

    if (!body.confirm) {
      const prepared = await prepareGovernedDraft(user, requestShape);
      return NextResponse.json({
        status: "preview",
        execution_id: prepared.id,
        preview_hash: prepared.preview_hash,
        from: String(action.values.from),
        to: String(action.values.to),
        subject: String(action.values.subject),
        body: String(action.values.body),
        recipient_source_ref: String(action.values.recipient_source_ref),
      });
    }

    const outcome = await executeGovernedDraft(user, {
      ...requestShape,
      executionId: body.confirm.executionId,
      previewHash: body.confirm.previewHash,
    });
    if (outcome.execution.state === "Succeeded" && outcome.result) {
      return NextResponse.json({
        status: "created",
        draft_id: outcome.result.providerRef,
        execution_id: body.confirm.executionId,
      });
    }
    return NextResponse.json({
      status: "needs_reconciliation",
      execution_state: outcome.execution.state,
      execution_id: body.confirm.executionId,
    });
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
    return apiErrorResponse(error);
  }
}
