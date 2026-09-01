import { NextResponse } from "next/server";

import { AccessRequestCancelCommandSchema } from "@/lib/access/contracts";
import { accessApiErrorResponse, readStrictAccessJson } from "@/lib/access/http";
import { cancelAccessRequest } from "@/lib/access/request-service";
import { requireUser } from "@/lib/auth/session";

interface RouteContext {
  params: Promise<{ requestId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    const command = await readStrictAccessJson(
      request,
      AccessRequestCancelCommandSchema,
      1024,
    );
    const { requestId } = await context.params;
    return NextResponse.json(await cancelAccessRequest(actor, requestId, command));
  } catch (error) {
    return accessApiErrorResponse(error);
  }
}
