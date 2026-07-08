import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { UserManagementError, setAppUserRole } from "@/lib/admin/users";

const SetRoleBodySchema = z.object({
  role: z.enum(["Editor", "Approver", "Admin"]),
  reason: z.string().trim().min(3, "A plain-English reason is required."),
});

interface RouteContext {
  params: Promise<{ uid: string }>;
}

// PATCH /api/admin/users/:uid — change a user's role. Admin-only via manageAdmin. The role claim
// change and the audit record happen in setAppUserRole (last-Admin + domain guards there).
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireCapability("manageAdmin");
    const { uid } = await context.params;
    const { role, reason } = await parseJsonBody(request, SetRoleBodySchema);
    const user = await setAppUserRole({ actor, targetUid: uid, role, reason });
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof UserManagementError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return apiErrorResponse(error);
  }
}
