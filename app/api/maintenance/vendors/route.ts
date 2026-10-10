import { requireOperationsLiveContext } from "@/lib/operations/live-context";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { parseUniqueQuery } from "@/lib/api/query";
import { VendorRosterInputSchema } from "@/lib/maintenance/vendor-work-model";
import {
  readMaintenanceVendorRoster,
  readMaintenanceRosterOperation,
  saveMaintenanceVendorRoster,
  stopMaintenanceRosterOperation,
} from "@/lib/firestore/maintenance-vendor-work";
const headers = { "cache-control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const actor = await requireCapabilityInSpace("read", "maintenance"),
      q = parseUniqueQuery(
        request,
        z.object({ operation_id: z.string().uuid().optional() }).strict(),
      );
    return NextResponse.json(
      q.operation_id
        ? await readMaintenanceRosterOperation(actor, q.operation_id)
        : await readMaintenanceVendorRoster(actor),
      { headers },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace("edit", "maintenance");
    requireOperationsLiveContext();
    return NextResponse.json(
      {
        record: await saveMaintenanceVendorRoster(
          actor,
          await parseJsonBody(request, VendorRosterInputSchema),
        ),
      },
      { headers },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireCapabilityInSpace("edit", "maintenance");
    requireOperationsLiveContext();
    const input = await parseJsonBody(
      request,
      z.object({ operationId: z.string().uuid() }).strict(),
    );
    return NextResponse.json(
      await stopMaintenanceRosterOperation(actor, input.operationId),
      { headers },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
