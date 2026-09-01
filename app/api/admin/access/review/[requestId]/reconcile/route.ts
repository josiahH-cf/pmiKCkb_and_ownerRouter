import { NextResponse } from "next/server";
import { z } from "zod";

import { reconcileAccessRequest } from "@/lib/access/apply-service";
import { accessApiErrorResponse, readStrictAccessJson } from "@/lib/access/http";
import { requireUser } from "@/lib/auth/session";

const CommandSchema = z
  .object({ schema_version: z.literal("access-request-reconcile-command-v1") })
  .strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const actor = await requireUser();
    await readStrictAccessJson(request, CommandSchema, 1024);
    const { requestId } = await context.params;
    return NextResponse.json(await reconcileAccessRequest(actor, requestId));
  } catch (error) {
    return accessApiErrorResponse(error);
  }
}
