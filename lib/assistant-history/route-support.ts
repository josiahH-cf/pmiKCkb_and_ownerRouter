// S148 shared route support for the owner-scoped history and saved-question routes: the
// verification-account boundary and one bodyless log line per operation. Counts and outcomes
// only; never a question, an answer, an id or a value.

import { NextResponse } from "next/server";

import { isVerificationAccount } from "@/lib/auth/canary-policy";
import type { AuthenticatedUser } from "@/lib/auth/session";

export const VERIFICATION_NOT_PERSISTED_MESSAGE =
  "History is not saved for verification accounts.";

/** Verification accounts stay effect-free: their turns are answered and never stored. */
export function refuseVerificationWrite(user: AuthenticatedUser): NextResponse | null {
  if (!isVerificationAccount(user)) return null;
  return NextResponse.json(
    {
      error: VERIFICATION_NOT_PERSISTED_MESSAGE,
      error_type: "verification_account_not_persisted",
    },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}

export function isHistoryPersisted(user: AuthenticatedUser): boolean {
  return !isVerificationAccount(user);
}

export type HistoryLogOperation =
  | "list"
  | "open"
  | "begin"
  | "finalize"
  | "saved_list"
  | "save"
  | "pin"
  | "run";

/** One bodyless line per history operation, so production logs can count them without content. */
export function logHistoryOperation(
  operation: HistoryLogOperation,
  outcome: "ok" | "refused" | "error",
  counts: Readonly<Record<string, number | boolean>> = {},
): void {
  console.info(
    JSON.stringify({ event: "assistant_history", operation, outcome, ...counts }),
  );
}

export const NO_STORE = { "cache-control": "no-store" } as const;
