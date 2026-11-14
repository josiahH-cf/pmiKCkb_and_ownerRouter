import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/editable";
import { EnvironmentContextError } from "@/lib/environment/descriptor";
import { GmailBoundaryError } from "@/lib/gmail-hub/contracts";
import { GmailPushAuthError } from "@/lib/gmail-hub/pubsub";
import {
  GmailAmbiguousSendError,
  GmailAmbiguousWatchError,
  GmailHubError,
} from "@/lib/gmail-hub/service";
import { GmailStateError } from "@/lib/gmail-hub/state-store";
import { GmailRuntimeError } from "@/lib/gmail-runtime/client";
import { GmailSubjectError } from "@/lib/gmail-runtime/subject";
import { ActionRuntimeSuspendedError } from "@/lib/operations/runtime-suspension-gate";
import {
  CommunicationTargetChangedError,
  LeaseReadNotSettledError,
} from "@/lib/gmail-hub/reviewed-inputs";
import { CommunicationSequenceRefusedError } from "@/lib/gmail-hub/current-message";

export function gmailHubErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Invalid Gmail workflow context." },
      { status: 400 },
    );
  }
  if (error instanceof ActionRuntimeSuspendedError) {
    return NextResponse.json(
      { code: error.code, error: error.message },
      { status: error.status },
    );
  }
  if (error instanceof EnvironmentContextError) {
    return NextResponse.json(
      {
        code: "environment_context_not_allowed",
        error: error.message,
      },
      { status: 409 },
    );
  }
  if (
    error instanceof GmailHubError ||
    error instanceof GmailStateError ||
    error instanceof GmailBoundaryError ||
    error instanceof GmailPushAuthError
  ) {
    return NextResponse.json(
      {
        error: error.message,
        ...(error instanceof GmailAmbiguousSendError ||
        error instanceof GmailAmbiguousWatchError
          ? { status: "ambiguous" }
          : {}),
      },
      { status: error.status },
    );
  }
  if (error instanceof GmailSubjectError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  // S274 R-S274-3: a lease read still settling is a distinct, retryable result; nothing was sent.
  if (error instanceof LeaseReadNotSettledError) {
    return NextResponse.json(
      {
        code: error.code,
        reason: error.reason,
        retryable: true,
        error: error.message,
      },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  // S274 R-S274-5: a settled difference, with each changed input the review displayed.
  if (error instanceof CommunicationTargetChangedError) {
    return NextResponse.json(
      { code: error.code, changes: error.changes, error: error.message },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  // S272 R-S272-6: one typed refusal reason with the related communication and changed values;
  // the staff text derives from it in one place (`describeSequenceRefusal`).
  if (error instanceof CommunicationSequenceRefusedError) {
    return NextResponse.json(
      { code: error.code, refusal: error.refusal, error: error.message },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } },
    );
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
