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
    ["POST /api/ask/live-target", "Read one authoritative RentVine target."],
    ["POST /api/ask/transcribe", "Transcribe into an unsaved Console input."],
    ["POST /api/auth/demo", "Create only the local rehearsal session cookie."],
    ["POST /api/auth/session", "Create only the authenticated staff session cookie."],
    ["POST /api/connections/verify", "Run a read-only provider health probe."],
    ["POST /api/maintenance/match-unit", "Read and match authoritative RentVine units."],
    ["POST /api/maintenance/transcribe", "Transcribe into an unsaved intake input."],
    ["POST /api/processes/classify", "Classify against read-only process definitions."],
    ["POST /api/vendor/auth/session", "Create only the Vendor session cookie."],
  ]);

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

  return {
    allowed: false,
    errorType: "LiveReadOnlyMutationRefused",
    message: "Live data is read only in the local rehearsal surface.",
    status: 409,
  };
}
