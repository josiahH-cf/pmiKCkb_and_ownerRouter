import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { parseExplicitDataMode } from "@/lib/data-mode";
import {
  CreateLiveMaintenanceTicketInputSchema,
  createMaintenanceTicket,
  listMaintenanceTickets,
} from "@/lib/firestore/maintenance-tickets";

// GET /api/maintenance/tickets — the ticket queue (edit-gated read). POST — create a ticket from the
// captured work-order draft. App-plane only; the RentVine work-order create stays gated.
export async function GET(request?: Request) {
  try {
    const user = await requireCapabilityInSpace("edit", "maintenance");
    const rawMode = request ? new URL(request.url).searchParams.get("data_mode") : null;
    const mode = rawMode ? parseExplicitDataMode(rawMode) : null;
    if (rawMode && !mode) {
      return NextResponse.json(
        { error: "data_mode must be exactly live or test." },
        { status: 400 },
      );
    }
    const tickets = await listMaintenanceTickets(user);
    return NextResponse.json({
      tickets: mode ? tickets.filter((ticket) => ticket.data_mode === mode) : tickets,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("edit", "maintenance");
    const input = await parseJsonBody(request, CreateLiveMaintenanceTicketInputSchema);
    const ticket = await createMaintenanceTicket(user, input);
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
