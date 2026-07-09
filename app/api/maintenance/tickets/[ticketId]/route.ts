import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  TransitionMaintenanceTicketInputSchema,
  transitionMaintenanceTicket,
} from "@/lib/firestore/maintenance-tickets";

interface RouteContext {
  params: Promise<{ ticketId: string }>;
}

// PATCH /api/maintenance/tickets/:ticketId — one lifecycle transition (status / assign / label /
// note). Edit-gated. Closing requires a reason (enforced in the writer). App-plane only.
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { ticketId } = await context.params;
    const input = await parseJsonBody(request, TransitionMaintenanceTicketInputSchema);
    const ticket = await transitionMaintenanceTicket(user, ticketId, input);
    return NextResponse.json({ ticket });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
