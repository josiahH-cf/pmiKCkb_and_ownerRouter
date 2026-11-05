import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  SaveOwnerExplanationStartingTextSchema,
  readOwnerExplanationStartingText,
  saveOwnerExplanationStartingText,
} from "@/lib/firestore/lease-owner-explanation-starting-text";

// S253 (R-S253-7): Admin surface for the team's starting text for the owner acknowledgment
// explanation. GET returns the current text; POST replaces it against the revision the page
// loaded. Admin-only, server-only writes. The application ships no starting text, and nothing here
// reads a lease's explanation, changes a lease's saved inputs or reaches a provider.
export async function GET() {
  try {
    await requireCapability("manageAdmin");
    return NextResponse.json(
      { startingText: await readOwnerExplanationStartingText() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, SaveOwnerExplanationStartingTextSchema);
    return NextResponse.json(await saveOwnerExplanationStartingText(user, input), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
