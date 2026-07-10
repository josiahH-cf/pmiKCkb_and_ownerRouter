import { NextResponse } from "next/server";
import { z } from "zod";
import { UserManagementError, setAppUserScopes } from "@/lib/admin/users";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { SPACE_SCOPES } from "@/lib/constants";

const SetScopesBodySchema = z.object({
  // null is the explicit wire representation for All spaces; the service removes the claim.
  scopes: z.array(z.enum(SPACE_SCOPES)).min(1).nullable(),
  reason: z.string().trim().min(3, "A plain-English reason is required."),
});

interface RouteContext {
  params: Promise<{ uid: string }>;
}

// PATCH /api/admin/users/:uid/scopes — narrow space reach or clear the claim for All spaces.
// The role claim is preserved; the service writes exactly one append-only audit attempt.
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireCapability("manageAdmin");
    const { uid } = await context.params;
    const { scopes, reason } = await parseJsonBody(request, SetScopesBodySchema);
    const user = await setAppUserScopes({
      actor,
      targetUid: uid,
      scopes: scopes ?? undefined,
      reason,
    });
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof UserManagementError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return apiErrorResponse(error);
  }
}
