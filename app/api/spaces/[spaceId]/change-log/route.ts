import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { listSpaceChangeLog } from "@/lib/firestore/change-log";

interface RouteContext {
  params: Promise<{ spaceId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCapability("read");
    const { spaceId } = await context.params;
    const changeLog = await listSpaceChangeLog(user, spaceId);

    return NextResponse.json({ changeLog });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
