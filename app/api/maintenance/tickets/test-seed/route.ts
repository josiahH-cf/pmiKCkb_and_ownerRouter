import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  CreateMaintenanceTestTicketInputSchema,
  createCanonicalMaintenanceTestTicket,
} from "@/lib/firestore/maintenance-tickets";

// POST /api/maintenance/tickets/test-seed — creates a production Test ticket from reserved aliases.
// It never accepts customer/unit/vendor values from the browser.
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("edit", "maintenance");
    const input = await parseJsonBody(request, CreateMaintenanceTestTicketInputSchema);
    const ticket = await createCanonicalMaintenanceTestTicket(user, input);
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
