import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  readOwnerTransactionalDestination,
  updateOwnerTransactionalDestination,
} from "@/lib/firestore/owner-transactional-destination";
import { UpdateOwnerTransactionalDestinationInputSchema } from "@/lib/firestore/schemas";

// Owner transactional/notice destination (D-1 support). App-wide Admin config, so this guards on the
// manageAdmin capability directly (not space-scoped). GET returns the current or seeded default;
// PATCH persists an Admin edit. Nothing here sends or drafts email.
export async function GET() {
  try {
    const user = await requireCapability("manageAdmin");
    const destination = await readOwnerTransactionalDestination(user);
    return NextResponse.json({ destination });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(
      request,
      UpdateOwnerTransactionalDestinationInputSchema,
    );
    const destination = await updateOwnerTransactionalDestination(user, input);
    return NextResponse.json({ destination });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
