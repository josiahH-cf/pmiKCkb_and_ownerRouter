import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { listMaintenanceTicketActivity } from "@/lib/firestore/maintenance-tickets";

interface RouteContext {
  params: Promise<{ ticketId: string }>;
}

// GET /api/maintenance/tickets/:ticketId/activity — the append-only lifecycle trail for one ticket.
// Read-gated. Surfaces the existing listMaintenanceTicketActivity reader so the queue can show a
// per-ticket history panel without rebuilding the F-MAINT-TICKETS lifecycle. No write, no send.
export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { ticketId } = await context.params;
    const activity = await listMaintenanceTicketActivity(user, ticketId);
    return NextResponse.json({ activity });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
