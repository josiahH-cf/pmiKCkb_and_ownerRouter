import { type NextRequest, NextResponse } from "next/server";

import { resolveEnvironmentDescriptor } from "@/lib/environment/descriptor";
import { decideLiveReadonlyRequest } from "@/lib/environment/live-readonly-request-policy";
import {
  authenticateSessionCookie,
  getSessionCookieName,
  readLocalDemoSessionRole,
} from "@/lib/auth/session";
import {
  allowsVerificationRequest,
  isVerificationAccount,
} from "@/lib/auth/canary-policy";

/**
 * S56's request-wide local rehearsal fence. The matcher includes both API and page routes so a
 * server action cannot bypass the API policy. Static assets are omitted because they cannot create
 * an application effect.
 */
export function proxy(request: NextRequest) {
  return applyRequestPolicies(request);
}

async function applyRequestPolicies(request: NextRequest) {
  const decision = decideLiveReadonlyRequest({
    descriptor: resolveEnvironmentDescriptor(),
    method: request.method,
    pathname: request.nextUrl.pathname,
    searchParams: request.nextUrl.searchParams,
  });
  if (!decision.allowed) {
    return NextResponse.json(
      { error: decision.message, error_type: decision.errorType },
      { status: decision.status, headers: { "cache-control": "no-store" } },
    );
  }
  const session = request.cookies.get(getSessionCookieName())?.value;
  if (
    session &&
    // Reuse the server-gated local session contract. Production never accepts this exception.
    !readLocalDemoSessionRole(session) &&
    !allowsVerificationRequest({
      method: request.method,
      pathname: request.nextUrl.pathname,
      searchParams: request.nextUrl.searchParams,
    })
  ) {
    try {
      const user = await authenticateSessionCookie(session);
      if (isVerificationAccount(user)) {
        return NextResponse.json(
          {
            error: "Verification accounts can only read.",
            error_type: "canary_read_only",
          },
          { status: 403, headers: { "cache-control": "no-store" } },
        );
      }
    } catch {
      // Do not forward a possibly valid canary cookie after a transient verification failure.
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
