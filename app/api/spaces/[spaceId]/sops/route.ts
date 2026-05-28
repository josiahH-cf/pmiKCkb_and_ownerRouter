import { NextResponse } from "next/server";
import { apiErrorResponse, createdJson, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { createSop, listSops } from "@/lib/firestore/editable";
import { CreateSopInputSchema } from "@/lib/firestore/schemas";

interface RouteContext {
  params: Promise<{ spaceId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { spaceId } = await context.params;
    const records = await listSops(user, spaceId);

    return NextResponse.json({ sops: records });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("edit");
    const { spaceId } = await context.params;
    const input = await parseJsonBody(request, CreateSopInputSchema);
    const record = await createSop(user, spaceId, input);

    return createdJson({ sop: record });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
