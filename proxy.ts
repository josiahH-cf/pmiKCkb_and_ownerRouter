import { type NextRequest, NextResponse } from "next/server";

import { resolveEnvironmentDescriptor } from "@/lib/environment/descriptor";
import { decideLiveReadonlyRequest } from "@/lib/environment/live-readonly-request-policy";

/**
 * S56's request-wide local rehearsal fence. The matcher includes both API and page routes so a
 * server action cannot bypass the API policy. Static assets are omitted because they cannot create
 * an application effect.
 */
export function proxy(request: NextRequest) {
  const decision = decideLiveReadonlyRequest({
    descriptor: resolveEnvironmentDescriptor(),
    method: request.method,
    pathname: request.nextUrl.pathname,
    searchParams: request.nextUrl.searchParams,
  });

  if (decision.allowed) return NextResponse.next();

  return NextResponse.json(
    {
      error: decision.message,
      error_type: decision.errorType,
    },
    {
      status: decision.status,
      headers: { "cache-control": "no-store" },
    },
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
