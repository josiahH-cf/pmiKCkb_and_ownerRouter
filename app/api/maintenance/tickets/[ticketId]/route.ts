import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  TransitionMaintenanceTicketInputSchema,
  transitionMaintenanceTicket,
} from "@/lib/firestore/maintenance-tickets";
import { isAssignableUser } from "@/lib/maintenance/assignees";

interface RouteContext {
  params: Promise<{ ticketId: string }>;
}

// PATCH /api/maintenance/tickets/:ticketId — one lifecycle transition (status / assign / label /
// note). Edit-gated. Closing requires a reason (enforced in the writer). App-plane only.
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCapabilityInSpace("edit", "maintenance");
    const { ticketId } = await context.params;
    const input = await parseJsonBody(request, TransitionMaintenanceTicketInputSchema);

    // Assigning to a non-null uid: it must be a currently-assignable user (the same roster the picker
    // shows), so a typo'd/stale/deactivated uid cannot be written. Unassign (null) skips this.
    if (input.op === "assign" && input.assigneeUid !== null) {
      if (!(await isAssignableUser(input.assigneeUid))) {
        return NextResponse.json(
          { error: "That user cannot be assigned maintenance tickets." },
          { status: 400 },
        );
      }
    }

    const ticket = await transitionMaintenanceTicket(user, ticketId, input);
    return NextResponse.json({ ticket });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
