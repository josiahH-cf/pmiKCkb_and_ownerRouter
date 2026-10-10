import {
  observeStaffOperation,
  operationStage,
} from "@/lib/observability/staff-operation";
import { requireOperationsLiveContext } from "@/lib/operations/live-context";
import { MaintenanceVendorCommandSchema } from "@/lib/maintenance/vendor-work-model";
import { applyMaintenanceVendorOperation } from "@/lib/firestore/maintenance-vendor-work";
import { z } from "zod";
import { MaintenanceCaseCommandSchema } from "@/lib/maintenance/case-model";
import { applyMaintenanceCaseOperation } from "@/lib/firestore/maintenance-case-records";
import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  HttpTransitionMaintenanceTicketInputSchema,
  getMaintenanceTicket,
  readMaintenanceTicketOperation,
  transitionMaintenanceTicket,
} from "@/lib/firestore/maintenance-tickets";
import { isAssignableUser } from "@/lib/maintenance/assignees";

interface RouteContext {
  params: Promise<{ ticketId: string }>;
}

// PATCH /api/maintenance/tickets/:ticketId — one lifecycle transition (status / assign / label /
// note). Edit-gated. Closing requires a reason (enforced in the writer). App-plane only.
async function handlePatch(request: Request, context: RouteContext) {
  try {
    const user = await operationStage("permission", () =>
      requireCapabilityInSpace("edit", "maintenance"),
    );
    requireOperationsLiveContext();
    const { ticketId } = await context.params;
    const input = await parseJsonBody(
      request,
      z.union([
        HttpTransitionMaintenanceTicketInputSchema,
        MaintenanceCaseCommandSchema,
        MaintenanceVendorCommandSchema,
      ]),
    );

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

    const ticket =
      input.op === "association" ||
      input.op === "financial" ||
      input.op === "reviewed_summary" ||
      input.op === "urgency_review" ||
      input.op === "responsibility_review"
        ? await operationStage("commit", () =>
            applyMaintenanceCaseOperation(user, ticketId, input),
          )
        : input.op === "vendor_selection" ||
            input.op === "vendor_packet" ||
            input.op === "vendor_review" ||
            input.op === "vendor_handoff_report"
          ? await operationStage("commit", () =>
              applyMaintenanceVendorOperation(user, ticketId, input),
            )
          : await operationStage("commit", () =>
              transitionMaintenanceTicket(user, ticketId, input),
            );
    return NextResponse.json({ ticket, operation_id: input.operationId });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function handleGet(request: Request, context: RouteContext) {
  try {
    const user = await operationStage("permission", () =>
        requireCapabilityInSpace("read", "maintenance"),
      ),
      { ticketId } = await context.params,
      params = new URL(request.url).searchParams;
    if (
      [...params.keys()].some((k) => k !== "operation_id") ||
      params.getAll("operation_id").length > 1
    )
      return NextResponse.json(
        { error: "Invalid ticket result query." },
        { status: 400 },
      );
    const operationId = params.get("operation_id");
    if (
      operationId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        operationId,
      )
    )
      return NextResponse.json(
        { error: "Invalid original operation identity." },
        { status: 400 },
      );
    const result = operationId
      ? await operationStage("record_read", () =>
          readMaintenanceTicketOperation(user, ticketId, operationId),
        )
      : {
          ticket: await operationStage("record_read", () =>
            getMaintenanceTicket(user, ticketId),
          ),
        };
    return NextResponse.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export function PATCH(request: Request, context: RouteContext) {
  return observeStaffOperation("maintenance_edit", 1, () =>
    handlePatch(request, context),
  );
}
export function GET(request: Request, context: RouteContext) {
  return observeStaffOperation("maintenance_read", 0, () => handleGet(request, context));
}
