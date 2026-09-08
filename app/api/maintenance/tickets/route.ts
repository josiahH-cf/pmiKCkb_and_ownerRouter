import { readVerifiedTicketProperty } from "@/lib/maintenance/verified-ticket-property";
import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
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
    if (rawMode && rawMode !== "live") {
      return NextResponse.json(
        { error: "The Production maintenance queue is Live-only." },
        { status: 400 },
      );
    }
    const tickets = await listMaintenanceTickets(user);
    return NextResponse.json({ tickets });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("edit", "maintenance");
    const input = await parseJsonBody(request, CreateLiveMaintenanceTicketInputSchema);
    const propertyId = await readVerifiedTicketProperty(input.unit.unitId);
    const ticket = await createMaintenanceTicket(user, input, undefined, propertyId);
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
