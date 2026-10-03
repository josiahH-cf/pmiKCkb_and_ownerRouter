import { NextResponse } from "next/server";
import {
  AUTH_HELPER_FORWARDED_REQUEST_HEADERS,
  AUTH_HELPER_RETURNED_RESPONSE_HEADERS,
  resolveAuthHelperUpstream,
} from "@/lib/auth/auth-helper-proxy";

/**
 * S165: serves Firebase's Google sign-in helper pages from the app's own origin. The browser asks
 * for /__/auth/* (rewritten here by next.config.ts); this handler relays the matching page from
 * this project's Firebase helper domain. It is deliberately a session-less read:
 *
 * - it is the sign-in helper, so it must answer before anyone is signed in;
 * - it relays only GET requests for the fixed helper locations of this project's helper domain;
 * - it forwards no cookie and no authorization header, and relays no upstream cookie;
 * - it answers 404 until NEXT_PUBLIC_FIREBASE_SAME_ORIGIN_AUTH_HOST is set, which is the explicit
 *   statement that the app's own /__/auth/handler is registered as a Google redirect address.
 *
 * It establishes no session and grants nothing. Sessions are still created only by
 * POST /api/auth/session from a verified Google ID token.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const upstream = resolveAuthHelperUpstream({
    sameOriginAuthHost: process.env.NEXT_PUBLIC_FIREBASE_SAME_ORIGIN_AUTH_HOST,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    segments: path,
    search: new URL(request.url).search,
  });

  if (!upstream) {
    return emptyResponse(404);
  }

  const headers = pickHeaders(request.headers, AUTH_HELPER_FORWARDED_REQUEST_HEADERS);

  let relayed: Response;
  try {
    relayed = await fetch(upstream, {
      cache: "no-store",
      headers,
      method: "GET",
      redirect: "manual",
    });
  } catch {
    return emptyResponse(502);
  }

  // The helper pages are plain documents and scripts. An upstream redirect would move the browser
  // off this origin, which is exactly what this route exists to avoid, so it is not followed.
  if (relayed.status >= 300 && relayed.status < 400) {
    return emptyResponse(502);
  }

  return new NextResponse(relayed.body, {
    headers: pickHeaders(relayed.headers, AUTH_HELPER_RETURNED_RESPONSE_HEADERS),
    status: relayed.status,
  });
}

function pickHeaders(source: Headers, names: readonly string[]) {
  const picked: Record<string, string> = {};
  for (const name of names) {
    const value = source.get(name);
    if (value) picked[name] = value;
  }
  return picked;
}

function emptyResponse(status: 404 | 502) {
  return new NextResponse(null, { headers: { "cache-control": "no-store" }, status });
}
