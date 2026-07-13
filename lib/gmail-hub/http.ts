import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api/editable";
import { GmailBoundaryError } from "@/lib/gmail-hub/contracts";
import { GmailPushAuthError } from "@/lib/gmail-hub/pubsub";
import { GmailAmbiguousSendError, GmailHubError } from "@/lib/gmail-hub/service";
import { GmailStateError } from "@/lib/gmail-hub/state-store";
import { GmailRuntimeError } from "@/lib/gmail-runtime/client";
import { GmailSubjectError } from "@/lib/gmail-runtime/subject";

export function gmailHubErrorResponse(error: unknown) {
  if (
    error instanceof GmailHubError ||
    error instanceof GmailStateError ||
    error instanceof GmailBoundaryError ||
    error instanceof GmailPushAuthError
  ) {
    return NextResponse.json(
      {
        error: error.message,
        ...(error instanceof GmailAmbiguousSendError ? { status: "ambiguous" } : {}),
      },
      { status: error.status },
    );
  }
  if (error instanceof GmailSubjectError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof GmailRuntimeError) {
    return NextResponse.json(
      { error: "Gmail could not complete the request.", status: "gmail_error" },
      { status: error.status === 403 ? 403 : 502 },
    );
  }
  return apiErrorResponse(error);
}

export function readAllowedQuery(request: Request, allowed: readonly string[]) {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (!allowed.includes(key)) {
      throw new GmailHubError(`Unexpected Gmail query parameter: ${key}.`, 409);
    }
  }
  return params;
}
