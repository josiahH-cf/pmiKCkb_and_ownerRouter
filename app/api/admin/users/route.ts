import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { listAppUsers } from "@/lib/admin/users";

// GET /api/admin/users — the roster (email, role, last sign-in). Admin-only via manageAdmin.
export async function GET() {
  try {
    await requireCapability("manageAdmin");
    const users = await listAppUsers();
    return NextResponse.json({ users });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
