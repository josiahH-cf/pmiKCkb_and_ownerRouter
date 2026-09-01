import { NextResponse } from "next/server";

import { AccessDenyCommandSchema, denyAccessRequest } from "@/lib/access/apply-service";
import { accessApiErrorResponse, readStrictAccessJson } from "@/lib/access/http";
import { requireUser } from "@/lib/auth/session";

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const actor = await requireUser();
    const command = await readStrictAccessJson(request, AccessDenyCommandSchema, 2048);
    const { requestId } = await context.params;
    return NextResponse.json(await denyAccessRequest(actor, requestId, command));
  } catch (error) {
    return accessApiErrorResponse(error);
  }
}
