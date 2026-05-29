import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  noContent,
  parseJsonBody,
  parseOptionalJsonBody,
} from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { notifyPlaceholderQueueChange } from "@/lib/approval/notifications";
import {
  getPlaceholder,
  softDeletePlaceholder,
  updatePlaceholder,
} from "@/lib/firestore/editable";
import {
  ChangeLogNoteSchema,
  UpdatePlaceholderInputSchema,
} from "@/lib/firestore/schemas";

interface RouteContext {
  params: Promise<{ placeholderId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { placeholderId } = await context.params;
    const record = await getPlaceholder(user, placeholderId);

    return NextResponse.json({ placeholder: record });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { placeholderId } = await context.params;
    const input = await parseJsonBody(request, UpdatePlaceholderInputSchema);
    const previous = await getPlaceholder(user, placeholderId);
    const record = await updatePlaceholder(user, placeholderId, input);

    await notifyPlaceholderQueueChange(user, record, previous.status);

    return NextResponse.json({ placeholder: record });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("softDelete");
    const { placeholderId } = await context.params;
    const { note } = await parseOptionalJsonBody(request, ChangeLogNoteSchema);

    await softDeletePlaceholder(user, placeholderId, note);

    return noContent();
  } catch (error) {
    return apiErrorResponse(error);
  }
}
