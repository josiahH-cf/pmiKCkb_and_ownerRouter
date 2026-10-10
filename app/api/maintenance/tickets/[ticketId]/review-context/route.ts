import { z } from "zod";
import { EditableLayerError } from "@/lib/firestore/errors";
import { NextResponse } from "next/server";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { requireOperationsLiveContext } from "@/lib/operations/live-context";
import { apiErrorResponse } from "@/lib/api/editable";
import { readMaintenanceReviewContext } from "@/lib/firestore/maintenance-case-records";
export async function GET(
  request: Request,
  context: { params: Promise<{ ticketId: string }> },
) {
  try {
    const actor = await requireCapabilityInSpace("read", "maintenance");
    requireOperationsLiveContext();
    if (new URL(request.url).searchParams.size)
      return NextResponse.json(
        { error: "Unexpected review query." },
        { status: 400, headers: { "cache-control": "private, no-store" } },
      );
    const target = z
      .string()
      .min(1)
      .max(200)
      .regex(/^[^/]+$/)
      .safeParse((await context.params).ticketId);
    if (!target.success)
      throw new EditableLayerError("Choose one actual maintenance case.", 400);
    return NextResponse.json(await readMaintenanceReviewContext(actor, target.data), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    const response = apiErrorResponse(error);
    response.headers.set("cache-control", "private, no-store");
    return response;
  }
}
