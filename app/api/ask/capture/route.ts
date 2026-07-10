import { NextResponse } from "next/server";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { createPlaceholder } from "@/lib/firestore/editable";
import { AskCaptureRequestSchema } from "@/lib/schemas";
import { assertSpaceIdAccess } from "@/lib/space-scope-resources";

export async function POST(request: Request) {
  try {
    const user = await requireCapability("edit");
    const input = await parseJsonBody(request, AskCaptureRequestSchema);
    assertSpaceIdAccess(user, input.space_id);
    const placeholder = await createPlaceholder(user, input.space_id, {
      missing_detail: input.question,
      note: `Captured from Ask: ${input.source_state}.`,
      owner_uid: input.owner_uid ?? user.uid,
      priority: input.priority,
      related_sop_id: input.related_sop_id,
      source_hint: input.source_hint ?? input.source_state,
      status: "Open",
    });

    return NextResponse.json({ placeholder }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
