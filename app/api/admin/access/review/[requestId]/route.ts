import { NextResponse } from "next/server";

import { accessApiErrorResponse } from "@/lib/access/http";
import { getAdminAccessRequestDetail } from "@/lib/access/request-service";
import { requireUser } from "@/lib/auth/session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const actor = await requireUser();
    const { requestId } = await context.params;
    return NextResponse.json(await getAdminAccessRequestDetail(actor, requestId));
  } catch (error) {
    return accessApiErrorResponse(error);
  }
}
