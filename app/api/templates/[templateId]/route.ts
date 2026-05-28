import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  noContent,
  parseJsonBody,
  parseOptionalJsonBody,
} from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  getTemplate,
  softDeleteTemplate,
  updateTemplate,
} from "@/lib/firestore/editable";
import { ChangeLogNoteSchema, UpdateTemplateInputSchema } from "@/lib/firestore/schemas";

interface RouteContext {
  params: Promise<{ templateId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { templateId } = await context.params;
    const record = await getTemplate(user, templateId);

    return NextResponse.json({ template: record });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { templateId } = await context.params;
    const input = await parseJsonBody(request, UpdateTemplateInputSchema);
    const record = await updateTemplate(user, templateId, input);

    return NextResponse.json({ template: record });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("softDelete");
    const { templateId } = await context.params;
    const { note } = await parseOptionalJsonBody(request, ChangeLogNoteSchema);

    await softDeleteTemplate(user, templateId, note);

    return noContent();
  } catch (error) {
    return apiErrorResponse(error);
  }
}
