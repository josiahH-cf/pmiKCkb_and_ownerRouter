import { NextResponse } from "next/server";
import { z } from "zod";
import {
  LOCAL_DEMO_ROLES,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  getSessionCookieName,
  isLocalDemoAuthEnabled,
  localDemoSessionValue,
  localDemoUser,
} from "@/lib/auth/session";

const DemoSessionRequestSchema = z.object({
  role: z.enum(LOCAL_DEMO_ROLES).default("Admin"),
});

export async function POST(request: Request) {
  if (!isLocalDemoAuthEnabled()) {
    return NextResponse.json(
      { error: "Local demo auth is not enabled." },
      { status: 403 },
    );
  }

  let requestedRole: (typeof LOCAL_DEMO_ROLES)[number] = "Admin";

  const rawBody = await request.text();

  if (rawBody.trim().length > 0) {
    let parsedBody: unknown;

    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = DemoSessionRequestSchema.safeParse(parsedBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid demo session request.", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    requestedRole = parsed.data.role;
  }

  const user = localDemoUser(requestedRole);

  const response = NextResponse.json({
    user: {
      role: user.role,
      uid: user.uid,
    },
  });

  response.cookies.set(getSessionCookieName(), localDemoSessionValue(requestedRole), {
    httpOnly: true,
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: false,
  });

  return response;
}
