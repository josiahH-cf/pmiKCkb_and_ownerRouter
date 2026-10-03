import { NextResponse } from "next/server";
import {
  AuthError,
  authErrorResponse,
  createAuthenticatedSession,
  getCurrentUser,
  getSessionCookieName,
} from "@/lib/auth/session";

/**
 * S165: answers only whether this browser is holding a usable staff session. The sign-in page asks
 * once after the session cookie is issued, so a browser that did not keep the cookie is told so
 * instead of bouncing back to sign-in. It returns no identity, role or other account detail.
 */
export async function GET() {
  const headers = { "cache-control": "no-store" };

  try {
    const user = await getCurrentUser();
    return new NextResponse(null, { status: user ? 204 : 401, headers });
  } catch {
    // A present but refused identity (for example a disallowed hosted domain) is not a session.
    return new NextResponse(null, { status: 401, headers });
  }
}

export async function POST(request: Request) {
  try {
    const idToken = readBearerToken(request.headers.get("authorization"));
    const { maxAgeSeconds, sessionCookie, user } =
      await createAuthenticatedSession(idToken);
    const response = NextResponse.json({ user });

    response.cookies.set(getSessionCookieName(), sessionCookie, {
      httpOnly: true,
      maxAge: maxAgeSeconds,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE() {
  const response = new NextResponse(null, { status: 204 });

  response.cookies.set(getSessionCookieName(), "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

function readBearerToken(authorization: string | null) {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];

  if (!token) {
    throw new AuthError("Authentication is required.", 401);
  }

  return token;
}
