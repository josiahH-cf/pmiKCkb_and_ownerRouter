import { NextResponse } from "next/server";
import { apiErrorResponse, createdJson, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { createTemplate, listTemplates } from "@/lib/firestore/editable";
import { CreateTemplateInputSchema } from "@/lib/firestore/schemas";

interface RouteContext {
  params: Promise<{ spaceId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { spaceId } = await context.params;
    const records = await listTemplates(user, spaceId);

    return NextResponse.json({ templates: records });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { spaceId } = await context.params;
    const input = await parseJsonBody(request, CreateTemplateInputSchema);
    const record = await createTemplate(user, spaceId, input);

    return createdJson({ template: record });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
