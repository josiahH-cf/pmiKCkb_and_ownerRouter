import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { FirestoreVendorStore } from "@/lib/firestore/vendors";
import { requireVendorSession } from "@/lib/vendor/auth";
import { VendorBoundaryError } from "@/lib/vendor/model";
import {
  VENDOR_TEST_MAILBOX_LABELS,
  VendorTestMailboxService,
} from "@/lib/vendor/test-mailbox";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_draft"), body: z.string() }),
  z.object({
    action: z.literal("apply_label"),
    label: z.enum(VENDOR_TEST_MAILBOX_LABELS),
  }),
  z.object({ action: z.literal("prepare_reply"), body: z.string() }),
  z.object({
    action: z.literal("confirm_reply"),
    confirmationToken: z.string().min(1),
    threadId: z.string().min(1),
    body: z.string(),
    messageId: z.string().min(1),
  }),
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const principal = await requireVendorSession();
    const { ticketId } = await context.params;
    const store = new FirestoreVendorStore();
    const service = new VendorTestMailboxService(principal, {
      assignments: store,
      store,
    });
    return NextResponse.json({ mailbox: await service.read(ticketId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const principal = await requireVendorSession();
    const { ticketId } = await context.params;
    const body = await parseJsonBody(request, bodySchema);
    const store = new FirestoreVendorStore();
    const service = new VendorTestMailboxService(principal, {
      assignments: store,
      store,
    });
    if (body.action === "save_draft") {
      return NextResponse.json(await service.saveDraft(ticketId, body.body));
    }
    if (body.action === "apply_label") {
      return NextResponse.json(await service.applyLabel(ticketId, body.label));
    }
    if (body.action === "prepare_reply") {
      return NextResponse.json(await service.prepareReply(ticketId, body.body));
    }
    return NextResponse.json(
      await service.confirmReply({
        confirmationToken: body.confirmationToken,
        ticketId,
        threadId: body.threadId,
        body: body.body,
        messageId: body.messageId,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof VendorBoundaryError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return apiErrorResponse(error);
}
