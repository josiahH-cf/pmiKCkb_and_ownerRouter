import { NextResponse } from "next/server";
import {
  AuthError,
  authErrorResponse,
  createAuthenticatedSession,
  getSessionCookieName,
} from "@/lib/auth/session";

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
