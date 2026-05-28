import { NextResponse } from "next/server";
import {
  LOCAL_DEMO_SESSION_VALUE,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  getSessionCookieName,
  isLocalDemoAuthEnabled,
} from "@/lib/auth/session";

export async function POST() {
  if (!isLocalDemoAuthEnabled()) {
    return NextResponse.json(
      { error: "Local demo auth is not enabled." },
      { status: 403 },
    );
  }

  const response = NextResponse.json({
    user: {
      role: "Admin",
      uid: "local-demo-admin",
    },
  });

  response.cookies.set(getSessionCookieName(), LOCAL_DEMO_SESSION_VALUE, {
    httpOnly: true,
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: false,
  });

  return response;
}
