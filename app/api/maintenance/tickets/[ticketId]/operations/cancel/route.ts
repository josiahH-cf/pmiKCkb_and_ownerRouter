import { requireOperationsLiveContext } from "@/lib/operations/live-context";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { parseJsonBody, apiErrorResponse } from "@/lib/api/editable";
import { stopOriginalMaintenanceEdit } from "@/lib/firestore/maintenance-tickets";
export async function POST(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const actor = await requireCapabilityInSpace("edit", "maintenance");
    requireOperationsLiveContext();
    const { ticketId } = await context.params,
      input = await parseJsonBody(
        request,
        z.object({ operationId: z.string().uuid() }).strict(),
      );
    return NextResponse.json(
      await stopOriginalMaintenanceEdit(actor, ticketId, input.operationId),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
