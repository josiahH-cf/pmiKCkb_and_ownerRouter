import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  noContent,
  parseJsonBody,
  parseOptionalJsonBody,
} from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { getTool, softDeleteTool, updateTool } from "@/lib/firestore/editable";
import { ChangeLogNoteSchema, UpdateToolInputSchema } from "@/lib/firestore/schemas";

interface RouteContext {
  params: Promise<{ toolId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { toolId } = await context.params;
    const record = await getTool(user, toolId);

    return NextResponse.json({ tool: record });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { toolId } = await context.params;
    const input = await parseJsonBody(request, UpdateToolInputSchema);
    const record = await updateTool(user, toolId, input);

    return NextResponse.json({ tool: record });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("softDelete");
    const { toolId } = await context.params;
    const { note } = await parseOptionalJsonBody(request, ChangeLogNoteSchema);

    await softDeleteTool(user, toolId, note);

    return noContent();
  } catch (error) {
    return apiErrorResponse(error);
  }
}
