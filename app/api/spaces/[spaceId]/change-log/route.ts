import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { listSpaceChangeLog } from "@/lib/firestore/change-log";
import { assertSpaceIdAccess } from "@/lib/space-scope-resources";

interface RouteContext {
  params: Promise<{ spaceId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { spaceId } = await context.params;
    // SPACE-1: the change log is space-scoped operational history; a restricted principal may only
    // read the log for a Space they can access (an unscoped principal still reads every Space).
    assertSpaceIdAccess(user, spaceId);
    const changeLog = await listSpaceChangeLog(user, spaceId);

    return NextResponse.json({ changeLog });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
