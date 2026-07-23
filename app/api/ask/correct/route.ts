import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { writeAskCorrection } from "@/lib/firestore/ask-corrections";
import { CorrectionRequestSchema } from "@/lib/schemas";
import { assertSpaceIdAccess } from "@/lib/space-scope-resources";

// S32: file a plain-language correction on an Ask answer. It appends ONE Proposed-only review record and
// changes nothing else — no re-run, no answer/citation/KB/source-meta/model mutation. An Admin reviews
// Proposed corrections separately. Requires `edit` (mirrors the capture-task control it sits beside).
export async function POST(request: Request) {
  try {
    const user = await requireCapability("edit");
    const input = await parseJsonBody(request, CorrectionRequestSchema);
    assertSpaceIdAccess(user, input.space_id);
    const correction = await writeAskCorrection(user, input);
    return NextResponse.json({ correction }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
