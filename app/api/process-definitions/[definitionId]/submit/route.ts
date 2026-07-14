import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";

interface RouteContext {
  params: Promise<{ definitionId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireCapability("edit");
    await context.params;
    await request.text();
    return NextResponse.json(
      {
        error:
          "Approval Queue submission is retired for content publication. Use the validated publish action.",
      },
      { status: 409 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
