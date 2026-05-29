import { NextResponse } from "next/server";
import { apiErrorResponse, createdJson, parseJsonBody } from "@/lib/api/editable";
import { notifyPlaceholderQueueChange } from "@/lib/approval/notifications";
import { requireCapability } from "@/lib/auth/session";
import { createPlaceholder, listPlaceholders } from "@/lib/firestore/editable";
import { CreatePlaceholderInputSchema } from "@/lib/firestore/schemas";

interface RouteContext {
  params: Promise<{ spaceId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { spaceId } = await context.params;
    const records = await listPlaceholders(user, spaceId);

    return NextResponse.json({ placeholders: records });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { spaceId } = await context.params;
    const input = await parseJsonBody(request, CreatePlaceholderInputSchema);
    const record = await createPlaceholder(user, spaceId, input);

    await notifyPlaceholderQueueChange(user, record);

    return createdJson({ placeholder: record });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
