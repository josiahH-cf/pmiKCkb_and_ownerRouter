import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  CreateMaintenanceTicketInputSchema,
  createMaintenanceTicket,
  listMaintenanceTickets,
} from "@/lib/firestore/maintenance-tickets";

// GET /api/maintenance/tickets — the ticket queue (edit-gated read). POST — create a ticket from the
// captured work-order draft. App-plane only; the RentVine work-order create stays gated.
export async function GET() {
  try {
    const user = await requireCapability("edit");
    const tickets = await listMaintenanceTickets(user);
    return NextResponse.json({ tickets });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("edit");
    const input = await parseJsonBody(request, CreateMaintenanceTicketInputSchema);
    const ticket = await createMaintenanceTicket(user, input);
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
