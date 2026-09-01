import { NextResponse } from "next/server";

import {
  AccessApplyCommandSchema,
  applyAccessDecision,
} from "@/lib/access/apply-service";
import { accessApiErrorResponse, readStrictAccessJson } from "@/lib/access/http";
import { requireUser } from "@/lib/auth/session";

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const actor = await requireUser();
    const command = await readStrictAccessJson(
      request,
      AccessApplyCommandSchema,
      16 * 1024,
    );
    const { requestId } = await context.params;
    if (command.preview.request_ref !== requestId) {
      return NextResponse.json(
        { error: "The apply preview does not match this request." },
        { status: 409 },
      );
    }
    return NextResponse.json(await applyAccessDecision(actor, command));
  } catch (error) {
    return accessApiErrorResponse(error);
  }
}
