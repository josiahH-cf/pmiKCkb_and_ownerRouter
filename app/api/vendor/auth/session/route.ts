import { NextResponse } from "next/server";

import { getSessionCookieName } from "@/lib/auth/session";
import { createVendorSession, vendorErrorResponse } from "@/lib/vendor/auth";
import { VendorBoundaryError } from "@/lib/vendor/model";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) throw new VendorBoundaryError("Vendor authentication is required.", 401);
    const { principal, sessionCookie, maxAgeSeconds } = await createVendorSession(token);
    const response = NextResponse.json({
      vendor: {
        vendorId: principal.vendorId,
        email: principal.email,
        emailVerified: true,
        totpVerified: true,
      },
    });
    response.cookies.set(getSessionCookieName(), sessionCookie, {
      httpOnly: true,
      maxAge: maxAgeSeconds,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    return vendorErrorResponse(error);
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
