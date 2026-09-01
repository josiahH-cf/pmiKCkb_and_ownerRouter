import { NextResponse } from "next/server";

import { AccessRequestPreviewCommandSchema } from "@/lib/access/contracts";
import { accessApiErrorResponse, readStrictAccessJson } from "@/lib/access/http";
import { previewAccessRequest } from "@/lib/access/request-service";
import { requireUser } from "@/lib/auth/session";

const MAX_PREVIEW_BYTES = 16 * 1024;

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    const command = await readStrictAccessJson(
      request,
      AccessRequestPreviewCommandSchema,
      MAX_PREVIEW_BYTES,
    );
    return NextResponse.json(await previewAccessRequest(actor, command));
  } catch (error) {
    return accessApiErrorResponse(error);
  }
}
