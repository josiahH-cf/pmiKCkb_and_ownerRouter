import type { EnvironmentDescriptorResult } from "@/lib/environment/descriptor";

/**
 * Non-safe HTTP operations that were reviewed as non-persisting reads/computation for local
 * rehearsal. Everything else is refused by default. The value documents why the exception exists;
 * the key is deliberately exact so a sibling or newly added route does not inherit authority.
 */
export const LIVE_READONLY_ALLOWED_NON_SAFE_REQUESTS: ReadonlyMap<string, string> =
  new Map([
    ["DELETE /api/auth/session", "Remove the local staff session cookie."],
    ["DELETE /api/vendor/auth/session", "Remove the local Vendor session cookie."],
    ["POST /api/ask", "Retrieve and answer without persisting an Ask log."],
    [
      "POST /api/assistant/query",
      "Answer a Dashboard question from the owning services as the signed-in user. The body carries the question text and the page session conversation context, which is why it is a POST rather than a query string; no path writes, sends, drafts, starts a run, or refreshes a provider.",
    ],
    ["POST /api/ask/live-target", "Read one authoritative RentVine target."],
    ["POST /api/ask/transcribe", "Transcribe into an unsaved Console input."],
    ["POST /api/auth/demo", "Create only the local rehearsal session cookie."],
    ["POST /api/auth/session", "Create only the authenticated staff session cookie."],
    ["POST /api/connections/verify", "Run a read-only provider health probe."],
    [
      "POST /api/email-refinement",
      "Propose a revised wording for one workflow-linked draft from its owning record; nothing is saved, drafted or sent.",
    ],
    ["POST /api/maintenance/match-unit", "Read and match authoritative RentVine units."],
    ["POST /api/maintenance/transcribe", "Transcribe into an unsaved intake input."],
    ["POST /api/processes/classify", "Classify against read-only process definitions."],
    ["POST /api/report-issue/transcribe", "Transcribe into an unsaved feedback input."],
    ["POST /api/vendor/auth/session", "Create only the Vendor session cookie."],
  ]);

/**
 * S148-S150: the signed-in user's own AI history writes, and S166: the signed-in account's own
 * remembered worklist view. Under Live-read-only they are allowed only when
 * every Firestore write goes to a local emulator (FIRESTORE_EMULATOR_HOST is set, as in the
 * automated E2E harness), so the owner-scoped history path can be exercised end to end without
 * touching a real project. Against a real project they stay refused like every other write.
 */
export const EMULATOR_ONLY_HISTORY_REQUESTS: readonly {
  readonly method: string;
  readonly pattern: RegExp;
  readonly reason: string;
}[] = [
  {
    method: "POST",
    pattern: /^\/api\/personal-view$/,
    reason:
      "S177: save only the signed-in staff account's personal view in the emulator.",
  },
  {
    method: "POST",
    pattern: /^\/api\/assistant\/history\/turns$/,
    reason: "Record a submitted question in the signed-in user's own emulator history.",
  },
  {
    method: "PUT",
    pattern: /^\/api\/assistant\/history\/turns\/[A-Za-z0-9-]{8,64}$/,
    reason: "Finish one of the signed-in user's own emulator history turns.",
  },
  {
    method: "POST",
    pattern: /^\/api\/assistant\/saved$/,
    reason: "S149: save one of the signed-in user's own emulator history turns.",
  },
  {
    method: "PATCH",
    pattern: /^\/api\/assistant\/saved\/[a-f0-9]{32}$/,
    reason: "S149: pin, unpin or relabel one of the user's own emulator saved questions.",
  },
  {
    method: "POST",
    pattern: /^\/api\/assistant\/saved\/[a-f0-9]{32}\/run$/,
    reason:
      "S150: run a saved question read-only and record the result in emulator history.",
  },
  {
    method: "POST",
    pattern: /^\/api\/lease-renewal\/desk-preferences$/,
    reason:
      "S166: remember the signed-in account's own worklist view in the emulator store.",
  },
];

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type LiveReadonlyRequestDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly errorType: "EnvironmentDescriptorInvalid" | "LiveReadOnlyMutationRefused";
      readonly message: string;
      readonly status: 409 | 503;
    };

/**
 * Fail-closed HTTP boundary for Demo + Live-read-only. It covers route handlers and page/server
 * actions because the Next proxy applies to both API and page paths. Production+Live and Demo+Demo
 * retain their existing behavior; only the explicitly selected inspection context is narrowed.
 */
export function decideLiveReadonlyRequest(input: {
  readonly descriptor: EnvironmentDescriptorResult;
  readonly method: string;
  readonly pathname: string;
  readonly searchParams?: Pick<URLSearchParams, "get">;
  /** True only when Firestore is a local emulator (FIRESTORE_EMULATOR_HOST is set). */
  readonly firestoreEmulator?: boolean;
}): LiveReadonlyRequestDecision {
  const method = input.method.trim().toUpperCase();

  if (!input.descriptor.ok) {
    return {
      allowed: false,
      errorType: "EnvironmentDescriptorInvalid",
      message:
        "This operation is unavailable because the server environment is not confirmed.",
      status: 503,
    };
  }

  if (input.descriptor.descriptor.dataContext !== "live_readonly") {
    return { allowed: true };
  }

  // This legacy handler uses GET for reconciliation, but reconciliation can settle or update the
  // durable execution ledger. Treat the semantic operation as a mutation regardless of its verb.
  if (
    method === "GET" &&
    input.pathname === "/api/lease-renewal/comp-screenshot" &&
    input.searchParams?.get("operation") === "reconcile"
  ) {
    return {
      allowed: false,
      errorType: "LiveReadOnlyMutationRefused",
      message: "Live data is read only in the local rehearsal surface.",
      status: 409,
    };
  }

  if (SAFE_HTTP_METHODS.has(method)) return { allowed: true };

  const key = `${method} ${input.pathname}`;
  if (LIVE_READONLY_ALLOWED_NON_SAFE_REQUESTS.has(key)) return { allowed: true };
  if (
    input.firestoreEmulator === true &&
    EMULATOR_ONLY_HISTORY_REQUESTS.some(
      (entry) => entry.method === method && entry.pattern.test(input.pathname),
    )
  ) {
    return { allowed: true };
  }

  return {
    allowed: false,
    errorType: "LiveReadOnlyMutationRefused",
    message: "Live data is read only in the local rehearsal surface.",
    status: 409,
  };
}
