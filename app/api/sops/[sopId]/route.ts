import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  noContent,
  parseJsonBody,
  parseOptionalJsonBody,
} from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { notifySopQueueChange } from "@/lib/approval/notifications";
import { getSop, softDeleteSop, updateSop } from "@/lib/firestore/editable";
import { ChangeLogNoteSchema, UpdateSopInputSchema } from "@/lib/firestore/schemas";

interface RouteContext {
  params: Promise<{ sopId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { sopId } = await context.params;
    const record = await getSop(user, sopId);

    return NextResponse.json({ sop: record });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { sopId } = await context.params;
    const input = await parseJsonBody(request, UpdateSopInputSchema);
    const previous = await getSop(user, sopId);
    const record = await updateSop(user, sopId, input);

    await notifySopQueueChange(user, record, previous.status);

    return NextResponse.json({ sop: record });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("softDelete");
    const { sopId } = await context.params;
    const { note } = await parseOptionalJsonBody(request, ChangeLogNoteSchema);

    await softDeleteSop(user, sopId, note);

    return noContent();
  } catch (error) {
    return apiErrorResponse(error);
  }
}
